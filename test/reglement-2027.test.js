/* Guide de la compétition padel 2027 (Chap. I, MAJ novembre 2026) : formats des tournois jeunes, 12 h de repos entre deux journées */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const { demoTournament } = require('./helpers.js');

test('tournoi jeunes : formats avec point décisif uniquement, le format E reste permis', () => {
  const T = demoTournament();
  const err = () => E.checkRules(T).filter(w => /Tournoi jeunes/.test(w.msg));
  Object.assign(T.tournament, { formula: 'tf', drawMode: 'tmc', formatMain: 'C1', formatSemi: 'B2', formatFinal: 'B1', formatClass: 'C2' });
  assert.equal(err().length, 0, 'tournoi seniors : pas de contrôle');
  T.tournament.age = 'Jeunes';
  assert.equal(err().length, 1);
  assert.match(err()[0].msg, /C1, B1/);
  Object.assign(T.tournament, { formatMain: 'C2', formatFinal: 'B2' });
  assert.equal(err().length, 0);
  Object.assign(T.tournament, { formatMain: 'E', formatClass: 'E' });
  assert.equal(err().length, 0, 'format E permis');
  assert.ok(E.TEMPLATE_FIELDS.includes('age'), 'la catégorie d’âge est gardée dans les modèles');
});

test('12 h de repos au minimum entre deux matchs sur deux journées', () => {
  const pair = id => ({ id, p1: { last: id + 'a' }, p2: { last: id + 'b' } });
  const T = { pairs: ['p1', 'p2', 'p3'].map(pair), matches: [{ id: 'm1', num: 1 }, { id: 'm2', num: 2 }] };
  const R = { m1: { A: 'p1', B: 'p2', fk: 'C2', state: 'ready' }, m2: { A: 'p1', B: 'p3', fk: 'C2', state: 'waiting' } };
  const m1 = T.matches[0], m2 = T.matches[1];
  const tl = {};
  const veille = new Date(); veille.setDate(veille.getDate() + 1); veille.setHours(21, 0, 0, 0);
  const lend = new Date(veille); lend.setDate(lend.getDate() + 1); lend.setHours(8, 0, 0, 0);
  const H = 3600000;
  tl[m1.id] = { start: veille.getTime(), end: veille.getTime() + H };
  tl[m2.id] = { start: lend.getTime(), end: lend.getTime() + H };
  const repos = W => W.filter(w => /12 h de repos/.test(w.msg));
  assert.equal(repos(E.dayChecks(T, R, tl)).length >= 1, true, 'fin à 22 h, reprise à 8 h : 10 h seulement');
  lend.setHours(10, 30);
  tl[m2.id] = { start: lend.getTime(), end: lend.getTime() + H };
  assert.equal(repos(E.dayChecks(T, R, tl)).length, 0, 'reprise à 10 h 30 : 12 h 30, conforme');
});
