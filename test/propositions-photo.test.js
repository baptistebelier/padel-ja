/* Listes de propositions : un adhérent proposé montre sa photo et l'e-mail qu'il partage dans son profil,
   rien de ce qu'il garde pour lui, et jamais rien pour un compte jeune */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort, until, serverReady } = require('./helpers');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');

test('propositions : photo et e-mail partagé de l’adhérent', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const signup = async (email, first, last) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last, club: 'TC Test' }) });
      const cookie = [].concat(r.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
      const H = { 'Content-Type': 'application/json', Cookie: cookie };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => Object.assign(await x.json().catch(() => ({})), { status: x.status }));
    };
    const bur = await signup('b@exemple.test', 'Bea', 'Bureau'), mem = await signup('m@exemple.test', 'Zoé', 'Quintal'), cache = await signup('c@exemple.test', 'Zacharie', 'Quintal'), ja = await signup('j@exemple.test', 'Jean', 'Arbitre');
    const space = await bur('/api/ram/clubs', { name: 'TC Test', short: 'TCT' });
    const season = (await bur(`/api/ram/c/${space.id}/sync?since=0`)).items.find(i => i.coll === 'conf').data.season;
    const entre = async (who, n, extra) => {
      const j = await who('/api/ram/join', { code: space.code });
      await bur(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }] });
      await who(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['n'], t: 'set', v: n }].concat(Object.entries(extra).map(([k, v]) => ({ p: [k], t: 'set', v }))) }] });
      return j.key;
    };
    // Zoé partage son e-mail et a une photo ; Zacharie ne partage rien
    const kz = await entre(mem, 'Zoé Quintal', { photo: '/media/' + space.id + '/zoe.jpg', ct: { mail: 'zoe@exemple.test' } });
    await entre(cache, 'Zacharie Quintal', {});
    // un compte jeune (fiche gérée par Zoé) : ni photo ni e-mail, même s'ils figuraient sur la fiche
    await mem(`/api/ram/c/${space.id}/ops`, { ops: [{ coll: 'member', id: 'k' + Date.now(), op: 'put', data: { n: 'Léon Quintal', parent: kz, role: 'Jeune', photo: '/media/x/leon.jpg', ct: { mail: 'leon@exemple.test' } } }] });
    const l = await until(async () => { const d = await ja('/api/players?q=quintal'); return (d.players || []).length >= 3 && d.players; }, { msg: 'adhérents jamais proposés' });
    const de = prenom => l.find(p => p.first === prenom);
    assert.equal(de('Zoé').photo, '/media/' + space.id + '/zoe.jpg');
    assert.equal(de('Zoé').mail, 'zoe@exemple.test');
    assert.ok(!de('Zacharie').mail, 'e-mail non partagé : jamais montré');
    assert.ok(!de('Zacharie').photo);
    assert.ok(!de('Léon').mail && !de('Léon').photo, 'compte jeune : rien');
    assert.ok(!JSON.stringify(l).includes('c@exemple.test'), 'l’e-mail du compte n’apparaît jamais');
  } finally { srv.kill(); }
});
