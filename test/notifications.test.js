/* /RAM Club — notifications sur le téléphone : les bonnes personnes sont prévenues, jamais l'auteur,
   et chacun peut couper un type de notification ou mettre un groupe en sourdine */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');
const { createNotifier } = require('../lib/pushnotif');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-notif-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

const sent = [];
createNotifier({ ram, push: { send: async (uid, msg) => { sent.push([uid, msg]); return 1; } } });
const settle = () => new Promise(r => setTimeout(r, 30));
const to = () => sent.map(x => x[0]).sort();
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('notifications : publications, groupes, commentaires, réglages', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Notif', short: 'TCN' });
  const keys = { B: (await ram.myClubs('B'))[0].key };
  for (const u of [{ id: 'A', name: 'Inès Faure' }, { id: 'C', name: 'Paul Girard' }, { id: 'D', name: 'Léa Roux' }]) {
    const j = await ram.join(u, club.code);
    keys[u.id] = j.key;
    const season = item(await ram.sync('B', club.id, 0), 'conf', 'main').season;
    // D reste en attente de validation : elle n'est pas prévenue
    if (u.id !== 'D') await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
  }
  await settle(); sent.length = 0;

  // publication du club : tous les adhérents validés, sauf son auteur
  await ram.ops('B', club.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: 'club', kind: 'news', title: 'Tournoi de Noël', d: '2026-12-20' } }]);
  await settle();
  assert.deepEqual(to(), ['A', 'C']);
  assert.match(sent[0][1].body, /Tournoi de Noël/);
  assert.match(sent[0][1].url, new RegExp('^#/post/p1\\?club=' + club.id));

  // Paul coupe « Le club » dans ses réglages : il n'est plus prévenu
  sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { nset: { club: false } } }]);
  await ram.ops('B', club.id, [{ coll: 'post', id: 'p2', op: 'put', data: { by: 'club', kind: 'news', title: 'Fermeture lundi' } }]);
  await settle();
  assert.deepEqual(to(), ['A']);

  // commentaire sur la publication d'Inès : elle seule est prévenue
  await ram.ops('A', club.id, [{ coll: 'post', id: 'p3', op: 'put', data: { by: keys.A, kind: 'photo', x: 'Belle partie' } }]);
  await settle(); sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'msg', id: 'm1', op: 'put', data: { ref: 'p:p3', by: keys.C, x: 'Bravo !', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), ['A']);
  assert.match(sent[0][1].body, /Paul a commenté/);

  // message dans un groupe : ses membres seulement ; en sourdine, plus rien
  await ram.ops('B', club.id, [{ coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Groupe ados', mem: [keys.A, keys.C] } },
    { coll: 'chan', id: 'g1', op: 'put', data: { g: 'train', name: 'Groupe ados' } }]);
  await settle(); sent.length = 0;
  await ram.ops('A', club.id, [{ coll: 'msg', id: 'm2', op: 'put', data: { ref: 'c:g1', by: keys.A, x: 'Qui joue samedi ?', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), ['C']);
  sent.length = 0;
  await ram.ops('C', club.id, [{ coll: 'prefs', id: keys.C, op: 'put', data: { nset: { club: false }, mute: ['g1'] } }]);
  await ram.ops('A', club.id, [{ coll: 'msg', id: 'm3', op: 'put', data: { ref: 'c:g1', by: keys.A, x: 'Personne ?', at: Date.now() } }]);
  await settle();
  assert.deepEqual(to(), []);

  // tournoi /RAM JA publié par le serveur : l'inscrit est prévenu, puis de l'horaire de son match
  const ja = list => ({ by: 'club', kind: 'jatour', title: 'Open TCN', d: '2026-11-08', ja: { status: 'open', list } });
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([]));
  await settle(); sent.length = 0;
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([{ k1: keys.A, n1: 'Inès Faure', n2: 'Zoé Petit' }]));
  await settle();
  assert.deepEqual(to(), ['A']);
  assert.match(sent[0][1].body, /Inscrit au tournoi « Open TCN »/);
  sent.length = 0;
  const at = Date.UTC(2026, 10, 8, 13, 30);
  await ram.serverPut(club.id, 'post', 'ja-t1', ja([{ k1: keys.A, next: { at, court: 'Piste 2' } }]));
  await settle();
  assert.equal(sent.length, 1);
  assert.match(sent[0][1].body, /Ton match : 14 h 30 · Piste 2/);
});
