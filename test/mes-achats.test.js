/* /Buvette : un élève voit ses propres achats (lib/mes-achats.js, route /api/ram/c/:club/achats).
   Il ne voit jamais ceux d'un autre adhérent, ni la note de l'enseignant, ni le prix, ni le moyen de paiement ;
   un parent voit aussi ceux de son enfant. Les fiches élèves restent fermées à la synchronisation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { freePort, serverReady } = require('./helpers');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-mesachats-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createMesAchats } = require('../lib/mes-achats');
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;
let n = 0;
/* un enseignant, deux élèves (dont un parent) et l'enfant ; chacun a un pack noté dans sa fiche */
async function club() {
  const i = ++n, coach = { id: 'C' + i, name: 'Sarah Benali' }, eleve = { id: 'E' + i, name: 'Thomas Leroy' }, autre = { id: 'O' + i, name: 'Paul Martin' };
  const c = await ram.create(coach, { name: 'TC Achats ' + i, short: 'tca' + i });
  const kC = c.key, kE = (await ram.join(eleve, c.code)).key, kO = (await ram.join(autre, c.code)).key;
  const season = item(await ram.sync(coach.id, c.id, 0), 'conf', 'main').season;
  await ram.ops(coach.id, c.id, [kE, kO].map(k => ({ coll: 'member', id: k, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] })));
  const r = await ram.ops(coach.id, c.id, [
    { coll: 'member', id: 'kid' + i, op: 'put', data: { n: 'Léo Leroy', parent: kE } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Mardi', coach: kC, day: 1, h: '18 h', dur: '1 h', sport: 'Padel', from: '2026-11-02', to: '2026-12-28', mem: [kE, kO, 'kid' + i] } },
    { coll: 'seance', id: 'g1.2026-11-02', op: 'put', data: { g: 'g1', d: '2026-11-02', pres: { [kE]: 'P', [kO]: 'P', ['kid' + i]: 'P' } } },
    { coll: 'seance', id: 'g1.2026-11-09', op: 'put', data: { g: 'g1', d: '2026-11-09', pres: { [kE]: 'P', [kO]: 'A' } } },
    { coll: 'eleve', id: kE, op: 'put', data: { n: 'Thomas Leroy', note: 'épaule fragile', achats: [
      { id: 'h1', t: 'pack', ref: 'pk1', d: '2026-11-01', nom: 'Pack 5 séances', n: 5, prix: 150, note: 'remise famille', pay: { moyen: 'Chèque', ech: [{ s: 0, m: 50, ok: '2026-11-01' }, { s: 2, m: 50, ok: '' }, { s: 4, m: 50, ok: '' }] } },
      { id: 'h0', t: 'abo', ref: 'ab0', d: '2025-09-01', fin: '2026-06-30', nom: 'Ancien abonnement', prix: 300 }
    ] } },
    { coll: 'eleve', id: kO, op: 'put', data: { n: 'Paul Martin', achats: [{ id: 'h9', t: 'pack', ref: 'pk1', d: '2026-11-01', nom: 'Pack Paul', n: 10, prix: 280 }] } },
    { coll: 'eleve', id: 'kid' + i, op: 'put', data: { n: 'Léo Leroy', achats: [{ id: 'h5', t: 'pack', ref: 'pk1', d: '2026-11-01', nom: 'Pack Léo', n: 3, prix: 80 }] } }
  ]);
  assert.deepEqual(r.rejected, []);
  return { c, coach, eleve, autre, kC, kE, kO, kid: 'kid' + i };
}
const appels = [];
const mesAchats = createMesAchats({ ram, today: () => '2026-11-20', formules: async u => { appels.push(u); return { formules: [{ id: 'f1', duree: 60, joueurs: 3 }], packs: [{ id: 'pk1', formule: 'f1' }] }; } });

test('mes achats : les miens et ceux de mon enfant, en résumé', async () => {
  const { c, coach, eleve, kE, kid } = await club(), r = await mesAchats(eleve.id, c.id);
  assert.deepEqual(r.eleves.map(e => e.key), [kE, kid]);
  const moi = r.eleves[0];
  assert.equal(moi.termines, 1, 'l’ancien abonnement, terminé, est seulement compté');
  assert.deepEqual(moi.achats, [{ id: 'h1', t: 'pack', nom: 'Pack 5 séances', d: '2026-11-01', fin: '', used: 2, n: 5, freq: 0, etat: 'encours', aPayer: 50, reste: 100 }]);
  assert.equal(r.eleves[1].nom, 'Léo');
  assert.equal(r.eleves[1].achats[0].used, 1);
  assert.ok(appels.includes(coach.id), 'les formules de son enseignant servent au décompte');
});

