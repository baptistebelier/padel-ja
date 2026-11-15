/* Saisie du score : « +1 jeu » et « +1 set » (fenêtre Saisir un score de /Pista) */
const test = require('node:test');
const assert = require('node:assert/strict');
const { E, act, demoTournament } = require('./helpers');

const premier = T => { const R = E.resolve(T); return T.matches.find(m => R[m.id].state === 'ready'); };

test('+1 set donne le set en cours à une équipe, sans toucher au set suivant', () => {
  const T = demoTournament({ courts: 3 });
  const m = premier(T); assert.ok(m, 'un match prêt');
  act(T, 'match/game', { id: m.id, team: 'B' });
  act(T, 'match/set', { id: m.id, team: 'A' });
  const sc = E.resolve(T)[m.id].score;
  assert.equal(sc.sets.length, 1, 'un set terminé');
  assert.equal(sc.sets[0].w, 'A', 'gagné par A');
  assert.equal(sc.games.A + sc.games.B, 0, 'le set suivant commence à 0-0');
  assert.equal(E.resolve(T)[m.id].state, 'live', 'le match continue');
});

test('+1 set deux fois : le match est gagné et terminé', () => {
  const T = demoTournament({ courts: 3 });
  const m = premier(T);
  act(T, 'match/set', { id: m.id, team: 'B' });
  act(T, 'match/set', { id: m.id, team: 'B' });
  const r = E.resolve(T)[m.id];
  assert.equal(r.state, 'done');
  assert.equal(r.winner, r.B);
  // un set de plus sur un match terminé ne change rien
  const n = m.points.length;
  act(T, 'match/set', { id: m.id, team: 'A' });
  assert.equal(m.points.length, n);
});
