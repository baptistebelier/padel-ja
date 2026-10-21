/* Sauvegardes : export complet, rangement, rotation (12 gardées) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../lib/store');
const Backup = require('../lib/backup');

// stockage fichiers dans un dossier temporaire (jamais les vraies données)
function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padelja-test-'));
  const env = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const st = createStore(dir);
  if (env.url) process.env.SUPABASE_URL = env.url;
  if (env.key) process.env.SUPABASE_SERVICE_KEY = env.key;
  return { st, dir };
}

test('sauvegarde : toutes les données sont exportées et relisibles', async () => {
  const { st } = tmpStore();
  await st.saveUser({ id: 'u1', email: 'ja@club.fr', name: 'Juge Arbitre' });
  await st.saveTournament({ id: 't1', owner: 'u1', key: 'k', pin: '123456', created_at: 1, updated_at: 1, state: { tournament: { name: 'Open' }, pairs: [], matches: [] } });
  await st.saveProfile('u1', { club: 'Padel Club' });
  const b = await Backup.createBackup(st, 'test');
  assert.match(b.name, /^padel-ja-\d{4}-\d\d-\d\d-\d\dh\d\d\.json$/);
  assert.deepEqual([b.counts.users, b.counts.tournaments, b.counts.templates], [1, 1, 1]);
  const back = JSON.parse(await st.getBackup(b.name));
  assert.equal(back.app, 'padel-ja');
  assert.equal(back.data.tournaments[0].state.tournament.name, 'Open');
  assert.equal(back.data.templates[0].data.profile.club, 'Padel Club');
  assert.ok(Math.abs(Backup.dateOf(b.name) - Date.parse(back.at)) < 60000, 'date lisible dans le nom');
});

test('rotation : seules les 12 sauvegardes les plus récentes sont gardées', async () => {
  const { st } = tmpStore();
  for (let i = 1; i <= 15; i++) await st.putBackup(`padel-ja-2026-01-${String(i).padStart(2, '0')}-10h00.json`, '{}');
  await Backup.createBackup(st, 'test');
  const list = await st.listBackups();
  assert.equal(list.length, Backup.KEEP);
  assert.ok(!list.some(b => b.name.startsWith('padel-ja-2026-01-01')), 'les plus anciennes sont supprimées');
});

test('un nom de sauvegarde ne peut pas sortir du dossier', async () => {
  const { st } = tmpStore();
  assert.equal(await st.getBackup('../users/u1.json'), null);
});
