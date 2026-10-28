/* /RAM Club : une file d'écriture par club — un club lent ne fait pas attendre les autres,
   et dans un même club les écritures restent une par une */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRamClub } = require('../lib/ramclub');

function memoryBackend(slowClub) {
  const clubs = [], members = [], items = new Map();
  let gate = null;
  return {
    kind: 'memoire',
    hold() { let open; gate = new Promise(r => { open = r; }); return () => { gate = null; open(); }; },
    async clubs() { return clubs.slice(); },
    async saveClub(c) { const i = clubs.findIndex(x => x.id === c.id); if (i >= 0) clubs[i] = c; else clubs.push(c); },
    async members() { return members.slice(); },
    async saveMember(m) { members.push(m); },
    async deleteMember() {},
    async items(id) { return [...(items.get(id) || new Map()).values()]; },
    async saveItems(id, rows) {
      if (id === slowClub() && gate) await gate;
      if (!items.has(id)) items.set(id, new Map());
      rows.forEach(r => items.get(id).set(r.coll + '/' + r.id, r));
    }
  };
}

test('un club bloqué en écriture ne bloque pas les autres clubs', async () => {
  let slow = null;
  const db = memoryBackend(() => slow), ram = createRamClub(null, { backend: db });
  const a = await ram.create({ id: 'A', name: 'Alice' }, { name: 'Club Lent' });
  const b = await ram.create({ id: 'B', name: 'Bob' }, { name: 'Club Rapide' });
  slow = a.id;
  const open = db.hold();
  const pendingA = ram.ops('A', a.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: a.key, txt: 'lent' } }]);
  // le club rapide répond pendant que le club lent attend sa base
  const rB = await Promise.race([
    ram.ops('B', b.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: b.key, txt: 'rapide' } }]),
    new Promise(r => setTimeout(() => r('bloqué'), 1000))
  ]);
  assert.notEqual(rB, 'bloqué');
  assert.deepEqual(rB.rejected, []);
  // dans le club lent, la deuxième écriture attend la première
  let second = false;
  const pendingA2 = ram.ops('A', a.id, [{ coll: 'post', id: 'p2', op: 'put', data: { by: a.key, txt: 'après' } }]).then(r => { second = true; return r; });
  await new Promise(r => setTimeout(r, 50));
  assert.equal(second, false);
  open();
  assert.deepEqual((await pendingA).rejected, []);
  assert.deepEqual((await pendingA2).rejected, []);
  const s = await ram.sync('A', a.id, 0);
  assert.deepEqual(s.items.filter(i => i.coll === 'post').map(i => i.id).sort(), ['p1', 'p2']);
});

test('adhésions indexées : rejoindre, retrouver ses clubs, quitter', async () => {
  const ram = createRamClub(null, { backend: memoryBackend(() => null) });
  const c = await ram.create({ id: 'A', name: 'Alice' }, { name: 'Club Index' });
  const j = await ram.join({ id: 'E', name: 'Eva', email: 'e@x.fr' }, c.code);
  assert.deepEqual((await ram.myClubs('E')).map(x => x.id), [c.id]);
  // deux demandes simultanées du même compte : une seule adhésion
  const [j1, j2] = await Promise.all([ram.join({ id: 'F', name: 'Fred' }, c.code), ram.join({ id: 'F', name: 'Fred' }, c.code)]);
  assert.equal(j1.key, j2.key);
  await ram.remove('E', c.id, j.key);
  assert.deepEqual(await ram.myClubs('E'), []);
  assert.equal((await ram.memberInfo(c.id, 'F')).key, j1.key);
});
