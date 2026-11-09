/* Réconciliation des fiches : analyse, sauvegarde, fusion ; rien ne se perd (achats, groupes, appel) ;
   deux homonymes aux licences différentes ne sont jamais fusionnés */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, until, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('réconciliation des fiches en double, sans rien perdre, après sauvegarde', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'reconc-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA, ADMIN_EMAILS: 'admin@exemple.test' });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const compte = async (email, first, last) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last }) });
      const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ') };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(x => x.json());
    };
    const admin = await compte('admin@exemple.test', 'Ada', 'Admin');
    const C = await admin('/api/ram/clubs', { name: 'TC Réconcilié', short: 'TCR' });
    const items = async coll => (await admin(`/api/ram/c/${C.id}/sync?since=0`)).items.filter(i => i.coll === coll && !i.deleted);
    // un adhérent sans compte « Marc Petit » et la fiche élève sans compte du même Marc Petit, avec un achat, un groupe et un appel
    await admin(`/api/ram/c/${C.id}/ops`, { ops: [
      { coll: 'member', id: 'mpetit', op: 'put', data: { n: 'Marc Petit', res: [] } },
      { coll: 'eleve', id: 'e7', op: 'put', data: { n: 'Marc Petit', sport: 'Padel', lvl: 4, achats: [{ id: 'h1', nom: 'Pack 10 séances', n: 10, d: '2026-10-01' }] } },
      { coll: 'group', id: 'g1', op: 'put', data: { name: 'Groupe du mardi', type: 'train', ext: ['e7'], mem: [] } },
      { coll: 'seance', id: 'g1.2026-10-07', op: 'put', data: { g: 'g1', d: '2026-10-07', pres: { e7: 'P' } } },
      // deux homonymes aux licences différentes : des personnes distinctes
      { coll: 'eleve', id: 'e8', op: 'put', data: { n: 'Lucie Roux', lic: '1111111A' } },
      { coll: 'eleve', id: 'e9', op: 'put', data: { n: 'Lucie Roux', lic: '2222222B' } }
    ] });
    await until(async () => (await items('eleve')).filter(e => e.data._ja).length === 3, { msg: 'fiches élèves jamais reliées' });
    const a = await admin('/api/admin/reconciliation');
    const relier = a.propositions.find(p => p.type === 'relier');
    assert.ok(relier, 'la fiche élève et l’adhérent du même nom sont proposés : ' + JSON.stringify(a));
    assert.ok(!a.propositions.some(p => /Lucie Roux/.test(p.texte)), 'homonymes aux licences différentes : jamais proposés');
    assert.ok(a.aVerifier.some(x => /Lucie Roux/.test(x.texte)), 'mais signalés à vérifier');
    // un non-administrateur n'y a pas accès
    const autre = await compte('x@exemple.test', 'Xavier', 'X');
    assert.match((await autre('/api/admin/reconciliation')).error || '', /administrateurs/);
    const r = await admin('/api/admin/reconciliation', { ids: [relier.id] });
    assert.equal(r.fait, 1);
    assert.match(r.sauvegarde, /^reconciliation-.*\.json$/);
    assert.ok(fs.readdirSync(path.join(DATA, 'sauvegardes')).some(f => f === r.sauvegarde), 'sauvegarde faite avant la fusion');
    // la fiche élève est maintenant celle de l'adhérent : achat, groupe et appel suivent
    const el = await items('eleve');
    assert.ok(!el.some(e => e.id === 'e7'), 'l’ancienne fiche élève a disparu');
    const fusion = el.find(e => e.id === 'mpetit');
    assert.ok(fusion && fusion.data.achats.some(h => h.id === 'h1'), 'l’achat suit');
    const g = (await items('group')).find(x => x.id === 'g1').data;
    assert.deepEqual([g.ext, g.mem], [[], ['mpetit']]);
    assert.equal((await items('seance')).find(x => x.id === 'g1.2026-10-07').data.pres.mpetit, 'P', 'l’appel suit');
    // plus rien à fusionner pour Marc Petit
    assert.ok(!(await admin('/api/admin/reconciliation')).propositions.some(p => /Marc Petit/.test(p.texte)));
  } finally { srv.kill(); }
});
