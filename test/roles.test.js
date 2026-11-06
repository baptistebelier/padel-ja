/* Rôles du club : enseignant restreint, animateur, journal des actions sensibles */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRamClub } = require('../lib/ramclub');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ramroles-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const U = n => ({ id: 'R-' + n, name: n + ' Essai', email: n + '@exemple.test' });
const bureau = U('bureau'), coach = U('coach'), anim = U('anim'), adh = U('adh');
let club, k = {};
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;
const refus = r => r.rejected.length;

test('mise en place : bureau, enseignant, animateur, adhérent', async () => {
  club = await ram.create(bureau, { name: 'TC Rôles', short: 'tcr' });
  k.b = club.key;
  for (const [n, u] of [['c', coach], ['a', anim], ['m', adh]]) k[n] = (await ram.join(u, club.code)).key;
  const season = item(await ram.sync(bureau.id, club.id, 0), 'conf', 'main').season;
  await ram.ops(bureau.id, club.id, [k.c, k.a, k.m].map(x => ({ coll: 'member', id: x, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }] })));
  assert.equal((await ram.setRole(bureau.id, club.id, k.c, 'coach')).role, 'coach');
  assert.deepEqual(await ram.setRole(bureau.id, club.id, k.a, 'animateur'), { key: k.a, role: 'anim', fonction: 'Animateur' });
  await assert.rejects(ram.setRole(anim.id, club.id, k.m, 'bureau'), /bureau/);
  await ram.ops(adh.id, club.id, [{ coll: 'post', id: 'pm', op: 'put', data: { by: k.m, kind: 'perf', txt: 'Ma victoire' } }]);
  await ram.ops(coach.id, club.id, [{ coll: 'post', id: 'pc', op: 'put', data: { by: k.c, kind: 'annonce', title: 'Stage' } }]);
});

test("enseignant : modifie le niveau, pas le reste du profil ; ne supprime que ses publications", async () => {
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'member', id: k.m, op: 'patch', patch: [{ p: ['pl'], t: 'set', v: 5 }] }])), 0, 'niveau padel');
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'member', id: k.m, op: 'patch', patch: [{ p: ['n'], t: 'set', v: 'Autre nom' }] }])), 1, 'pas le nom');
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'post', id: 'pm', op: 'del' }])), 1, 'pas la publication d’un adhérent');
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'post', id: 'pm', op: 'patch', patch: [{ p: ['txt'], t: 'set', v: 'modifié' }] }])), 1);
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'post', id: 'pc2', op: 'put', data: { by: 'club', kind: 'annonce', title: 'École' } }])), 0, 'publie au nom du club');
  assert.equal(refus(await ram.ops(coach.id, club.id, [{ coll: 'post', id: 'pc', op: 'del' }])), 0, 'sa propre publication');
});

test('animateur : publie au nom du club et modère, sans réglages ni adhésions', async () => {
  assert.equal(refus(await ram.ops(anim.id, club.id, [{ coll: 'post', id: 'pa', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Soirée' } }])), 0);
  assert.equal(refus(await ram.ops(anim.id, club.id, [{ coll: 'conf', id: 'main', op: 'patch', patch: [{ p: ['name'], t: 'set', v: 'Piraté' }] }])), 1, 'pas les réglages');
  assert.equal(refus(await ram.ops(anim.id, club.id, [{ coll: 'member', id: k.m, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: '1999-2000' }] }])), 1, 'pas les adhésions');
  assert.equal(refus(await ram.ops(anim.id, club.id, [{ coll: 'post', id: 'pm', op: 'del' }])), 0, 'modère le mur');
  assert.equal(item(await ram.sync(anim.id, club.id, 0), 'eleve', 'x'), undefined);
});

test('journal : le bureau voit qui a fait quoi, personne d’autre ; personne ne l’écrit', async () => {
  const s = await ram.sync(bureau.id, club.id, 0), j = s.items.filter(i => i.coll === 'journal').map(i => i.data);
  const del = j.find(x => x.act === 'suppr');
  assert.ok(del && del.by === k.a && del.ex === 'Ma victoire' && del.auteur === k.m, 'suppression par l’animateur');
  assert.ok(j.some(x => x.act === 'role' && x.who === k.a), 'changement de rôle');
  assert.ok(j.some(x => x.act === 'valid' && x.who === k.m), 'validation');
  assert.ok(!j.some(x => x.act === 'suppr' && x.by === k.c), 'sa propre publication ne compte pas');
  for (const u of [coach, anim, adh]) assert.equal((await ram.sync(u.id, club.id, 0)).items.filter(i => i.coll === 'journal').length, 0);
  const id = s.items.find(i => i.coll === 'journal').id;
  assert.equal(refus(await ram.ops(bureau.id, club.id, [{ coll: 'journal', id, op: 'del' }])), 1, 'le journal ne s’efface pas');
  assert.equal(refus(await ram.ops(bureau.id, club.id, [{ coll: 'journal', id: 'jx', op: 'put', data: { act: 'faux' } }])), 1);
});
