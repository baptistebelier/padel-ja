/* /RAM JA — animations : americano, mexicano, americano par équipes, montée-descente */
const test = require('node:test');
const assert = require('node:assert/strict');
const Ani = require('../public/js/animation.js');

const act = (T, type, payload) => Ani.reduce(T, { type, payload: payload || {} });
function setup(format, n, courts, extra) {
  const T = Ani.initialState({ format, name: 'Soirée' });
  T.ani.seed = 12345;
  act(T, 'ani/setup', Object.assign({ courts }, extra || {}));
  for (let i = 1; i <= n; i++) act(T, 'ani/player/add', { id: 'p' + i, name: 'Joueur ' + i, sex: i % 2 ? 'H' : 'F' });
  return T;
}
// joue la manche en cours : l'équipe A gagne 15 à 9 (24 points), ou un score donné
function play(T, f) {
  const r = T.ani.rounds[T.ani.rounds.length - 1];
  r.matches.forEach((m, i) => { const [a, b] = f ? f(m, i) : [15, 9]; act(T, 'ani/score', { round: r.n, match: m.id, sa: a, sb: b }); });
}

test('americano : 8 joueurs, 2 terrains, 7 manches : chacun joue avec chacun une fois', () => {
  const T = setup('americano', 8, 2);
  for (let i = 0; i < 7; i++) { act(T, 'ani/round/next'); play(T); }
  const H = Ani.history(T.ani);
  let repeats = 0;
  for (let a = 1; a <= 8; a++) for (let b = a + 1; b <= 8; b++) if (H.pc('p' + a, 'p' + b) > 1) repeats++;
  assert.ok(repeats <= 2, `trop de partenaires répétés (${repeats})`);
  const st = Ani.standings(T).rows;
  assert.equal(st.length, 8);
  assert.ok(st.every(x => x.played === 7));
  assert.equal(st.reduce((s, x) => s + x.pf, 0), 7 * 2 * 2 * 24, 'tous les points sont comptés');
});

test('americano : repos équitables quand le nombre ne tombe pas juste (10 joueurs, 2 terrains)', () => {
  const T = setup('americano', 10, 2);
  for (let i = 0; i < 5; i++) { act(T, 'ani/round/next'); play(T); }
  const rests = Ani.standings(T).rows.map(x => x.rest);
  assert.equal(Math.max(...rests), 1, 'personne ne se repose deux fois avant que tous se soient reposés');
});

test('americano mixte : chaque équipe est un homme et une femme', () => {
  const T = setup('americano', 8, 2, { mixte: true });
  for (let i = 0; i < 4; i++) {
    act(T, 'ani/round/next');
    const sexOf = id => T.ani.players.find(p => p.id === id).sex;
    T.ani.rounds[i].matches.forEach(m => [m.a, m.b].forEach(t => assert.deepEqual(t.map(sexOf).sort(), ['F', 'H'])));
    play(T);
  }
});

test('score : total imposé en points, manche suivante seulement quand tout est saisi', () => {
  const T = setup('americano', 8, 2);
  act(T, 'ani/round/next');
  const r = T.ani.rounds[0];
  assert.throws(() => act(T, 'ani/score', { round: 1, match: r.matches[0].id, sa: 10, sb: 10 }), /24/);
  act(T, 'ani/score', { round: 1, match: r.matches[0].id, sa: 13, sb: 11 });
  assert.throws(() => act(T, 'ani/round/next'), /scores/);
  act(T, 'ani/setup', { scoring: { mode: 'temps', minutes: 15 } });
  act(T, 'ani/score', { round: 1, match: r.matches[1].id, sa: 9, sb: 6 });
  act(T, 'ani/round/next');
  assert.equal(T.ani.rounds.length, 2);
});

test('mexicano : à partir de la 2e manche, 1 et 4 contre 2 et 3', () => {
  const T = setup('mexicano', 8, 2);
  act(T, 'ani/round/next'); play(T, (m, i) => (i === 0 ? [20, 4] : [13, 11]));
  act(T, 'ani/round/next');
  const rank = Ani.standings(Object.assign({}, T, { ani: Object.assign({}, T.ani, { rounds: T.ani.rounds.slice(0, 1) }) })).rows.map(x => x.id);
  const m = T.ani.rounds[1].matches[0];
  assert.deepEqual([...m.a, ...m.b].sort(), rank.slice(0, 4).sort(), 'les 4 premiers ensemble sur le terrain 1');
  assert.deepEqual(m.a.sort(), [rank[0], rank[3]].sort());
});

test('americano par équipes : paires fixes, toutes se rencontrent', () => {
  const T = setup('equipes', 8, 2);
  const seen = new Set();
  for (let i = 0; i < 3; i++) { act(T, 'ani/round/next'); T.ani.rounds[i].matches.forEach(m => seen.add([m.a.join('+'), m.b.join('+')].sort().join(' / '))); play(T); }
  assert.equal(seen.size, 6, '4 paires : 6 rencontres en 3 manches');
  assert.equal(Ani.standings(T).rows.length, 4);
});

test('montée-descente : les gagnants montent, les perdants descendent, partenaires séparés', () => {
  const T = setup('montee', 12, 3);
  act(T, 'ani/round/next');
  const r1 = T.ani.rounds[0];
  assert.throws(() => act(T, 'ani/score', { round: 1, match: r1.matches[0].id, sa: 5, sb: 5 }), /gagnant/);
  play(T, () => [6, 3]);   // l'équipe A gagne partout
  act(T, 'ani/round/next');
  const r2 = T.ani.rounds[1], on = (r, i) => [...r.matches[i].a, ...r.matches[i].b].sort();
  assert.deepEqual(on(r2, 0), [...r1.matches[0].a, ...r1.matches[1].a].sort(), 'terrain 1 : gagnants des terrains 1 et 2');
  assert.deepEqual(on(r2, 1), [...r1.matches[0].b, ...r1.matches[2].a].sort(), 'terrain 2 : perdants du 1, gagnants du 3');
  assert.deepEqual(on(r2, 2), [...r1.matches[1].b, ...r1.matches[2].b].sort(), 'terrain 3 : perdants des terrains 2 et 3');
  // partenaires séparés : les deux gagnants du terrain 1 ne rejouent pas ensemble
  const w = r1.matches[0].a;
  assert.ok(!(r2.matches[0].a.includes(w[0]) && r2.matches[0].a.includes(w[1])) && !(r2.matches[0].b.includes(w[0]) && r2.matches[0].b.includes(w[1])));
  play(T, () => [6, 2]);
  const st = Ani.standings(T).rows;
  assert.deepEqual(st.slice(0, 2).map(x => x.id).sort(), [...T.ani.rounds[1].matches[0].a].sort(), 'en tête : les gagnants du terrain 1');
  assert.throws(() => setup('montee', 10, 3) && act(setup('montee', 10, 3), 'ani/round/next'), /multiple de 4/);
});

test('terminer : la manche lancée sans score est retirée, l’animation est close', () => {
  const T = setup('americano', 8, 2);
  act(T, 'ani/round/next'); play(T); act(T, 'ani/round/next');
  act(T, 'ani/finish');
  assert.equal(T.ani.rounds.length, 1);
  assert.equal(T.ani.status, 'done');
  assert.ok(T.tournament.closed);
  assert.throws(() => act(T, 'ani/score', { round: 1, match: T.ani.rounds[0].matches[0].id, sa: 12, sb: 12 }), /terminée/);
});
