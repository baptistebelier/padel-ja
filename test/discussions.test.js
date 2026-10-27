/* Discussions : « … est en train d'écrire » relayé en direct aux bonnes personnes (jamais enregistré),
   et coches de lecture (heure du dernier message lu par tous les autres membres d'un groupe) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-discussions-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('discussions : en train d’écrire, lu par tous', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Bulles', short: 'TCB' });
  const keys = { B: (await ram.myClubs('B'))[0].key };
  for (const [id, name] of [['A', 'Inès Faure'], ['C', 'Paul Girard']]) {
    const j = await ram.join({ id, name }, club.code);
    keys[id] = j.key;
    const season = item(await ram.sync('B', club.id, 0), 'conf', 'main').season;
    await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  }
  await ram.ops('B', club.id, [
    { coll: 'chan', id: 'general', op: 'put', data: { g: 'club', name: 'Général' } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Ados', mem: [keys.A] } },
    { coll: 'chan', id: 'g1', op: 'put', data: { g: 'train', name: 'Ados' } }
  ]);

  // signal « en train d'écrire »
  const got = { A: [], B: [], C: [] };
  for (const u of ['A', 'B', 'C']) await ram.listenTyping(u, club.id, t => got[u].push(t));
  assert.equal(await ram.typing('A', club.id, 'c:general'), true);
  assert.deepEqual(got.A, [], 'jamais à soi-même');
  assert.deepEqual(got.C, [{ ref: 'c:general', key: keys.A }]);
  await ram.typing('A', club.id, 'c:g1');
  assert.equal(got.C.length, 1, 'groupe d’entraînement : pas aux non-membres');
  assert.equal(got.B.length, 2, 'le bureau voit tous les groupes');
  assert.equal(await ram.typing('A', club.id, 'n’importe quoi'), false);
  assert.equal(item(await ram.sync('B', club.id, 0), 'typing', 'x'), undefined, 'rien n’est enregistré');

  // coches : lu par tous les autres
  await ram.ops('A', club.id, [{ coll: 'prefs', id: keys.A, op: 'put', data: { read: { general: 2000 } } }]);
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { read: { general: 1500 } } }]);
  const r = (await ram.sync('B', club.id, 0)).reads;
  assert.equal(r.general, 1500, 'le plus en retard des autres');
  assert.equal((await ram.sync('A', club.id, 0)).reads.g1, undefined, 'seul membre du groupe : personne d’autre à attendre');

  // infos d'un message : lu par qui et quand, distribué à qui et quand (seulement pour son auteur)
  await ram.ops('A', club.id, [{ coll: 'msg', id: 'mA', op: 'put', data: { ref: 'c:general', by: keys.A, x: 'Salut', at: 3000 } }]);
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { dl: { general: [[3000, 5000]] }, rdl: { general: [[2500, 4000], [3000, 6000]] } } }]);
  await ram.ops('B', club.id, [{ coll: 'prefs', id: keys.B, op: 'put', data: { dl: { general: [[3000, 4500]] } } }]);
  const info = await ram.msgInfo('A', club.id, 'mA');
  assert.deepEqual(info.read, [{ key: keys.C, at: 6000 }], 'lu par Paul à 6000');
  assert.deepEqual(info.delivered, [{ key: keys.B, at: 4500 }], 'distribué à Hugo, pas encore lu');
  await assert.rejects(ram.msgInfo('C', club.id, 'mA'), /auteur/);
});
