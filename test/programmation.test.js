/* Programmation : terrains, chevauchements, temps de repos, classement final */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, act, demoTournament, playAll } = require('./helpers');

test('programmation automatique : chaque match à jouer a un terrain', () => {
  const T = demoTournament({ courts: 3 });
  const R = E.resolve(T);
  const todo = T.matches.filter(m => !R[m.id].staticBye);
  assert.ok(todo.length > 0);
  todo.forEach(m => assert.ok(T.courts.some(c => c.id === m.court), `match ${m.id} programmé`));
});

test('aucun chevauchement sur un même terrain', () => {
  const T = demoTournament({ courts: 3 });
  const R = E.resolve(T), tl = E.timeline(T, R);
  T.courts.forEach(c => {
    const slots = Object.values(tl).filter(x => x.court === c.id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < slots.length; i++) assert.ok(slots[i].start >= slots[i - 1].end, `terrain ${c.name}`);
  });
});

test('une paire ne rejoue pas avant la fin de son temps de repos', () => {
  const T = demoTournament({ courts: 4 });
  const R = E.resolve(T), tl = E.timeline(T, R);
  const MIN = 60000;
  // pour chaque match, ceux dont il dépend doivent finir + repos avant qu'il commence
  T.matches.filter(m => tl[m.id]).forEach(m => {
    E.depsOf(T, m).filter(id => tl[id]).forEach(id => {
      const rest = (E.REST[R[id].fk[0]] || 0) * MIN;
      assert.ok(tl[m.id].start >= tl[id].end + rest - 1, `${m.id} après ${id} + ${rest / MIN} min`);
    });
  });
});

test('tournoi joué jusqu\'au bout : places 1 à N, une seule fois chacune (TMC)', () => {
  const T = demoTournament({ fields: { drawMode: 'tmc' } });
  playAll(T);
  const R = E.resolve(T);
  assert.ok(T.matches.every(m => R[m.id].staticBye || R[m.id].state === 'done'), 'tous les matchs terminés');
  const res = E.finalResults(T, R);
  assert.equal(res.length, T.draw.entrants.length);
  assert.deepEqual(res.map(x => x.place), res.map((_, i) => i + 1));
  assert.ok(res.every(x => x.exact));
});

test('le vainqueur de la finale est classé 1er et marque le plus de points FFT', () => {
  const T = demoTournament();
  playAll(T, () => 'B');
  const R = E.resolve(T), res = E.finalResults(T, R);
  const final = T.matches.find(m => m.phase === 'TF' && m.a === 1 && m.size === 2);
  assert.equal(res[0].pair, R[final.id].winner);
  assert.ok(res[0].points >= res[res.length - 1].points);
  assert.equal(E.pointsFor(T, 1, res.length), res[0].points);
});

test('vainqueur désigné sans score : le tableau avance, le score peut être saisi ensuite', () => {
  const T = demoTournament();
  const R0 = E.resolve(T);
  const m = T.matches.find(x => R0[x.id].state === 'ready');
  act(T, 'match/winner', { id: m.id, team: 'A' });
  assert.equal(E.resolve(T)[m.id].state, 'done');
  act(T, 'match/manual', { id: m.id, sets: [[6, 2], [6, 3]] });
  assert.equal(E.setsText(E.resolve(T)[m.id].score.sets), '6-2 6-3');
});

test('saisie point par point : le match se termine et la paire avance', () => {
  const T = demoTournament();
  const R0 = E.resolve(T);
  const m = T.matches.find(x => R0[x.id].state === 'ready');
  for (let i = 0; i < 200 && E.resolve(T)[m.id].state !== 'done'; i++) act(T, 'match/point', { id: m.id, team: 'A' });
  const R = E.resolve(T);
  assert.equal(R[m.id].state, 'done');
  assert.equal(R[m.id].winner, R[m.id].A);
});

test('tournoi clôturé : toute modification est refusée, l\'affichage reste possible', () => {
  const T = demoTournament();
  act(T, 'tournament/setClosed', { closed: true });
  assert.throws(() => act(T, 'tournament/update', { name: 'x' }), /clôturé/);
  assert.doesNotThrow(() => act(T, 'display/set', { tv: 'stats' }));
});
