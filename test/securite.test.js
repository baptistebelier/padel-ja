/* Sécurité : ce qu'un adhérent peut toucher chez les autres, textes nettoyés, ciblage appliqué par le serveur,
   en-têtes de sécurité des pages */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRamClub, selfPatchOk } = require('../lib/ramclub');
const { cleanText, cleanDeep, pageHeaders } = require('../lib/securite');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ramsecu-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const bureau = { id: 'S-bureau', name: 'Hugo Martin', email: 'hugo@exemple.test' };
const adh = { id: 'S-adh', name: 'Inès Faure', email: 'ines@exemple.test' };
const autre = { id: 'S-autre', name: 'Paul Girard', email: 'paul@exemple.test' };
let club, kB, kA, kO;
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('mise en place : un club, deux adhérents validés, une publication et un groupe', async () => {
  club = await ram.create(bureau, { name: 'TC Sécurité', short: 'tcs' });
  kB = club.key;
  kA = (await ram.join(adh, club.code)).key;
  kO = (await ram.join(autre, club.code)).key;
  const season = item(await ram.sync(bureau.id, club.id, 0), 'conf', 'main').season;
  const r = await ram.ops(bureau.id, club.id, [
    { coll: 'member', id: kA, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] },
    { coll: 'member', id: kO, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] },
    { coll: 'group', id: 'g1', op: 'put', data: { name: 'Équipe 1', coach: kB, mem: [kO] } },
    { coll: 'comm', id: 'c1', op: 'put', data: { name: 'Fêtes', resp: kB, mem: [kB], req: [] } }
  ]);
  assert.deepEqual(r.rejected, []);
  const p = await ram.ops(autre.id, club.id, [{ coll: 'post', id: 'po', op: 'put', data: { by: kO, kind: 'perf', txt: 'Belle victoire', play: { in: [kO], wait: [], places: 1 } } }]);
  assert.deepEqual(p.rejected, []);
});

test("faille : un adhérent ne remplace plus le texte de la publication d'un autre", async () => {
  const r = await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'po', op: 'patch', patch: [{ p: ['txt', kA], t: 'set', v: 'piraté' }] }]);
  assert.equal(r.rejected.length, 1);
  const r2 = await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'po', op: 'patch', patch: [{ p: ['by'], t: 'set', v: kA }, { p: ['seen'], t: 'add', v: kA }] }]);
  assert.equal(r2.rejected.length, 1, 'une seule opération hors de sa case fait tout refuser');
  assert.equal(item(await ram.sync(bureau.id, club.id, 0), 'post', 'po').txt, 'Belle victoire');
});

test("faille : un adhérent ne s'ajoute plus à un groupe, ne casse plus l'enseignant", async () => {
  const r = await ram.ops(adh.id, club.id, [{ coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['mem'], t: 'add', v: kA }] }]);
  assert.equal(r.rejected.length, 1);
  const r2 = await ram.ops(adh.id, club.id, [{ coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['coach', kA], t: 'set', v: 1 }] }]);
  assert.equal(r2.rejected.length, 1);
  const r3 = await ram.ops(adh.id, club.id, [{ coll: 'comm', id: 'c1', op: 'patch', patch: [{ p: ['mem'], t: 'add', v: kA }] }]);
  assert.equal(r3.rejected.length, 1, 'une commission se rejoint sur demande');
  const g = item(await ram.sync(bureau.id, club.id, 0), 'group', 'g1');
  assert.deepEqual(g.mem, [kO]);
  assert.equal(g.coach, kB);
});

test('ce qui reste permis : réagir, voter, répondre, demander à rejoindre, quitter, liste d’attente', async () => {
  const r = await ram.ops(adh.id, club.id, [
    { coll: 'post', id: 'po', op: 'patch', patch: [{ p: ['myBy', kA], t: 'set', v: 'yes' }, { p: ['likers'], t: 'add', v: kA }, { p: ['play', 'wait'], t: 'add', v: kA }] },
    { coll: 'comm', id: 'c1', op: 'patch', patch: [{ p: ['req'], t: 'add', v: kA }] },
    { coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['att', '2026-11-10', kA], t: 'set', v: true }] }
  ]);
  assert.deepEqual(r.rejected, []);
  const full = await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'po', op: 'patch', patch: [{ p: ['play', 'in'], t: 'add', v: kA }] }]);
  assert.equal(full.rejected.length, 1, 'plus de place : seulement la liste d’attente');
  const leave = await ram.ops(autre.id, club.id, [{ coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['mem'], t: 'rm', v: kO }] }]);
  assert.deepEqual(leave.rejected, []);
});

