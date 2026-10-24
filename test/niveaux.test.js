/* /RAM Club — publications par niveaux des enseignants : chacun s'inscrit lui-même dans sa fourchette,
   personne ne touche aux fourchettes ni aux inscriptions des autres ; la première fourchette complète est validée */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');
const { nvValidated, deriveCounts } = require('../lib/ram-score');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-niveaux-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

test('première fourchette complète validée, dans l’ordre des inscriptions', () => {
  const nv = { dates: ['d1', 'd2'], tiers: [{ id: 't1', places: 2 }, { id: 't2', places: 1 }],
    ins: { 'd1|t1': ['a', 'b'], 'd1|t2': ['c'], 'd2|t1': ['a'] }, at: { a: { d1: 5, d2: 1 }, b: { d1: 9 }, c: { d1: 7 } } };
  assert.deepEqual(nvValidated(nv), ['c'], 'd1 : t2 complète à 7, avant t1 (9) ; d2 : rien de complet');
  nv.at.c.d1 = 12;
  assert.deepEqual(nvValidated(nv), ['a', 'b']);
});

test('inscriptions par l’adhérent lui-même, comptées une fois validées', async () => {
  const club = await ram.create({ id: 'B', name: 'Sarah Coach' }, { name: 'TC Niveaux', short: 'TCN' });
  const keys = {};
  for (const u of [{ id: 'A', name: 'Inès Faure' }, { id: 'C', name: 'Paul Girard' }]) {
    const j = await ram.join(u, club.code);
    keys[u.id] = j.key;
    const s = await ram.sync('B', club.id, 0), season = s.items.find(i => i.coll === 'conf').data.season;
    await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  }
  const nv = { mode: 'cours', sport: 'Padel', theme: 'Jeu au filet', time: '18 h', dur: '1 h 30', dates: ['2030-01-07'],
    tiers: [{ id: 't1', lo: 1, hi: 3, places: 1 }, { id: 't2', lo: 4, hi: 6, places: 2 }], ins: {}, at: {} };
  assert.deepEqual((await ram.ops('B', club.id, [{ coll: 'post', id: 'pn', op: 'put', data: { by: club.key, kind: 'niveaux', nv, at: Date.now() } }])).rejected, []);
  // l'heure d'inscription envoyée par l'appareil est remplacée par celle du serveur (impossible d'antidater)
  const join = (u, t, ts) => ram.ops(u, club.id, [{ coll: 'post', id: 'pn', op: 'patch', patch: [{ p: ['nv', 'ins', '2030-01-07|' + t], t: 'add', v: keys[u] }, { p: ['nv', 'at', keys[u], '2030-01-07'], t: 'set', v: ts }] }]);
  assert.deepEqual((await join('A', 't2', 100)).rejected, []);
  // inscrire quelqu'un d'autre, ou changer les fourchettes : refusé
  assert.equal((await ram.ops('A', club.id, [{ coll: 'post', id: 'pn', op: 'patch', patch: [{ p: ['nv', 'ins', '2030-01-07|t1'], t: 'add', v: keys.C }] }])).rejected.length, 1);
  assert.equal((await ram.ops('A', club.id, [{ coll: 'post', id: 'pn', op: 'patch', patch: [{ p: ['nv', 'tiers'], t: 'set', v: [] }] }])).rejected.length, 1);
  // Paul complète la fourchette 1 (1 place) : elle est validée, Inès (fourchette 2) passe en attente
  assert.deepEqual((await join('C', 't1', 1)).rejected, []);
  const at = (await ram.sync('B', club.id, 0)).items.find(i => i.id === 'pn').data.nv.at;
  assert.ok(at[keys.C]['2030-01-07'] > at[keys.A]['2030-01-07'], 'horodatage du serveur');
  const s = await ram.sync('B', club.id, 0);
  const items = new Map(s.items.map(i => [i.coll + '/' + i.id, { coll: i.coll, id: i.id, data: i.data }]));
  const c = deriveCounts(items);
  assert.equal((c[keys.C] || {}).train, 1, 'séance validée : un cours pour Paul');
  assert.equal((c[keys.A] || {}).train, undefined, 'Inès, en attente : rien');
});
