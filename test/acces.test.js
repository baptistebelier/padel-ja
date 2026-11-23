/* Offres /Pista (23/11/2026) : gratuit (1 tournoi en plus de l'exemple, sans limite de durée), Pro (+ 7 jours de grâce), pass */
const test = require('node:test');
const assert = require('node:assert/strict');
const { accessOf, READONLY_OK, message, startsTrial } = require('../lib/access');

const DAY = 864e5, now = Date.parse('2026-10-21T12:00:00');
const user = days => ({ id: 'u1', plan: 'essai', created_at: now - days * DAY });
const example = { name: 'Tournoi d\'exemple', example: true };

test('gratuit : un tournoi en plus du tournoi d\'exemple, même longtemps après l\'inscription', () => {
  for (const j of [3, 400]) {
    const a = accessOf(user(j), null, [example], false, now);
    assert.equal(a.state, 'trial');
    assert.ok(a.gratuit && a.canCreate && a.canEdit);
  }
});

test('gratuit : le tournoi offert utilisé bloque la création, pas la modification', () => {
  const a = accessOf(user(3), null, [example, { name: 'Open du club' }], false, now);
  assert.equal(a.canCreate, false);
  assert.equal(a.canEdit, true);
  assert.match(message(a), /Pista Pro/);
});

test('ancien tournoi d\'exemple sans marque : reconnu par son nom', () => {
  assert.ok(accessOf(user(3), null, [{ name: 'Tournoi d\'exemple' }], false, now).canCreate);
});

test('Pro : accès complet, puis 7 jours de grâce, puis retour à la version gratuite', () => {
  const paid = until => accessOf(user(60), { until }, [example, { name: 'A' }, { name: 'B' }], false, now);
  assert.equal(paid(now + 30 * DAY).state, 'paid');
  assert.ok(paid(now + 30 * DAY).canCreate, 'tournois illimités');
  const grace = paid(now - 3 * DAY);
  assert.equal(grace.state, 'paid');
  assert.ok(grace.grace && grace.canEdit);
  const fini = paid(now - 8 * DAY);
  assert.equal(fini.state, 'trial');
  assert.equal(fini.canCreate, false, 'le tournoi offert est déjà pris');
  assert.equal(fini.canEdit, true);
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

test('compte créé ailleurs : rien avant la première venue sur /Pista ; offre attribuée : pas de version gratuite à démarrer', () => {
  const u = { id: 'u2', plan: 'essai', created_at: now - 100 * DAY };
  assert.equal(accessOf(u, { noTrial: true }, [], false, now).state, 'sans');
  assert.equal(accessOf(u, { noTrial: true }, [], false, now).canCreate, false);
  assert.ok(startsTrial({ noTrial: true }, false));
  assert.equal(startsTrial({ noTrial: true }, true), false, 'accès offert');
  assert.equal(startsTrial({ noTrial: true, until: now + DAY }, false), false, 'accès payé');
  assert.equal(startsTrial(null, false), false, 'compte /Pista existant : rien ne change');
  assert.equal(accessOf(u, { noTrial: false, trial: now - DAY }, [], false, now).state, 'trial');
  assert.equal(accessOf(u, { trial: now - 20 * DAY }, [], false, now).state, 'trial', 'plus de fin de période');
  assert.equal(accessOf(u, null, [], false, now).canCreate, true, 'ancien compte : le tournoi offert reste à créer');
});
