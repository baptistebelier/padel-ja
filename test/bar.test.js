/* /RAM Club — bar et club-house : la carte est tenue par le bureau ; chacun réserve pour lui,
   avant la veille au soir, sans pouvoir changer le prix ni se marquer servi ; personne ne voit les réservations des autres */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { createRamClub } = require('../lib/ramclub');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ram-bar-'));
const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
const ram = createRamClub(DIR);
if (saved.url) process.env.SUPABASE_URL = saved.url;
if (saved.key) process.env.SUPABASE_SERVICE_KEY = saved.key;

// jour à Paris dans n jours (« 2026-10-26 »)
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + n * 864e5));
const item = (s, coll, id) => (s.items.find(i => i.coll === coll && i.id === id) || {}).data;

test('bar : carte du bureau, réservations personnelles avant la date limite', async () => {
  const club = await ram.create({ id: 'B', name: 'Hugo Martin' }, { name: 'TC Bar', short: 'TCB' });
  // deux adhérents validés par le bureau
  const keys = {};
  for (const u of [{ id: 'A', name: 'Inès Faure' }, { id: 'C', name: 'Paul Girard' }]) {
    const j = await ram.join(u, club.code);
    keys[u.id] = j.key;
    const s = await ram.sync('B', club.id, 0), season = item(s, 'conf', 'main').season;
    const r = await ram.ops('B', club.id, [{ coll: 'member', id: j.key, op: 'patch', patch: [{ p: ['valid'], t: 'set', v: season }, { p: ['req'], t: 'unset' }] }]);
    assert.deepEqual(r.rejected, []);
  }
  const croque = { name: 'Croque-monsieur', cat: 'Plat', price: '6 €', moments: ['midi'], resa: true, on: true };
  // la carte : le bureau seulement
  assert.equal((await ram.ops('A', club.id, [{ coll: 'bar', id: 'b1', op: 'put', data: croque }])).rejected.length, 1);
  assert.deepEqual((await ram.ops('B', club.id, [{ coll: 'bar', id: 'b1', op: 'put', data: croque }])).rejected, []);
  await ram.ops('B', club.id, [{ coll: 'bar', id: 'b2', op: 'put', data: { name: 'Café', cat: 'Boisson', price: '1,50 €', resa: false, on: true } }]);

  const order = (id, o) => ram.ops('A', club.id, [{ coll: 'order', id, op: 'put', data: Object.assign({ by: keys.A, item: 'b1', date: day(3), moment: 'midi', qty: 2, st: 'ok' }, o) }]);
  // réservation valable : nom et prix repris de la carte, même si l'appareil envoie autre chose
  assert.deepEqual((await order('o1', { name: 'Gratuit', price: '0 €' })).rejected, []);
  const mine = item(await ram.sync('A', club.id, 0), 'order', 'o1');
  assert.equal(mine.price, '6 €'); assert.equal(mine.name, 'Croque-monsieur');
  // refusées : jour passé (réservations closes), moment non servi, article non réservable, se marquer servi, pour un autre
  assert.match((await order('o2', { date: day(-1) })).rejected[0].error, /closes/);
  assert.equal((await order('o3', { moment: 'soir' })).rejected.length, 1);
  assert.equal((await order('o4', { item: 'b2' })).rejected.length, 1);
  assert.equal((await order('o5', { st: 'servi' })).rejected.length, 1);
  assert.equal((await order('o6', { by: keys.C })).rejected.length, 1);
  // annuler la sienne avant la date limite
  assert.deepEqual((await ram.ops('A', club.id, [{ coll: 'order', id: 'o1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }])).rejected, []);
  await ram.ops('A', club.id, [{ coll: 'order', id: 'o1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'ok' }] }]);
  // confidentialité : un autre adhérent ne voit pas la réservation ; le bureau la voit et la marque servie
  assert.equal(item(await ram.sync('C', club.id, 0), 'order', 'o1'), undefined);
  assert.ok(item(await ram.sync('B', club.id, 0), 'order', 'o1'));
  assert.deepEqual((await ram.ops('B', club.id, [{ coll: 'order', id: 'o1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'servi' }] }])).rejected, []);
  // servie : l'adhérent ne peut plus y toucher
  assert.equal((await ram.ops('A', club.id, [{ coll: 'order', id: 'o1', op: 'patch', patch: [{ p: ['qty'], t: 'set', v: 5 }] }])).rejected.length, 1);

  /* points de participation : gagnés en participant, échangés contre un article du bar */
  const wallet = async u => (await ram.sync(u, club.id, 0)).wallet;
  assert.equal((await wallet('A')).balance, 0);
  // Inès s'inscrit à deux événements du club : 2 × 3 points
  for (const id of ['ev1', 'ev2']) {
    await ram.ops('B', club.id, [{ coll: 'post', id, op: 'put', data: { by: 'club', kind: 'event', title: 'Tournoi interne', at: Date.now() } }]);
    assert.deepEqual((await ram.ops('A', club.id, [{ coll: 'post', id, op: 'patch', patch: [{ p: ['myBy', keys.A], t: 'set', v: 'yes' }] }])).rejected, []);
  }
  assert.deepEqual(await wallet('A'), { earned: 6, spent: 0, balance: 6, rules: { play: 2, evt: 3, stage: 5, volu: 5, train: 1, team: 2 } });
  // le café vaut 4 points : un bon passe, le second est refusé (solde insuffisant)
  await ram.ops('B', club.id, [{ coll: 'bar', id: 'b2', op: 'patch', patch: [{ p: ['pts'], t: 'set', v: 4 }] }]);
  const redeem = id => ram.ops('A', club.id, [{ coll: 'redeem', id, op: 'put', data: { by: keys.A, item: 'b2', pts: 1, st: 'ok' } }]);
  assert.deepEqual((await redeem('r1')).rejected, []);
  assert.equal(item(await ram.sync('A', club.id, 0), 'redeem', 'r1').pts, 4, 'prix en points repris de la carte');
  assert.match((await redeem('r2')).rejected[0].error, /pas assez de points/);
  assert.equal((await wallet('A')).balance, 2);
  // l'adhérent ne se remet pas son bon lui-même ; il peut l'annuler (points rendus)
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'remis' }] }])).rejected.length, 1);
  await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }]);
  assert.equal((await wallet('A')).balance, 6);
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'ok' }] }])).rejected.length, 1, 'un bon annulé ne revit pas');
  // nouveau bon, remis par le bureau : il ne s'annule plus
  assert.deepEqual((await redeem('r3')).rejected, []);
  assert.equal(item(await ram.sync('C', club.id, 0), 'redeem', 'r3'), undefined, 'bons des autres invisibles');
  assert.deepEqual((await ram.ops('B', club.id, [{ coll: 'redeem', id: 'r3', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'remis' }] }])).rejected, []);
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r3', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }])).rejected.length, 1);
  assert.equal((await wallet('A')).balance, 2);
});
