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

test('synchro : scores et compteurs envoyés seulement quand ils changent', async () => {
  const ram = createRamClub(null, { backend: memoryBackend(() => null) });
  const c = await ram.create({ id: 'A', name: 'Alice' }, { name: 'Club Scores' });
  const full = await ram.sync('A', c.id, 0);
  assert.ok(full.counts && full.scores, 'première synchronisation : tout');
  const again = await ram.sync('A', c.id, full.rev);
  assert.equal(again.counts, undefined, 'rien de changé : pas de compteurs');
  assert.equal(again.scores, undefined);
  assert.ok(again.wallet, 'le solde de points reste envoyé');
  // une publication simple ne change aucun compteur : toujours rien ; un « j'aime » en change un : ils reviennent
  await ram.ops('A', c.id, [{ coll: 'post', id: 'p1', op: 'put', data: { by: c.key, txt: 'Bonjour', at: Date.now() } }]);
  const s1 = await ram.sync('A', c.id, full.rev);
  assert.equal(s1.items.length, 1);
  assert.equal(s1.counts, undefined);
  await ram.ops('A', c.id, [{ coll: 'post', id: 'p1', op: 'patch', patch: [{ p: ['likers'], t: 'add', v: c.key }] }]);
  const after = await ram.sync('A', c.id, s1.rev);
  assert.equal(after.counts[c.key].like, 1, 'compteurs mis à jour');
  // un changement de rôle donne une nouvelle version du club
  const j = await ram.join({ id: 'E', name: 'Eva' }, c.code), r0 = (await ram.sync('A', c.id, 0)).rev;
  await ram.setRole('A', c.id, j.key, 'coach');
  assert.ok((await ram.sync('A', c.id, r0)).rev > r0);
});

test('ouverture : les 50 derniers messages de chaque discussion, les plus anciens à la demande', async () => {
  const ram = createRamClub(null, { backend: memoryBackend(() => null) });
  const c = await ram.create({ id: 'A', name: 'Alice' }, { name: 'Club Bavard' });
  const ops = [];
  for (let i = 0; i < 120; i++) ops.push({ coll: 'msg', id: 'm' + i, op: 'put', data: { by: c.key, ref: 'c:general', x: 'message ' + i, at: 1000 + i } });
  ops.push({ coll: 'msg', id: 'a1', op: 'put', data: { by: c.key, ref: 'c:annonces', x: 'seul', at: 5 } });
  await ram.ops('A', c.id, ops);
  await ram.ops('A', c.id, [{ coll: 'msg', id: 'm119', op: 'del' }]);
  const full = await ram.sync('A', c.id, 0), msgs = full.items.filter(i => i.coll === 'msg');
  assert.equal(msgs.filter(m => m.data.ref === 'c:general').length, 50);
  assert.ok(msgs.some(m => m.id === 'm118') && !msgs.some(m => m.id === 'm68'), 'les plus récents');
  assert.ok(msgs.some(m => m.id === 'a1'));
  assert.deepEqual(full.more, { 'c:general': 1 });
  assert.equal(full.items.some(i => i.del), false, 'rien de supprimé à annoncer à l’ouverture');
  // plus anciens : par pages, jusqu'au premier message
  const p1 = await ram.older('A', c.id, 'c:general', 1069);
  assert.deepEqual([p1.items.length, p1.items[0].id, p1.more], [50, 'm68', true]);
  const p2 = await ram.older('A', c.id, 'c:general', 1019);
  assert.deepEqual([p2.items.length, p2.more], [19, false]);
  // une synchronisation « depuis » annonce toujours les suppressions
  const inc = await ram.sync('A', c.id, full.rev - 1);
  assert.ok(Array.isArray(inc.items));
  assert.equal(inc.more, undefined);
});
