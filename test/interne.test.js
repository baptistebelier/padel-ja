/* Tournoi interne : tableau, exemptés, résultats saisis par les joueurs et confirmés, avis envoyés */
const test = require('node:test');
const assert = require('node:assert/strict');
const Int = require('../public/js/interne.js');

const nouveau = n => {
  const T = Int.initialState({ name: 'Interne', sport: 'Tennis' });
  for (let i = 1; i <= n; i++) Int.reduce(T, { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i] } });
  return T;
};
const clone = o => JSON.parse(JSON.stringify(o));

test('ordre des têtes de série : 1 en haut, 2 en bas', () => {
  assert.deepEqual(Int.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('tableau de 6 : taille 8, deux exemptés face aux têtes de série 1 et 2, qualifiés d’office', () => {
  const T = nouveau(6);
  Int.reduce(T, { type: 'int/player/seed', payload: { id: 'j1', seed: 1 } });
  Int.reduce(T, { type: 'int/player/seed', payload: { id: 'j2', seed: 2 } });
  Int.reduce(T, { type: 'int/draw' });
  const B = T.int.tabs[0];
  assert.equal(B.size, 8);
  assert.equal(B.rounds.length, 3);
  const r0 = B.rounds[0];
  assert.deepEqual([r0[0].a, r0[0].b], ['j1', 'BYE']);
  assert.equal(r0[0].w, 'j1');
  const m2 = r0.find(m => m.a === 'j2' || m.b === 'j2');
  assert.ok(m2.i >= r0.length / 2 && (m2.a === 'BYE' || m2.b === 'BYE'), 'la tête de série 2 dans la moitié du bas, face à un exempt');
  assert.equal(B.rounds[1][0].a, 'j1', 'qualifiée d’office au tour suivant');
  assert.equal(T.int.status, 'live');
  assert.throws(() => Int.reduce(T, { type: 'int/player/add', payload: { n: 'Tard' } }), /tiré/);
});

test('résultat saisi par un joueur, confirmé par l’adversaire ; le gagnant avance', () => {
  const T = nouveau(4);
  Int.reduce(T, { type: 'int/draw' });
  const m = T.int.tabs[0].rounds[0][0], [a, b] = [m.a, m.b];
  assert.throws(() => Int.reduce(T, { type: 'int/result', payload: { m: m.id, w: a, sc: '6-3 6-4', by: 'j99' } }), /joueurs du match/);
  Int.reduce(T, { type: 'int/result', payload: { m: m.id, w: a, sc: '6-3 6-4', by: a } });
  assert.equal(Int.etat(Int.findM(T.int, m.id)), 'pending');
  assert.equal(T.int.tabs[0].rounds[1][0].a, null, 'pas encore confirmé : n’avance pas');
  assert.throws(() => Int.reduce(T, { type: 'int/confirm', payload: { m: m.id, by: a } }), /adversaire/);
  Int.reduce(T, { type: 'int/confirm', payload: { m: m.id, by: b } });
  assert.equal(T.int.tabs[0].rounds[1][0].a, a);
});

test('contestation, puis le juge-arbitre tranche ; forfait ; finale et vainqueur', () => {
  const T = nouveau(2);
  Int.reduce(T, { type: 'int/draw' });
  const f = T.int.tabs[0].rounds[0][0];
  Int.reduce(T, { type: 'int/result', payload: { m: f.id, w: f.a, sc: '6-0 6-0', by: f.a } });
  Int.reduce(T, { type: 'int/contest', payload: { m: f.id, by: f.b, why: 'On a joué 3 sets' } });
  assert.match(Int.findM(T.int, f.id).conteste, /3 sets/);
  Int.reduce(T, { type: 'int/result', payload: { m: f.id, w: f.b, sc: '4-6 6-3 10-7' } });
  assert.equal(Int.champion(T.int), f.b);
  assert.deepEqual(Int.places(T.int).map(x => x.place), [1, 2]);
});

test('avis : prochain adversaire, match d’avant, résultat à confirmer, contestation', () => {
  const T = nouveau(3);
  const A0 = clone(T);
  Int.reduce(T, { type: 'int/draw' });
  const tirage = Int.avis(A0, T);
  assert.ok(tirage.some(x => /ton adversaire est/.test(x.body)), 'au tirage, chacun connaît son adversaire');
  assert.ok(tirage.some(x => /vont jouer : le gagnant sera ton adversaire/.test(x.body)), 'l’exempt sait qui sortira du match d’avant');
  const m = T.int.tabs[0].rounds[0].find(x => x.a !== 'BYE' && x.b !== 'BYE');
  const A1 = clone(T);
  Int.reduce(T, { type: 'int/result', payload: { m: m.id, w: m.a, sc: '6-2 6-2', by: m.a } });
  const conf = Int.avis(A1, T);
  assert.deepEqual(conf.map(x => x.to[0]), [m.b]);
  assert.match(conf[0].body, /Confirme-le/);
  const A2 = clone(T);
  Int.reduce(T, { type: 'int/contest', payload: { m: m.id, by: m.b } });
  assert.ok(Int.avis(A2, T).some(x => x.ja));
});

test('rappel avant la date limite d’un tour, une seule fois', () => {
  const T = nouveau(2);
  Int.reduce(T, { type: 'int/draw' });
  Int.reduce(T, { type: 'int/tour', payload: { r: 0, fin: '2030-05-10' } });
  assert.equal(Int.aRelancer(T, '2030-05-01').length, 0);
  const l = Int.aRelancer(T, '2030-05-09');
  assert.equal(l.length, 1);
  Int.reduce(T, { type: 'int/remind', payload: { m: l[0].id } });
  assert.equal(Int.aRelancer(T, '2030-05-09').length, 0);
});
