/* Tournoi interne : composer le tirage à la main (tableau recopié de MOJA) — lignes, échanges, têtes de série,
   dimension et sections, poules — et contrôles du règlement (art. 45-3, 46, 49, 54) */
const test = require('node:test');
const assert = require('node:assert/strict');
const Int = require('../public/js/interne.js');

const CL = ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1', '30', '15/5', '15/4', '15/3', '15/2', '15/1', '15', '5/6', '4/6'];
const nouveau = (n, cl = i => CL[(i * 7) % CL.length], seed) => {
  const T = Int.initialState({ name: 'Interne', sport: 'Tennis' });
  if (seed != null) T.int.seed = seed;
  for (let i = 1; i <= n; i++) Int.reduce(T, { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i], cl: cl(i) } });
  return T;
};
const act = (T, type, payload) => Int.reduce(T, { type, payload });

test('un tirage automatique respecte toujours le règlement : aucune alerte', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const a = nouveau(5 + (seed % 20), undefined, seed);
    act(a, 'int/draw');
    assert.deepEqual(Int.controles(a.int), [], 'tableau unique, graine ' + seed);
    const b = nouveau(14 + (seed % 10), i => (i % 3 ? CL[i % 7] : CL[7 + (i % 6)]), seed);
    act(b, 'int/setup', { struct: [{ max: '30/1', q: 2 + (seed % 3) }] });
    try { act(b, 'int/draw'); } catch (e) { continue; }
    assert.deepEqual(Int.controles(b.int), [], 'tableaux successifs, graine ' + seed);
  }
});

test('tableau vierge : chaque joueur se place à la main, les contrôles disent ce qui manque', () => {
  const T = nouveau(6, i => ['15', '15/1', '30', '30/1', '40', 'NC'][i - 1]);
  act(T, 'int/draw', { vierge: true });
  const tab = T.int.tabs[0];
  assert.equal(tab.size, 8);
  assert.ok(tab.lines.every(x => x === 'BYE'));
  assert.equal(Int.controles(T.int).filter(c => /n’est placé dans aucun tableau/.test(c.txt)).length, 6);
  // recopie d'un tableau MOJA : 1 et 2 exempts aux extrémités, les autres au 1er tour
  [['j1', 0], ['j3', 2], ['j4', 3], ['j5', 4], ['j6', 5], ['j2', 7]].forEach(([x, L]) => act(T, 'int/line', { t: '', L, x }));
  act(T, 'int/ts', { t: '', id: 'j1', n: 1 }); act(T, 'int/ts', { t: '', id: 'j2', n: 2 });
  assert.deepEqual(Int.controles(T.int), []);
  assert.equal(Int.findM(T.int, 'r1m0').a, 'j1', 'exempt : entre au 2e tour');
  // un joueur déjà placé, mis ailleurs : il échange sa place
  act(T, 'int/line', { t: '', L: 2, x: 'j6' });
  assert.equal(T.int.tabs[0].lines[5], 'j3');
  act(T, 'int/swap', { t: '', a: 2, b: 5 });
  assert.equal(T.int.tabs[0].lines[2], 'j3');
  // fautes signalées : la 2 dans la même moitié que la 1, un moins bien classé exempt à la place d'un mieux classé
  act(T, 'int/swap', { t: '', a: 7, b: 3 });
  const c = Int.controles(T.int).map(x => x.txt).join(' | ');
  assert.match(c, /têtes de série 1 et 2 sont dans la même moitié/);
  assert.match(c, /entre plus loin que .* mieux classé \(art\. 45-3-b\)/);
  // un résultat fige la composition
  act(T, 'int/swap', { t: '', a: 7, b: 3 });
  const m = Int.allMatches(T.int).find(x => Int.etat(x) === 'ready');
  act(T, 'int/result', { m: m.id, w: m.a, sc: '6-1 6-1' });
  assert.throws(() => act(T, 'int/swap', { t: '', a: 0, b: 1 }), /composition ne change plus/);
});

test('dimension et sections modifiées à la main ; les places des qualifiés suivent dans le tableau suivant', () => {
  const cl = i => (i <= 10 ? 'NC' : ['30', '15/5', '15/4', '15/3', '15/2'][i - 11]);
  const T = nouveau(15, cl);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 2 }] });
  act(T, 'int/draw');
  const [t1] = T.int.tabs;
  assert.equal(t1.q, 2);
  act(T, 'int/dims', { t: 'a', s: 4, q: 3 });
  const [u1, tf] = T.int.tabs;
  assert.equal(u1.size, 12); assert.equal(u1.q, 3); assert.equal(u1.rounds.length, 2);
  assert.ok(tf.lines.includes('Q:a:2'), 'nouvelle place de qualifié au tableau final');
  assert.equal(u1.lines.filter(x => Int.joueur(T.int, x)).length, 10, 'les joueurs restent dans le tableau');
  act(T, 'int/dims', { t: 'a', s: 8, q: 2 });
  assert.ok(!T.int.tabs[1].lines.includes('Q:a:2'), 'place en trop retirée');
  assert.throws(() => act(T, 'int/dims', { t: 'a', s: 2, q: 2 }), /ne suffisent pas/);
  assert.throws(() => act(T, 'int/dims', { t: 'a', s: 6, q: 2 }), /2, 4, 8, 16/);
  // une place de qualifié retirée à la main : signalée
  const L = T.int.tabs[1].lines.indexOf('Q:a:0');
  act(T, 'int/line', { t: '', L, x: 'BYE' });
  assert.ok(Int.controles(T.int).some(c => /qualifié 1 manque/.test(c.txt)));
});

test('poules : un joueur change de poule ou échange sa place', () => {
  const T = nouveau(8);
  act(T, 'int/setup', { mode: 'poules', pcfg: { n: 2, q: 1 } });
  act(T, 'int/draw');
  const [A, B] = T.int.poules, x = A.joueurs[0], y = B.joueurs[0];
  act(T, 'int/poule/move', { id: x, k: 1, avec: y });
  assert.ok(T.int.poules[1].joueurs.includes(x) && T.int.poules[0].joueurs.includes(y));
  assert.ok(T.int.poules[1].matches.some(m => m.a === x || m.b === x), 'matchs refaits');
  act(T, 'int/poule/move', { id: x, k: 0 });
  assert.equal(T.int.poules[0].joueurs.length, 5);
  assert.ok(Int.controles(T.int).some(c => /même nombre de joueurs, à une unité près/.test(c.txt)), 'poules de 5 et 3 : signalé (art. 54)');
});
