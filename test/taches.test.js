/* File de tâches : rien de perdu, nouvelle tentative, pas de doublon, heure respectée */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createStore } = require('../lib/store');
// toujours en fichiers, même si les variables de la vraie base sont présentes (Render)
const store = () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const st = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'ram-taches-')));
  if (saved.url) process.env.SUPABASE_URL = saved.url;
  if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;
  return st;
};
const { createTaches, backoff, MAX_ATTEMPTS } = require('../lib/taches');
const write = async t => t.settle();

test('une tâche est faite, puis son contenu n’est pas gardé', async () => {
  const st = store(), T = createTaches({ store: st }), vu = [];
  T.on('mail', p => { vu.push(p.to); });
  T.enqueue('mail', { to: 'a@x.fr' }); await write(T);
  assert.equal(await T.drain(), 1);
  assert.deepEqual(vu, ['a@x.fr']);
  assert.deepEqual(await st.tasksStats(), { done: 1 });
  assert.equal(await T.drain(), 0, 'rien à refaire');
});

test('un même webhook n’entre qu’une fois', async () => {
  const st = store(), T = createTaches({ store: st }); let n = 0;
  T.on('calendly', () => { n++; });
  T.enqueue('calendly', { x: 1 }, { key: 'k1' }); T.enqueue('calendly', { x: 1 }, { key: 'k1' }); await write(T);
  await T.drain();
  T.enqueue('calendly', { x: 1 }, { key: 'k1' }); await write(T);
  await T.drain();
  assert.equal(n, 1);
});

test('une tâche en échec est retentée plus tard, puis notée en échec', async () => {
  const st = store(), T = createTaches({ store: st }); let n = 0;
  T.on('push', () => { n++; throw new Error('réseau'); });
  T.enqueue('push', {}); await write(T);
  await T.drain();
  assert.equal(n, 1);
  assert.equal(await T.drain(), 0, 'pas tout de suite');
  assert.deepEqual(await st.tasksStats(), { pending: 1 });
  // l'heure de la tentative suivante arrive : essais jusqu'au dernier
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    const [t] = await forceDue(st);
    await st.tasksFail(t.id, 'réseau', new Date(0).toISOString(), t.attempts >= MAX_ATTEMPTS);
  }
  assert.deepEqual(await st.tasksStats(), { failed: 1 });
  assert.ok(backoff(1) === 30e3 && backoff(2) === 60e3 && backoff(30) === 3600e3);
});
async function forceDue(st) {
  const s = await st.tasksClaim(1, 60);
  if (s.length) return s;
  await st.tasksFail(1, 'réseau', new Date(0).toISOString(), false);
  return st.tasksClaim(1, 60);
}

test('une tâche attend son heure ; une tâche abandonnée par un serveur arrêté est reprise', async () => {
  const st = store(), T = createTaches({ store: st }); let n = 0;
  T.on('rappel', () => { n++; });
  T.enqueue('rappel', {}, { at: Date.now() + 3600e3 }); await write(T);
  assert.equal(await T.drain(), 0);
  assert.equal(n, 0);
  await st.tasksAdd([{ kind: 'rappel', payload: {}, dedupe_key: null, run_at: new Date(0).toISOString() }]);
  const [pris] = await st.tasksClaim(1, 0);   // pris par un serveur qui s'arrête aussitôt
  assert.ok(pris);
  await new Promise(r => setTimeout(r, 5));
  assert.equal(await T.drain(), 1, 'reprise après expiration du verrou');
  assert.equal(n, 1);
});

test('base injoignable : la tâche est faite tout de suite plutôt que perdue', async () => {
  const st = store(); st.tasksAdd = async () => { throw new Error('base'); };
  const T = createTaches({ store: st }); let n = 0;
  T.on('mail', () => { n++; });
  await T.enqueue('mail', {});
  assert.equal(n, 1);
});
