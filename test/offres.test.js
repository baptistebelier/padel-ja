/* Offres des applis (23/11/2026) : /Buvette Découverte (50 adhérents), /Dojo gratuit (30 élèves, 3 groupes, 2 formules,
   sans réservation en ligne ni suivi), /Dojo Pro et /Buvette Club + vendus par Shopify */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOffres, niveauClub, adherents, parcEnseignant, LIMITES, Limite } = require('../lib/offres');
const { applyOrder } = require('../lib/shopify');

const DAY = 864e5, now = Date.parse('2026-11-23T12:00:00');
const items = l => new Map(l.map(x => [x.coll + '/' + x.id, x]));

test('offre du club : Découverte par défaut, Club ou Club + jusqu’à la fin payée (+ 7 jours)', () => {
  assert.equal(niveauClub({}, now), 'decouverte');
  assert.equal(niveauClub({ offre: { niveau: 'club', until: now + DAY } }, now), 'club');
  assert.equal(niveauClub({ offre: { niveau: 'clubplus', until: now - 3 * DAY } }, now), 'clubplus');
  assert.equal(niveauClub({ offre: { niveau: 'clubplus', until: now - 8 * DAY } }, now), 'decouverte');
});

test('compteurs : adhérents validés de la saison ; élèves et groupes d’un enseignant', () => {
  const m = items([{ coll: 'member', id: 'a', data: { valid: '2026' } }, { coll: 'member', id: 'b', data: { valid: '2025' } }, { coll: 'member', id: 'c', data: {} }]);
  assert.equal(adherents(m, { season: '2026' }), 1);
  const p = parcEnseignant(items([
    { coll: 'group', id: 'g1', data: { type: 'train', coach: 'k', mem: ['e1', 'e2'], ext: ['x1'] } },
    { coll: 'group', id: 'g2', data: { type: 'train', coach: 'k', mem: ['e2'] } },
    { coll: 'group', id: 'g3', data: { type: 'team', coach: 'k', mem: ['e9'] } },
    { coll: 'group', id: 'g4', data: { type: 'train', coach: 'autre', mem: ['e8'] } },
    { coll: 'cours', id: 'c1', data: { coach: 'k', ext: ['e3'] } }
  ]), 'k');
  assert.equal(p.groupes.size, 2);
  assert.deepEqual([...p.eleves].sort(), ['e1', 'e2', 'e3', 'x1']);
});

/* faux serveur : un club, un enseignant (clé k, compte u1) ; ses achats */
function monde({ groupes = 0, eleves = 0, billing = null, offreClub = null } = {}) {
  const list = [{ coll: 'conf', id: 'main', data: Object.assign({ season: '2026' }, offreClub ? { offre: offreClub } : {}) }];
  for (let i = 0; i < groupes; i++) list.push({ coll: 'group', id: 'g' + i, data: { type: 'train', coach: 'k', mem: [] } });
  if (eleves) list.push({ coll: 'cours', id: 'c0', data: { coach: 'k', ext: Array.from({ length: eleves }, (_, i) => 'e' + i) } });
  const club = { items: items(list) };
  const ram = { myClubs: async () => [{ id: 'c1', role: 'coach', key: 'k' }], itemsOf: async (id, coll) => list.filter(x => x.coll === coll).map(x => ({ id: x.id, data: x.data })) };
  const store = { getBilling: async () => billing };
  return { club, o: createOffres({ store, ram }) };
}
const coach = { key: 'k', role: 'coach' };

test('/Dojo gratuit : 3 groupes au plus, sauf avec /Dojo Pro ou un club en Club +', async () => {
  let { club, o } = monde({ groupes: 3 });
  const op = { coll: 'group', id: 'gN', op: 'put' }, after = { type: 'train', coach: 'k', mem: [] };
  await assert.rejects(o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after, club }), /3 groupes/);
  ({ club, o } = monde({ groupes: 2 }));
  await o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after, club });
  ({ club, o } = monde({ groupes: 3, billing: { dojo: { until: now + 30 * DAY } } }));
  await o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after, club });
  ({ club, o } = monde({ groupes: 3, offreClub: { niveau: 'clubplus', until: Date.now() + 30 * DAY } }));
  await o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after, club });
});

test('/Dojo gratuit : 30 élèves au plus ; un compte déjà au-delà garde les siens sans en ajouter ; le bureau n’est pas limité', async () => {
  const { club, o } = monde({ eleves: 30 });
  const op = { coll: 'group', id: 'gN', op: 'put' };
  await assert.rejects(o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after: { type: 'train', coach: 'k', mem: ['nouveau'] }, club }), /30 élèves/);
  await o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op, before: null, after: { type: 'train', coach: 'k', mem: ['e1'] }, club });   // déjà compté
  await o.garde({ userId: 'u1', clubId: 'c1', ctx: { key: 'k', role: 'bureau' }, op, before: null, after: { type: 'train', coach: 'k', mem: ['nouveau'] }, club });
  assert.equal(LIMITES.dojo.eleves, 30);
});

