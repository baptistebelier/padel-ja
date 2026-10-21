/* Offres : essai (14 jours, 1 tournoi en plus de l'exemple), abonné (+ 7 jours de grâce), lecture seule */
const test = require('node:test');
const assert = require('node:assert/strict');
const { accessOf, READONLY_OK, message } = require('../lib/access');

const DAY = 864e5, now = Date.parse('2026-10-21T12:00:00');
const user = days => ({ id: 'u1', plan: 'essai', created_at: now - days * DAY });
const example = { name: 'Tournoi d\'exemple', example: true };

test('essai en cours : création d\'un tournoi en plus du tournoi d\'exemple', () => {
  const a = accessOf(user(3), null, [example], false, now);
  assert.equal(a.state, 'trial');
  assert.equal(a.daysLeft, 11);
  assert.ok(a.canCreate && a.canEdit);
});

test('essai : le tournoi d\'essai utilisé bloque la création, pas la modification', () => {
  const a = accessOf(user(3), null, [example, { name: 'Open du club' }], false, now);
  assert.equal(a.canCreate, false);
  assert.equal(a.canEdit, true);
  assert.match(message(a), /Abonnez-vous/);
});

test('ancien tournoi d\'exemple sans marque : reconnu par son nom', () => {
  assert.ok(accessOf(user(3), null, [{ name: 'Tournoi d\'exemple' }], false, now).canCreate);
});

test('essai terminé après 14 jours : lecture seule', () => {
  const a = accessOf(user(15), null, [example], false, now);
  assert.equal(a.state, 'expired');
  assert.equal(a.canEdit, false);
  assert.equal(a.canCreate, false);
  assert.match(message(a), /lecture seule/);
});

test('abonné : accès complet, puis 7 jours de grâce, puis lecture seule', () => {
  const paid = until => accessOf(user(60), { until }, [example, { name: 'A' }, { name: 'B' }], false, now);
  assert.equal(paid(now + 30 * DAY).state, 'paid');
  assert.ok(paid(now + 30 * DAY).canCreate, 'tournois illimités');
  const grace = paid(now - 3 * DAY);
  assert.equal(grace.state, 'paid');
  assert.ok(grace.grace && grace.canEdit);
  assert.equal(paid(now - 8 * DAY).state, 'expired');
});

test('accès offert et administrateur : illimité, même très ancien', () => {
  const a = accessOf(user(400), null, [], true, now);
  assert.equal(a.state, 'free');
  assert.ok(a.canCreate && a.canEdit);
});

test('démo : libre (effacée au bout de 24 h par ailleurs)', () => {
  assert.equal(accessOf({ guest: true }, null, [], false, now).state, 'demo');
});

test('en lecture seule, seul l\'affichage TV reste pilotable', () => {
  assert.ok(READONLY_OK.has('display/set'));
  assert.ok(!READONLY_OK.has('match/point'));
  assert.ok(!READONLY_OK.has('draw/create'));
});
