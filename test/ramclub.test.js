/* RAM Club : clubs, adhésions, droits d'écriture et synchronisation (stockage fichiers temporaire) */
const test = require('node:test');
const assert = require('node:assert/strict');
const { freePort } = require('./helpers');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createRamClub, applyPatch, selfOnly } = require('../lib/ramclub');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ramclub-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const bureau = { id: 'U-bureau', name: 'Hugo Martin', email: 'hugo@exemple.test' };
const adh = { id: 'U-adh', name: 'Inès Faure', email: 'ines@exemple.test' };
const autre = { id: 'U-autre', name: 'Paul Girard', email: 'paul@exemple.test' };
let club, kB, kA, kO;
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('patch : poser, retirer, ajouter à une liste sans doublon', () => {
  const d = applyPatch({ a: 1, l: ['x'] }, [{ p: ['b', 'c'], t: 'set', v: 2 }, { p: ['a'], t: 'unset' }, { p: ['l'], t: 'add', v: 'y' }, { p: ['l'], t: 'add', v: 'x' }, { p: ['l'], t: 'rm', v: 'x' }]);
  assert.deepEqual(d, { b: { c: 2 }, l: ['y'] });
  assert.throws(() => applyPatch({}, [{ p: ['__proto__', 'x'], t: 'set', v: 1 }]));
  assert.ok(selfOnly([{ p: ['myBy', 'u1'], t: 'set', v: 'yes' }, { p: ['likers'], t: 'add', v: 'u1' }], 'u1'));
  assert.ok(!selfOnly([{ p: ['title'], t: 'set', v: 'piraté' }], 'u1'));
});

test('créer un club : bureau, code d\'entrée, groupes Annonces et Général', async () => {
  club = await ram.create(bureau, { name: 'TPC Les Tilleuls', short: 'tpc' });
  assert.equal(club.role, 'bureau');
  assert.match(club.code, /^TPC-\d{4}$/);
  kB = club.key;
  const s = await ram.sync(bureau.id, club.id, 0);
  assert.equal(item(s, 'conf', 'main').name, 'TPC Les Tilleuls');
  assert.ok(item(s, 'chan', 'annonces') && item(s, 'chan', 'general'));
  assert.equal(item(s, 'member', kB).n, 'Hugo Martin');
  assert.equal(s.me.valid, true);
  assert.equal(s.club.code, club.code, 'le bureau voit le code');
});

test('rejoindre avec le code : en attente, ne voit que son profil', async () => {
  await assert.rejects(ram.join(adh, 'XXX-0000'), /Code inconnu/);
  const j = await ram.join(adh, club.code.toLowerCase());
  kA = j.key;
  const s = await ram.sync(adh.id, club.id, 0);
  assert.equal(s.me.valid, false);
  assert.equal(s.club.code, undefined);
  assert.deepEqual(s.items.map(i => i.coll).sort(), ['conf', 'member']);
  const r = await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: kA, kind: 'annonce', title: 'x' } }]);
  assert.equal(r.rejected.length, 1, 'pas de publication avant validation');
  const v = await ram.ops(adh.id, club.id, [{ coll: 'member', id: kA, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: '2026-2027' }] }]);
  assert.match(v.rejected[0].error, /bureau/, 'pas d\'auto-validation');
});

test('le bureau valide : l\'adhérent voit tout le club', async () => {
  const season = item(await ram.sync(bureau.id, club.id, 0), 'conf', 'main').season;
  const r = await ram.ops(bureau.id, club.id, [{ coll: 'member', id: kA, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  assert.deepEqual(r.rejected, []);
  const s = await ram.sync(adh.id, club.id, 0);
  assert.equal(s.me.valid, true);
  assert.ok(item(s, 'member', kB), 'voit les autres adhérents');
  kO = (await ram.join(autre, club.code)).key;
  await ram.ops(bureau.id, club.id, [{ coll: 'member', id: kO, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] }]);
});

test('droits : publier à son nom, pas au nom d\'un autre ; répondre sans écraser les autres', async () => {
  const club1 = club.id;
  let r = await ram.ops(adh.id, club1, [{ coll: 'post', id: 'pa', op: 'put', data: { by: kA, kind: 'play', play: { in: [], wait: [] } } }, { coll: 'post', id: 'pb', op: 'put', data: { by: kO, kind: 'perf' } }]);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].id, 'pb');
  r = await ram.ops(bureau.id, club1, [{ coll: 'post', id: 'ev', op: 'put', data: { by: 'club', kind: 'event', title: 'Barbecue' } }]);
  assert.deepEqual(r.rejected, []);
  // deux adhérents répondent en même temps : les deux réponses restent
  await ram.ops(adh.id, club1, [{ coll: 'post', id: 'ev', op: 'patch', patch: [{ p: ['myBy', kA], t: 'set', v: 'yes' }, { p: ['likers'], t: 'add', v: kA }] }]);
  await ram.ops(autre.id, club1, [{ coll: 'post', id: 'ev', op: 'patch', patch: [{ p: ['myBy', kO], t: 'set', v: 'maybe' }, { p: ['likers'], t: 'add', v: kO }] }]);
  const ev = item(await ram.sync(bureau.id, club1, 0), 'post', 'ev');
  assert.deepEqual(ev.myBy, { [kA]: 'yes', [kO]: 'maybe' });
  assert.deepEqual(ev.likers.sort(), [kA, kO].sort());
  // un adhérent ne modifie pas le titre de l'événement du club, ni la réponse d'un autre
  r = await ram.ops(adh.id, club1, [{ coll: 'post', id: 'ev', op: 'patch', patch: [{ p: ['title'], t: 'set', v: 'piraté' }] }, { coll: 'post', id: 'ev', op: 'patch', patch: [{ p: ['myBy', kO], t: 'set', v: 'no' }] }]);
  assert.equal(r.rejected.length, 2);
  r = await ram.ops(adh.id, club1, [{ coll: 'post', id: 'ev', op: 'del' }]);
  assert.equal(r.rejected.length, 1, 'pas de suppression du contenu des autres');
});