test('/Dojo gratuit : 2 formules ; suivi des élèves réservé à Pro', async () => {
  const { club, o } = monde();
  await o.gardeFormules('u1', 1, 2);
  await assert.rejects(o.gardeFormules('u1', 2, 3), Limite);
  await o.gardeFormules('u1', 5, 4);   // en retirer reste possible
  await assert.rejects(o.garde({ userId: 'u1', clubId: 'c1', ctx: coach, op: { coll: 'suivi', id: 's1', op: 'put' }, before: null, after: { by: 'k', to: 'e1', k: 'msg' }, club }), /Pro/);
});

test('/Buvette Découverte : 50 adhérents validés au plus ; l’offre du club ne s’écrit pas depuis l’appli', async () => {
  const list = [{ coll: 'conf', id: 'main', data: { season: '2026' } }];
  for (let i = 0; i < 50; i++) list.push({ coll: 'member', id: 'm' + i, data: { valid: '2026' } });
  const club = { items: items(list) }, o = createOffres({ store: { getBilling: async () => null }, ram: { myClubs: async () => [], itemsOf: async () => [] } });
  const bureau = { key: 'b', role: 'bureau' };
  await assert.rejects(o.garde({ userId: 'u', clubId: 'c', ctx: bureau, op: { coll: 'member', id: 'x', op: 'put' }, before: { valid: '' }, after: { valid: '2026' }, club }), /50 adhérents/);
  club.items.get('conf/main').data.offre = { niveau: 'club', until: Date.now() + DAY };
  await o.garde({ userId: 'u', clubId: 'c', ctx: bureau, op: { coll: 'member', id: 'x', op: 'put' }, before: { valid: '' }, after: { valid: '2026' }, club });
  const after = { season: '2026', name: 'Club', offre: { niveau: 'clubplus', until: 9e15 } };
  await o.garde({ userId: 'u', clubId: 'c', ctx: bureau, op: { coll: 'conf', id: 'main', op: 'put' }, before: club.items.get('conf/main').data, after, club });
  assert.equal(after.offre.niveau, 'club', 'l’offre payée reste celle du serveur');
});

test('Shopify : /Dojo Pro prolongé sur le compte ; offre /Buvette rendue au serveur pour le club', () => {
  const order = (id, sku) => ({ id, line_items: [{ sku, quantity: 1 }] });
  let r = applyOrder(null, order(1, 'RAM-DOJO-PRO-MOIS'), now);
  assert.ok(r.changed && r.billing.dojo.until > now && !r.billing.until);
  r = applyOrder(r.billing, order(2, 'RAM-DOJO-PRO-AN'), now);
  assert.ok(r.billing.dojo.until > now + 360 * DAY);
  r = applyOrder(null, order(3, 'RAM-BUVETTE-CLUBPLUS-MOIS'), now);
  assert.deepEqual(r.buvette.map(x => [x.niveau, x.months]), [['clubplus', 1]]);
  assert.ok(applyOrder(null, order(4, 'RAM-PISTA-PRO-MOIS'), now).billing.until > now);
});

test('administrateur de l’appli : /Dojo Pro et /Buvette Club + dans les clubs dont il est au bureau, sans abonnement', async () => {
  const conf = { coll: 'conf', id: 'main', data: { season: '2026' } };
  const ram = {
    myClubs: async id => (id === 'adm' ? [{ id: 'c1', role: 'bureau', key: 'a' }] : id === 'u1' ? [{ id: 'c1', role: 'coach', key: 'k' }, { id: 'c2', role: 'coach', key: 'k' }] : []),
    itemsOf: async (id, coll) => (coll === 'conf' ? [{ id: 'main', data: conf.data }] : [])
  };
  const o = createOffres({ store: { getBilling: async () => null }, ram, admins: () => ['adm'] });
  assert.equal(await o.dojoPro('adm'), true);
  assert.equal((await o.etatDojo('adm')).admin, true);
  assert.equal((await o.etatClub('c1')).niveau, 'clubplus');
  assert.equal((await o.etatClub('c2')).niveau, 'decouverte');
  assert.equal(await o.dojoPro('u1'), true);   // enseignant d'un club de l'administrateur : Club + offre /Dojo Pro
  assert.equal(await o.dojoPro('autre'), false);
});