test('mes achats : jamais ceux d’un autre, ni la note, le prix ou le moyen de paiement', async () => {
  const { c, eleve, autre, kE, kO } = await club();
  const e = JSON.stringify(await mesAchats(eleve.id, c.id)), o = await mesAchats(autre.id, c.id);
  for (const secret of ['épaule', 'remise', 'Chèque', 'prix', 'note', 'pay', 'ref', 'Pack Paul', kO]) assert.ok(!e.includes(secret), 'ne contient pas ' + secret);
  assert.deepEqual(o.eleves.map(x => x.key), [kO], 'Paul ne voit que les siens');
  assert.ok(!JSON.stringify(o).includes(kE) && !JSON.stringify(o).includes('Pack 5'), 'rien de Thomas ni de son enfant');
  assert.equal(o.eleves[0].achats[0].used, 1);
});

test('mes achats : hors du club, rien ; sans fiche, une liste vide ; les fiches restent fermées à la synchronisation', async () => {
  const { c, eleve, kE } = await club();
  assert.equal(await mesAchats('inconnu', c.id), null);
  assert.equal(await mesAchats(eleve.id, 'club-inconnu'), null);
  const nouveau = { id: 'N' + n, name: 'Nina Nouvelle' };
  await ram.join(nouveau, c.code);
  assert.deepEqual(await mesAchats(nouveau.id, c.id), { eleves: [] });
  const s = await ram.sync(eleve.id, c.id, 0);
  assert.ok(!s.items.some(i => i.coll === 'eleve'), 'la fiche de l’élève ne lui est pas envoyée');
  assert.equal(item(s, 'eleve', kE), undefined);
});

test('route /api/ram/c/:club/achats : chacun les siens, rien sans compte', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'mesachats-http-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    await serverReady(B);
    const compte = async (email, first) => {
      const r = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'motdepasse1', first, last: 'Test' }) });
      const H = { 'Content-Type': 'application/json', Cookie: [].concat(r.headers.getSetCookie()).map(x => x.split(';')[0]).filter(x => !/=$/.test(x)).join('; ') };
      return (p, body) => fetch(B + p, body ? { method: 'POST', headers: H, body: JSON.stringify(body) } : { headers: H }).then(async x => ({ status: x.status, body: await x.json() }));
    };
    const prof = await compte('prof@exemple.test', 'Sarah'), el = await compte('eleve@exemple.test', 'Tom'), au = await compte('autre@exemple.test', 'Paul');
    const cl = (await prof('/api/ram/clubs', { name: 'TC Route', short: 'TCR' })).body;
    const kT = (await el('/api/ram/join', { code: cl.code })).body.key, kP = (await au('/api/ram/join', { code: cl.code })).body.key;
    assert.ok(kT && kP);
    const w = await prof(`/api/ram/c/${cl.id}/ops`, { ops: [
      { coll: 'eleve', id: kT, op: 'put', data: { n: 'Tom Test', note: 'secret', achats: [{ id: 'a1', t: 'pack', ref: 'x', d: '2026-11-01', nom: 'Pack Tom', n: 4, prix: 100 }] } },
      { coll: 'eleve', id: kP, op: 'put', data: { n: 'Paul Test', achats: [{ id: 'a2', t: 'pack', ref: 'x', d: '2026-11-01', nom: 'Pack Paul', n: 8, prix: 200 }] } }
    ] });
    assert.deepEqual(w.body.rejected, []);
    const t = await el(`/api/ram/c/${cl.id}/achats`);
    assert.equal(t.status, 200);
    assert.deepEqual(t.body.eleves.map(e => [e.key, e.achats.map(a => a.nom)]), [[kT, ['Pack Tom']]]);
    assert.ok(!JSON.stringify(t.body).includes('secret') && !JSON.stringify(t.body).includes('Pack Paul'));
    const p = await au(`/api/ram/c/${cl.id}/achats`);
    assert.deepEqual(p.body.eleves.map(e => e.key), [kP]);
    const anon = await fetch(`${B}/api/ram/c/${cl.id}/achats`);
    assert.ok(anon.status === 401 || anon.status === 403, 'sans compte : refusé');
    const ext = await compte('dehors@exemple.test', 'Zoé');
    assert.equal((await ext(`/api/ram/c/${cl.id}/achats`)).status, 404, 'hors du club : rien');
  } finally { srv.kill(); }
});
