/* /RAM JA en direct : seulement ce qui change ; un écran qui applique les différences retrouve exactement l'état complet */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const { demoTournament } = require('./helpers.js');
const clone = o => JSON.parse(JSON.stringify(o));

test('différences : ajout, retrait, changement, liste qui change de longueur, tout remplacé', () => {
  const a = { x: 1, y: { z: 2, w: 3 }, l: [1, { v: 2 }], m: [1], n: null };
  const b = { x: 1, y: { z: 9 }, l: [1, { v: 3 }], m: [1, 2], q: 'nouveau', n: { o: 1 } };
  assert.deepEqual(E.applyDiff(clone(a), E.diffState(a, b)), b);
  assert.deepEqual(E.diffState(a, clone(a)), []);
  assert.deepEqual(E.applyDiff({ a: 1 }, E.diffState({ a: 1 }, [1, 2])), [1, 2], 'la racine entière');
  // JSON : une valeur undefined disparaît, comme à la réception
  assert.deepEqual(clone(E.applyDiff(clone({ a: 1, b: 2 }), clone(E.diffState({ a: 1, b: 2 }, { a: 1, b: undefined })))), { a: 1 });
});

test('un vrai tournoi : chaque point en différence, et bien plus léger que l’état complet', () => {
  const T = demoTournament();
  let vu = clone(T), plein = 0, diff = 0, n = 0;
  const m = E.orderedMatches(T).find(x => x && x.status !== 'done') || T.matches[0];
  for (let i = 0; i < 12; i++) {
    const avant = clone(T);
    E.reduce(T, { type: 'match/point', payload: { id: m.id, side: i % 3 ? 0 : 1 } });
    const ops = clone(E.diffState(avant, clone(T)));
    vu = E.applyDiff(vu, ops);
    assert.deepEqual(vu, clone(T));
    plein += JSON.stringify(T).length; diff += JSON.stringify(ops).length; n++;
  }
  assert.ok(diff * 20 < plein, `différences ${diff} octets contre ${plein} pour ${n} points`);
});
