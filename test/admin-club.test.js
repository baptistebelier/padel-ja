/* /RAM Club : l'administrateur de l'appli a tous les droits (bureau et enseignant) dans les clubs dont il fait partie */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-admin-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

test('administrateur de l’appli : tous les droits dans son club', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Admin', short: 'TCA' });
  const j = await ram.join({ id: 'ADM', name: 'Baptiste Bélier' }, club.code);
  // simple adhérent en attente : pas le droit de publier au nom du club
  const put = () => ram.ops('ADM', club.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: 'club', kind: 'annonce', title: 'Test' } }]);
  assert.equal((await put()).rejected.length, 1);
  ram.setSuper(id => id === 'ADM');
  const s = await ram.sync('ADM', club.id, 0);
  assert.deepEqual([s.me.role, s.me.valid, s.me.super], ['bureau', true, true]);
  assert.deepEqual((await put()).rejected, [], 'publie au nom du club');
  assert.deepEqual((await ram.ops('ADM', club.id, [{ coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Ados', coach: j.key, mem: [] } }])).rejected, [], 'crée un groupe comme un enseignant');
  assert.equal((await ram.sync('B', club.id, 0)).me.super, undefined, 'les autres ne sont pas administrateurs');
});
