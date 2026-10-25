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

  /* points bar : gagnés seulement en consommant au bar avec l'appli (réservation servie), 1 point par euro */
  const wallet = async u => (await ram.sync(u, club.id, 0)).wallet;
  // la réservation o1 (2 croque-monsieur à 6 €) a été servie : 12 points
  assert.deepEqual(await wallet('A'), { earned: 12, spent: 0, balance: 12, rules: { perEuro: 1 } });
  // participer à la vie du club ne rapporte pas de points bar
  await ram.ops('B', club.id, [{ coll: 'post', id: 'ev1', op: 'put', data: { by: 'club', kind: 'event', title: 'Tournoi interne', at: Date.now() } }]);
  await ram.ops('A', club.id, [{ coll: 'post', id: 'ev1', op: 'patch', patch: [{ p: ['myBy', keys.A], t: 'set', v: 'yes' }] }]);
  // une réservation pas encore servie non plus
  assert.deepEqual((await order('o7', { date: day(4) })).rejected, []);
  assert.equal((await wallet('A')).earned, 12);
  // le café vaut 7 points : un bon passe, le second est refusé (solde insuffisant)
  await ram.ops('B', club.id, [{ coll: 'bar', id: 'b2', op: 'patch', patch: [{ p: ['pts'], t: 'set', v: 7 }] }]);
  const redeem = id => ram.ops('A', club.id, [{ coll: 'redeem', id, op: 'put', data: { by: keys.A, item: 'b2', pts: 1, st: 'ok' } }]);
  assert.deepEqual((await redeem('r1')).rejected, []);
  assert.equal(item(await ram.sync('A', club.id, 0), 'redeem', 'r1').pts, 7, 'prix en points repris de la carte');
  assert.match((await redeem('r2')).rejected[0].error, /pas assez de points/);
  assert.equal((await wallet('A')).balance, 5);
  // l'adhérent ne se remet pas son bon lui-même ; il peut l'annuler (points rendus)
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'remis' }] }])).rejected.length, 1);
  await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }]);
  assert.equal((await wallet('A')).balance, 12);
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r1', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'ok' }] }])).rejected.length, 1, 'un bon annulé ne revit pas');
  // nouveau bon, remis par le bureau : il ne s'annule plus
  assert.deepEqual((await redeem('r3')).rejected, []);
  assert.equal(item(await ram.sync('C', club.id, 0), 'redeem', 'r3'), undefined, 'bons des autres invisibles');
  assert.deepEqual((await ram.ops('B', club.id, [{ coll: 'redeem', id: 'r3', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'remis' }] }])).rejected, []);
  assert.equal((await ram.ops('A', club.id, [{ coll: 'redeem', id: 'r3', op: 'patch', patch: [{ p: ['st'], t: 'set', v: 'annule' }] }])).rejected.length, 1);
  assert.equal((await wallet('A')).balance, 5);
});

test('points bar : taux choisi par le club, remise à zéro à chaque saison', () => {
  const { walletOf, barRules } = require('../lib/ram-score');
  const conf = info => ['conf/main', { coll: 'conf', id: 'main', data: { season: '2026-2027', info } }];
  const items = info => new Map([conf(info),
    ['order/o1', { coll: 'order', id: 'o1', data: { by: 'a', st: 'servi', price: '6 €', qty: 2, date: '2026-06-15' } }],   // saison passée
    ['order/o2', { coll: 'order', id: 'o2', data: { by: 'a', st: 'servi', price: '4,50 €', qty: 1, date: '2026-10-02' } }],
    ['redeem/r1', { coll: 'redeem', id: 'r1', data: { by: 'a', st: 'ok', pts: 5, at: Date.UTC(2026, 5, 20) } }]]);
  const w = info => { const it = items(info); return walletOf(it, 'a', barRules(it)); };
  assert.deepEqual(w({}), { earned: 16, spent: 5, balance: 11 }, 'par défaut : 1 point par euro, sans remise à zéro');
  assert.deepEqual(w({ barRate: 2 }), { earned: 33, spent: 5, balance: 28 });
  assert.deepEqual(w({ barRate: 2, barReset: true }), { earned: 9, spent: 0, balance: 9 }, 'seule la saison en cours compte');
  assert.equal(barRules(items({ barRate: 50 })).perEuro, 10, 'au plus 10 points par euro');
});
