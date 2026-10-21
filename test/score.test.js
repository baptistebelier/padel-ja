/* Score : jeux, point décisif, avantages, jeu décisif, super jeu décisif, balles de match */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, game, repeat } = require('./helpers');

test('formats FFT : les 10 formats du guide existent', () => {
  assert.deepEqual(E.FORMAT_KEYS, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'E', 'F']);
});

test('un jeu blanc donne 1-0 et change le serveur', () => {
  const sc = E.computeScore('C2', game('A'), 'A');
  assert.deepEqual(sc.games, { A: 1, B: 0 });
  assert.equal(sc.server, 'B');
});

test('point décisif à 40-40 (formats « point décisif ») : le point suivant gagne le jeu', () => {
  const pts = ['A', 'A', 'A', 'B', 'B', 'B'];
  const sc = E.computeScore('C2', pts, 'A');
  assert.equal(sc.decisivePoint, true);
  assert.deepEqual(sc.labels, { A: '40', B: '40' });
  assert.deepEqual(E.computeScore('C2', pts.concat('B'), 'A').games, { A: 0, B: 1 });
});

test('sans point décisif : avantage puis égalité, il faut 2 points d\'écart', () => {
  const deuce = ['A', 'A', 'A', 'B', 'B', 'B'];
  assert.deepEqual(E.computeScore('A1', deuce.concat('A'), 'A').labels, { A: 'AV', B: '40' });
  assert.deepEqual(E.computeScore('A1', deuce.concat('A', 'B'), 'A').games, { A: 0, B: 0 });
  assert.deepEqual(E.computeScore('A1', deuce.concat('A', 'A'), 'A').games, { A: 1, B: 0 });
});

test('set à 6 jeux : 6-4 termine le set, 6-5 non, 7-5 oui', () => {
  const g64 = repeat(game('A').concat(game('B')), 4).concat(game('A'), game('A'));
  assert.equal(E.computeScore('A1', g64, 'A').sets.length, 1);
  const g65 = repeat(game('A').concat(game('B')), 5).concat(game('A'));
  const sc65 = E.computeScore('A1', g65, 'A');
  assert.equal(sc65.sets.length, 0);
  assert.deepEqual(sc65.games, { A: 6, B: 5 });
  const s75 = E.computeScore('A1', g65.concat(game('A')), 'A');
  assert.deepEqual([s75.sets[0].A, s75.sets[0].B], [7, 5]);
});

test('jeu décisif à 6-6 : 7 points avec 2 d\'écart, le set finit 7-6', () => {
  const g66 = repeat(game('A').concat(game('B')), 6);                 // jeux alternés jusqu'à 6-6
  assert.equal(E.computeScore('A1', g66, 'A').mode, 'tb');
  const tb76 = g66.concat(repeat(['A', 'B'], 6), 'A', 'A');          // 8-6
  const sc = E.computeScore('A1', tb76, 'A');
  assert.equal(sc.sets.length, 1);
  assert.deepEqual([sc.sets[0].A, sc.sets[0].B], [7, 6]);
  assert.deepEqual(sc.sets[0].tb, { A: 8, B: 6 });
  assert.equal(E.setsText(sc.sets), '7-6(6)');
});

test('format C2 : 2 sets à 4 jeux puis super jeu décisif à 10 (2 points d\'écart)', () => {
  const set = w => repeat(game(w), 4);
  const base = set('A').concat(set('B'));
  assert.equal(E.computeScore('C2', base, 'A').mode, 'stb');
  const at98 = base.concat(repeat(['A', 'B'], 8), 'A');               // 9-8
  assert.equal(E.computeScore('C2', at98.concat('A'), 'A').winner, 'A'); // 10-8 : gagné
  const at99 = base.concat(repeat(['A', 'B'], 9));                     // 9-9
  assert.equal(E.computeScore('C2', at99.concat('A'), 'A').winner, null); // 10-9 : pas encore
  const sc = E.computeScore('C2', at99.concat('A', 'A'), 'A');
  assert.equal(sc.winner, 'A');
  assert.equal(E.setsText(sc.sets), '4-0 0-4 [11-9]');
});

test('format E : un seul super jeu décisif à 10', () => {
  const sc = E.computeScore('E', repeat(['A'], 10), 'A');
  assert.equal(sc.winner, 'A');
  assert.equal(E.setsText(sc.sets), '[10-0]');
});

test('balle de match signalée au bon moment', () => {
  const set = w => repeat(game(w), 4);
  const pts = set('A').concat(repeat(game('A'), 3), ['A', 'A', 'A']);   // 4-0, 3-0, 40-0
  assert.equal(E.pointFlags('C2', pts, 'A').A, 'BALLE DE MATCH');
});

test('score saisi à la main : sets et super jeu décisif', () => {
  const sets = E.manualToSets('C2', [[6, 4], [3, 6], [10, 8]]);
  assert.equal(E.setsText(sets), '6-4 3-6 [10-8]');
});
