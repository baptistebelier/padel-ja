/* Présences aux cours enregistrées en base (club_attendance) : annoncée par l'élève ou ses parents,
   relevée à l'appel par l'enseignant, cours annulé — recopiées depuis l'espace /RAM Club */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-presences-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const { createRamClub } = require('../lib/ramclub');
const { createStore } = require('../lib/store');
const { createGroupes } = require('../lib/groupes');
const ram = createRamClub(DIR), store = createStore(DIR), groupes = createGroupes({ store, ram });
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

test('présences : annoncées, relevées à l’appel, cours annulé', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Présences', short: 'TCP', clubId: 'cref1' });
  const j = await ram.join({ id: 'A', name: 'Inès Faure' }, club.code);
  const kid = 'kleo';
  await ram.ops('B', club.id, [
    { coll: 'member', id: kid, op: 'put', data: { n: 'Léo Faure', parent: j.key } },
    { coll: 'group', id: 'g1', op: 'put', data: { type: 'train', name: 'Mini-tennis', day: 3, h: '17:00', mem: [j.key, kid],
      resp: { '2026-11-04': { [j.key]: 'ok' } }, abs: { '2026-11-04': [kid] }, att: { '2026-11-04': { [j.key]: true } }, cancel: ['2026-11-11'] } }
  ]);
  await groupes.syncSpace(club.id);
  const rows = await store.listGroupRows('attendance', 'club_id', 'cref1');
  const row = (d, k) => rows.find(r => r.session_date === d && r.member_key === k);
  assert.equal(rows.length, 4, JSON.stringify(rows));
  assert.deepEqual([row('2026-11-04', j.key).announced, row('2026-11-04', j.key).present, row('2026-11-04', j.key).user_id], ['ok', true, 'A']);
  assert.deepEqual([row('2026-11-04', kid).announced, row('2026-11-04', kid).present, row('2026-11-04', kid).user_id], ['no', null, null]);
  assert.equal(row('2026-11-11', kid).cancelled, true);
  // l'enseignant corrige l'appel : la ligne suit ; la séance annulée est rétablie : ses lignes partent
  await ram.ops('B', club.id, [{ coll: 'group', id: 'g1', op: 'patch', patch: [{ p: ['att', '2026-11-04', j.key], t: 'set', v: false }, { p: ['cancel'], t: 'set', v: [] }] }]);
  await groupes.syncSpace(club.id);
  const after = await store.listGroupRows('attendance', 'club_id', 'cref1');
  assert.equal(after.length, 2);
  assert.equal(after.find(r => r.member_key === j.key).present, false);
});