test('règle de la case personnelle : étages objets seulement, valeur bornée', () => {
  const b = { txt: 'x', r: { u2: 'no' }, l: ['a'] };
  assert.ok(selfPatchOk('post', b, [{ p: ['r', 'u1'], t: 'set', v: 'yes' }], ['u1']));
  assert.ok(!selfPatchOk('post', b, [{ p: ['l', 'u1'], t: 'set', v: 1 }], ['u1']), 'une liste n’a pas de case');
  assert.ok(!selfPatchOk('post', b, [{ p: ['u1'], t: 'set', v: 1 }], ['u1']));
  assert.ok(!selfPatchOk('post', b, [{ p: ['r', 'u1'], t: 'set', v: 'x'.repeat(5000) }], ['u1']));
  assert.ok(!selfPatchOk('post', b, [{ p: ['txt'], t: 'add', v: 'u1' }], ['u1']));
  assert.ok(!selfPatchOk('post', b, [], ['u1']));
});

test('textes nettoyés : rien ne devient du code, le texte reste lisible', async () => {
  assert.equal(cleanText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror&#61;alert(1)>');
  assert.equal(cleanText('<script>alert(1)</script>'), '&lt;script>alert(1)&lt;/script>');
  assert.equal(cleanText('" onmouseover="alert(1)'), '" onmouseover&#61;"alert(1)');
  assert.equal(cleanText('javascript:alert(1)'), 'javascript&#58;alert(1)');
  assert.equal(cleanText('Je t’aime <3, a > b, score 6-4 : bravo !'), 'Je t’aime <3, a > b, score 6-4 : bravo !');
  assert.equal(cleanText(cleanText('<b onclick=x>')), cleanText('<b onclick=x>'), 'nettoyer deux fois ne change rien');
  const img = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(cleanDeep({ a: [img, '<svg onload=x>'] }), { a: [img, '&lt;svg onload&#61;x>'] });
  const r = await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'px', op: 'put', data: { by: kA, kind: 'perf', txt: '<img src=x onerror=alert(document.cookie)>' } }]);
  assert.deepEqual(r.rejected, []);
  assert.ok(!/<img/.test(item(await ram.sync(autre.id, club.id, 0), 'post', 'px').txt), 'enregistré nettoyé');
});

test('ciblage appliqué par le serveur : « Bureau uniquement » ne part plus sur les téléphones des adhérents', async () => {
  const r = await ram.ops(bureau.id, club.id, [
    { coll: 'post', id: 'pbur', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Budget', rule: { pub: 'Bureau uniquement' } } },
    { coll: 'post', id: 'ppar', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Parents', rule: { pub: 'Parents' } } },
    { coll: 'msg', id: 'mbur', op: 'put', data: { by: kB, ref: 'p:pbur', txt: 'chiffres', at: Date.now() } }
  ]);
  assert.deepEqual(r.rejected, []);
  const s = await ram.sync(adh.id, club.id, 0);
  assert.equal(item(s, 'post', 'pbur'), undefined);
  assert.equal(item(s, 'post', 'ppar'), undefined, 'pas d’enfant : pas visé');
  assert.equal(item(s, 'msg', 'mbur'), undefined, 'ses commentaires non plus');
  assert.ok(item(await ram.sync(bureau.id, club.id, 0), 'post', 'pbur'), 'le bureau la voit');
  // une publication qui devient ciblée quitte l'appareil à la synchronisation suivante
  const before = (await ram.sync(adh.id, club.id, 0)).rev;
  await ram.ops(bureau.id, club.id, [{ coll: 'post', id: 'ppub', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Tous' } }]);
  const mid = await ram.sync(adh.id, club.id, before);
  assert.ok(item(mid, 'post', 'ppub'));
  await ram.ops(bureau.id, club.id, [{ coll: 'post', id: 'ppub', op: 'patch', patch: [{ p: ['rule'], t: 'set', v: { pub: 'Bureau uniquement' } }] }]);
  const after = await ram.sync(adh.id, club.id, mid.rev);
  assert.ok(after.items.some(i => i.coll === 'post' && i.id === 'ppub' && i.del));
});

test('en-têtes des pages : règle de contenu avec empreinte des scripts, intégration limitée', () => {
  const h = pageHeaders('/x/index.html', '<html><script>var a=1</script><script src="/b.js"></script></html>');
  assert.match(h['Content-Security-Policy'], /script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(h['Content-Security-Policy'], /frame-ancestors 'self'/);
  assert.match(h['Content-Security-Policy'], /object-src 'none'/);
  assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  const tv = pageHeaders('/public/tv.html', '<html></html>');
  assert.match(tv['Content-Security-Policy'], /frame-ancestors \*/);
  assert.equal(tv['X-Frame-Options'], undefined);
  const print = pageHeaders('/public/print.html', '<body onload="print()"></body>');
  assert.match(print['Content-Security-Policy'], /script-src 'self' 'unsafe-inline'/);
});
