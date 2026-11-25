/* Tournois /Pista dans /Buvette : la mise en avant sur le mur (et l'épingle, les j'aime) survit à la mise à jour du serveur */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');

test('tournoi /Pista : promo, épingle et j’aime gardés quand le serveur republie la publication', async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const ram = createRamClub(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-tmur-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  const u = { id: 'U-tmur', name: 'Bureau', email: 'bureau@exemple.test' };
  const cl = await ram.create(u, { name: 'Club Tournois', short: 'CT' });
  const lire = async () => (await ram.sync(u.id, cl.id, 0)).items.find(i => i.coll === 'post' && i.id === 'ja-t1').data;
  await ram.serverPut(cl.id, 'post', 'ja-t1', { by: 'club', kind: 'jatour', title: 'P100', ja: { count: 4 } });
  // le bureau met le tournoi sur le mur et l'épingle ; un adhérent aime
  await ram.serverPut(cl.id, 'post', 'ja-t1', Object.assign(await lire(), { promo: 123, pin: true, likers: ['a1'] }));
  // /Pista republie (une inscription de plus) sans connaître ces champs
  await ram.serverPut(cl.id, 'post', 'ja-t1', { by: 'club', kind: 'jatour', title: 'P100', ja: { count: 5 } });
  const p = await lire();
  assert.equal(p.ja.count, 5, 'contenu du tournoi à jour');
  assert.equal(p.promo, 123, 'toujours sur le mur');
  assert.equal(p.pin, true, 'toujours épinglé');
  assert.deepEqual(p.likers, ['a1'], 'j’aime gardés');
});
