/* Ventes Shopify : signature du webhook, prolongation de l'accès, commandes rejouées, pass tournoi */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verify, applyOrder, orderEmail } = require('../lib/shopify');
const { accessOf } = require('../lib/access');

const DAY = 864e5, now = Date.parse('2026-10-21T12:00:00');
const order = (id, sku, extra) => Object.assign({ id, name: '#' + id, email: 'Club@Exemple.fr', line_items: [{ sku, quantity: 1 }] }, extra);
const day = t => new Date(t).toISOString().slice(0, 10);

test('signature : acceptée avec la bonne clé, refusée sinon', () => {
  const raw = Buffer.from(JSON.stringify(order(1, 'PJA-CLUB-MOIS')));
  const sig = crypto.createHmac('sha256', 'cle-test').update(raw).digest('base64');
  assert.ok(verify(raw, sig, 'cle-test'));
  assert.ok(!verify(raw, sig, 'autre-cle'));
  assert.ok(!verify(Buffer.concat([raw, Buffer.from(' ')]), sig, 'cle-test'), 'corps modifié');
  assert.ok(!verify(raw, undefined, 'cle-test'));
  assert.ok(!verify(raw, sig, ''), 'sans clé configurée : tout est refusé');
});

test('e-mail de la commande, en minuscules', () => {
  assert.equal(orderEmail(order(1, 'X')), 'club@exemple.fr');
  assert.equal(orderEmail({ customer: { email: 'A@B.fr' } }), 'a@b.fr');
});

test('abonnement mensuel puis renouvellements : chaque paiement ajoute 1 mois à la fin actuelle', () => {
  let b = applyOrder(null, order(1, 'PJA-CLUB-MOIS'), now).billing;
  assert.equal(day(b.until), '2026-11-21');
  b = applyOrder(b, order(2, 'PJA-CLUB-MOIS'), now + 29 * DAY).billing;   // renouvelé avant l'échéance
  assert.equal(day(b.until), '2026-12-21');
  assert.equal(accessOf({ created_at: now - 90 * DAY }, b, [], false, now + 40 * DAY).state, 'paid');
});

test('annuel : 12 mois', () => {
  assert.equal(day(applyOrder(null, order(1, 'PJA-CLUB-AN'), now).billing.until), '2027-10-21');
});

test('un même webhook reçu deux fois ne prolonge qu\'une fois', () => {
  const b = applyOrder(null, order(7, 'PJA-CLUB-MOIS'), now).billing;
  const again = applyOrder(b, order(7, 'PJA-CLUB-MOIS'), now);
  assert.equal(again.changed, false);
  assert.equal(again.billing.until, b.until);
});

test('commande sans produit RAM JA (t-shirt…) : rien ne change', () => {
  const r = applyOrder(null, order(3, 'TSHIRT-RAM'), now);
  assert.equal(r.changed, false);
});

test('accès arrivé à échéance : la reprise repart d\'aujourd\'hui', () => {
  const old = { until: now - 60 * DAY, orders: [] };
  assert.equal(day(applyOrder(old, order(4, 'PJA-CLUB-MOIS'), now).billing.until), '2026-11-21');
});

test('pass tournoi : 30 jours, 1 tournoi, puis lecture seule', () => {
  const b = applyOrder(null, order(5, 'PJA-PASS'), now).billing;
  assert.equal(day(b.until), '2026-11-20');
  const u = { created_at: now - 90 * DAY };
  const a = accessOf(u, b, [], false, now + DAY);
  assert.equal(a.state, 'pass');
  assert.ok(a.canCreate);
  const used = accessOf(u, b, [{ name: 'Open', created_at: now + DAY }], false, now + 2 * DAY);
  assert.equal(used.canCreate, false);
  assert.equal(used.canEdit, true, 'le tournoi du pass reste modifiable');
  assert.equal(accessOf(u, b, [], false, now + 31 * DAY).state, 'expired');
});

test('abonnement pris pendant un pass : le pass est remplacé par l\'abonnement', () => {
  const pass = applyOrder(null, order(5, 'PJA-PASS'), now).billing;
  const club = applyOrder(pass, order(6, 'PJA-CLUB-AN'), now + 5 * DAY).billing;
  assert.equal(club.pass, null);
  assert.equal(day(club.until), '2027-10-26');
});