test('synchronisation : seulement ce qui a changé, suppressions comprises', async () => {
  const s0 = await ram.sync(adh.id, club.id, 0);
  await ram.ops(adh.id, club.id, [{ coll: 'msg', id: 'm1', op: 'put', data: { ref: 'c:general', by: kA, x: 'Salut', at: 1 } }, { coll: 'post', id: 'pa', op: 'del' }]);
  const s1 = await ram.sync(autre.id, club.id, s0.rev);
  assert.deepEqual(s1.items.map(i => i.coll + '/' + i.id + (i.del ? ' supprimé' : '')).sort(), ['msg/m1', 'post/pa supprimé']);
  assert.ok(s1.rev > s0.rev);
});

test('réglages personnels privés, abonnés comptés', async () => {
  await ram.ops(adh.id, club.id, [{ coll: 'prefs', id: kA, op: 'patch', patch: [{ p: ['follow'], t: 'add', v: kO }] }]);
  const r = await ram.ops(autre.id, club.id, [{ coll: 'prefs', id: kA, op: 'patch', patch: [{ p: ['follow'], t: 'add', v: kB }] }]);
  assert.equal(r.rejected.length, 1);
  const s = await ram.sync(autre.id, club.id, 0);
  assert.equal(item(s, 'prefs', kA), undefined, 'les réglages des autres ne sont pas envoyés');
  assert.equal(s.fol[kO], 1);
});

test('rôles : seul le bureau les donne, le club garde toujours un bureau', async () => {
  await assert.rejects(ram.setRole(adh.id, club.id, kA, 'bureau'), /bureau/);
  await ram.setRole(bureau.id, club.id, kA, 'coach');
  const r = await ram.ops(adh.id, club.id, [{ coll: 'art', id: 'a1', op: 'put', data: { title: 'Actu' } }]);
  assert.deepEqual(r.rejected, [], 'un enseignant publie des actus');
  await assert.rejects(ram.setRole(bureau.id, club.id, kB, 'mem'), /au moins un membre du bureau/);
});

test('les données survivent à un redémarrage du serveur', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const again = createRamClub(DIR);
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const s = await again.sync(adh.id, club.id, 0);
  assert.equal(item(s, 'msg', 'm1').x, 'Salut');
  assert.equal(item(s, 'post', 'pa'), undefined);
  assert.equal((await again.myClubs(adh.id))[0].role, 'coach');
});

/* de bout en bout : un vrai serveur, un compte /RAM, l'API /api/ram */
test('API : créer un compte puis un club, synchroniser', async () => {
  const PORT = await freePort(), DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ramclub-api-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: DATA });
  ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'BREVO_API_KEY', 'RESEND_API_KEY'].forEach(k => delete env[k]);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'pipe' });
  try {
    const B = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 50; i++) { try { await fetch(B + '/'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    assert.equal((await fetch(B + '/api/ram/clubs')).status, 401);
    const su = await fetch(B + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'club@exemple.test', password: 'motdepasse1', first: 'Camille', last: 'Roux', club: 'TPC' }) });
    assert.equal(su.status, 200);
    const cookie = [].concat(su.headers.getSetCookie()).map(c => c.split(';')[0]).filter(c => !/=$/.test(c)).join('; ');
    const H = { 'Content-Type': 'application/json', Cookie: cookie };
    const c = await fetch(B + '/api/ram/clubs', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Padel Club Azur', short: 'PCA' }) }).then(r => r.json());
    assert.equal(c.role, 'bureau');
    const s = await fetch(B + `/api/ram/c/${c.id}/sync?since=0`, { headers: H }).then(r => r.json());
    assert.equal(s.items.find(i => i.coll === 'member').data.n, 'Camille Roux');
    const o = await fetch(B + `/api/ram/c/${c.id}/ops`, { method: 'POST', headers: H, body: JSON.stringify({ ops: [{ coll: 'post', id: 'p1', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Bienvenue' } }] }) }).then(r => r.json());
    assert.deepEqual(o.rejected, []);
    assert.equal((await fetch(B + '/api/ram/c/inconnu/sync', { headers: H })).status, 404);
  } finally { srv.kill(); }
});

test('direct : chaque appareil du club est prévenu aussitôt, un adhérent retiré est coupé', async () => {
  const seenA = [], seenO = [];
  const offA = await ram.listen(adh.id, club.id, rev => seenA.push(rev));
  const offO = await ram.listen(autre.id, club.id, rev => seenO.push(rev));
  assert.equal(await ram.listen('U-inconnu', club.id, () => {}), null, 'pas d\'écoute hors du club');
  const r = await ram.ops(bureau.id, club.id, [{ coll: 'msg', id: 'm-direct', op: 'put', data: { ref: 'c:general', by: kB, x: 'Instantané', at: 2 } }]);
  assert.deepEqual(seenA, [r.rev]);
  assert.deepEqual(seenO, [r.rev]);
  await ram.remove(bureau.id, club.id, kO);
  assert.equal(seenO[seenO.length - 1], -1, 'le retiré reçoit -1');
  offA(); offO();
  await ram.ops(bureau.id, club.id, [{ coll: 'msg', id: 'm-apres', op: 'put', data: { ref: 'c:general', by: kB, x: 'Plus écouté', at: 3 } }]);
  assert.equal(seenA.length, 2, 'plus rien après avoir arrêté d\'écouter');
});
