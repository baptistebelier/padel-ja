/* Tournoi interne selon les règlements sportifs FFT 2027 : formats de match, têtes de série, exempts,
   tableaux successifs à sections et qualifiés, anciens tournois toujours lisibles */
const test = require('node:test');
const assert = require('node:assert/strict');
const Int = require('../public/js/interne.js');

const CL = ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1', '30', '15/5', '15/4', '15/3', '15/2', '15/1', '15', '5/6', '4/6'];
const nouveau = (n, cl = i => CL[i % CL.length], opts = {}) => {
  const T = Int.initialState(Object.assign({ name: 'Interne', sport: 'Tennis' }, opts));
  for (let i = 1; i <= n; i++) Int.reduce(T, { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i], cl: cl(i) } });
  return T;
};
const act = (T, type, payload) => Int.reduce(T, { type, payload });
const ligne = (tab, id) => tab.lines.indexOf(id);

test('formats : scores possibles et impossibles, écrits d’un côté ou de l’autre', () => {
  const ok = (f, s) => Int.verifScore(f, s);
  assert.equal(ok(2, '6-3 6-4').sc, '6-3 6-4');
  assert.equal(ok(2, '3-6 4-6').sc, '6-3 6-4', 'écrit du côté du perdant : retourné');
  assert.equal(ok(2, '6-3 3-6 10-7').sc, '6-3 3-6 10-7');
  assert.equal(ok(2, '7-6(5) 7-5').sc, '7-6(5) 7-5');
  assert.equal(ok(2, '6-3 3-6 7-5').ok, false, 'format 2 : la 3e manche est un super jeu décisif');
  assert.equal(ok(1, '6-3 3-6 7-5').ok, true);
  assert.equal(ok(2, '6-5 6-4').ok, false);
  assert.equal(ok(2, '6-3 3-6 11-10').ok, false, 'super jeu décisif : deux points d’écart');
  assert.equal(ok(2, '6-3 3-6 12-10').ok, true);
  assert.equal(ok(5, '3-2 3-1').ok, true, 'format 5 : jeu décisif à 2-2');
  assert.equal(ok(5, '4-2 3-1').ok, false);
  assert.equal(ok(6, '4-3 4-2').ok, true, 'format 6 : jeu décisif à 3-3');
  assert.equal(ok(3, '5-4 5-3').ok, true, 'format 3 : jeu décisif à 4-4');
  assert.equal(ok(7, '5-4 5-3').ok, true, 'format 7 : jeu décisif à 4-4');
  assert.equal(ok(2, '6-3 6-4 6-0').ok, false, 'une manche de trop');
  assert.equal(ok(2, '6-3').ok, false);
  assert.match(ok(2, 'six trois').err, /illisible/);
  assert.equal(ok(2, '6-3 2-1 ab.').ok, true, 'abandon');
  assert.equal(ok(0, 'n’importe quoi').ok, true, 'score libre (padel)');
});

test('résultat refusé s’il ne respecte pas le format ; double : point décisif obligatoire', () => {
  const T = nouveau(2);
  act(T, 'int/draw');
  const m = T.int.tabs[0].rounds[0][0];
  assert.throws(() => act(T, 'int/result', { m: m.id, w: m.a, sc: '6-3 3-6 7-5' }), /impossible au format 2/);
  assert.throws(() => act(T, 'int/result', { m: m.id, w: m.a, sc: '' }), /Indique le score/);
  act(T, 'int/result', { m: m.id, w: m.a, sc: '4-6 3-6' });
  assert.equal(Int.findM(T.int, m.id).sc, '6-4 6-3', 'rangé du côté du vainqueur');
  act(T, 'int/reset', { m: m.id });
  act(T, 'int/result', { m: m.id, w: m.b, wo: true });
  assert.equal(Int.champion(T.int), m.b, 'forfait : sans score');
  const D = Int.initialState({ sport: 'Tennis' });
  act(D, 'int/setup', { simple: false });
  assert.equal(D.int.format, 4, 'passage en double : format avec point décisif');
  assert.throws(() => act(D, 'int/setup', { format: 2 }), /point décisif est obligatoire/);
});

test('tableau final : têtes de série par classement, le quart de la dimension, exempts aux premières', () => {
  // 12 joueurs : dimension 16, 4 têtes de série, 4 exempts
  const T = nouveau(12, i => ['15/1', '15/2', '15/3', '15/4', '30', '30', '30/1', '30/2', '30/3', '30/4', '40', 'NC'][i - 1]);
  act(T, 'int/draw');
  const tab = T.int.tabs[0];
  assert.equal(tab.size, 16);
  assert.deepEqual(Object.entries(tab.ts).sort((a, b) => a[1] - b[1]).map(x => x[0]), ['j1', 'j2', 'j3', 'j4'], 'têtes de série dans l’ordre du classement');
  assert.equal(ligne(tab, 'j1'), 0, 'n° 1 en haut');
  assert.equal(ligne(tab, 'j2'), 15, 'n° 2 en bas');
  assert.deepEqual([ligne(tab, 'j3'), ligne(tab, 'j4')].sort((a, b) => a - b), [4, 11], '3 et 4 : haut du 2e quart, bas du 3e quart');
  for (const id of ['j1', 'j2', 'j3', 'j4']) assert.equal(tab.lines[ligne(tab, id) ^ 1], 'BYE', id + ' exempt');
  assert.equal(tab.lines.filter(x => x === 'BYE').length, 4);
});

test('plus d’exempts que de têtes de série : les mieux classés suivants, placés comme des têtes de série', () => {
  // 10 joueurs : dimension 16, 4 têtes de série, 6 exempts → j5 et j6 exempts aussi (places des têtes de série 5 à 8)
  const T = nouveau(10, i => ['15', '15/1', '15/2', '15/3', '30', '30/1', '30/2', '30/3', '40', 'NC'][i - 1]);
  act(T, 'int/draw');
  const tab = T.int.tabs[0], places58 = [2, 6, 9, 13];
  for (const id of ['j5', 'j6']) {
    assert.ok(places58.includes(ligne(tab, id)), id + ' à une place de tête de série 5-8');
    assert.equal(tab.lines[ligne(tab, id) ^ 1], 'BYE');
  }
  for (const id of ['j7', 'j8', 'j9', 'j10']) assert.notEqual(tab.lines[ligne(tab, id) ^ 1], 'BYE', id + ' joue le premier tour');
});

test('que des non-classés : pas de tête de série, les exempts tirés au sort aux places des têtes de série', () => {
  const T = nouveau(6, () => 'NC');
  act(T, 'int/draw');
  const tab = T.int.tabs[0];
  assert.deepEqual(tab.ts, {});
  assert.equal(tab.lines[1], 'BYE'); assert.equal(tab.lines[6], 'BYE');
});

test('tableaux successifs à sections : une section par qualifié, la tête de série n° 1 en bas de la dernière', () => {
  // tableau 1 : NC à 30/1 (14 joueurs), 3 qualifiés ; tableau final : 30 et mieux (5 joueurs) + 3 qualifiés
  const cl = i => (i <= 14 ? ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1'][i % 7] : ['30', '15/5', '15/4', '15/3', '15'][i - 15]);
  const T = nouveau(19, cl);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 3 }] });
  act(T, 'int/draw');
  const [t1, tf] = T.int.tabs;
  assert.equal(t1.nom, 'Tableau 1'); assert.equal(t1.plage, 'NC à 30/1'); assert.equal(tf.nom, 'Tableau final');
  assert.equal(t1.q, 3); assert.equal(t1.s, 8, 'sections de 8 : 3 × 8 ≥ 14'); assert.equal(t1.size, 24);
  assert.equal(t1.rounds.length, 3, 'trois tours jusqu’au qualifié de chaque section');
  assert.equal(Object.keys(t1.ts).length, 3, 'une tête de série par section');
  const ts1 = Object.keys(t1.ts).find(k => t1.ts[k] === 1), ts2 = Object.keys(t1.ts).find(k => t1.ts[k] === 2), ts3 = Object.keys(t1.ts).find(k => t1.ts[k] === 3);
  assert.equal(ligne(t1, ts1), 23, 'n° 1 en bas de la section du bas');
  assert.equal(ligne(t1, ts2), 15, 'n° 2 en bas de la section du dessus');
  assert.equal(ligne(t1, ts3), 7);
  assert.equal(t1.lines.filter(x => x === 'BYE').length, 10);
  // tableau final : 8 places, 3 qualifiés jamais face à face, ni exempts si possible
  assert.equal(tf.size, 8);
  const qs = tf.lines.map((x, i) => [x, i]).filter(([x]) => String(x).startsWith('Q:'));
  assert.equal(qs.length, 3);
  qs.forEach(([, i]) => { assert.ok(!String(tf.lines[i ^ 1]).startsWith('Q:'), 'deux qualifiés ne se rencontrent pas d’entrée'); assert.notEqual(tf.lines[i ^ 1], 'BYE'); });
  assert.equal(Int.nomDe(T.int, qs[0][0]).startsWith('Qualifié'), true);
});

test('qualifiés : le vainqueur de la section entre dans le tableau suivant, les avis suivent', () => {
  const cl = i => (i <= 4 ? 'NC' : '15');
  const T = nouveau(6, cl);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 2 }] });
  act(T, 'int/draw');
  const [t1, tf] = T.int.tabs;
  assert.equal(t1.s, 2);
  const m = t1.rounds[0][0], tok = 'Q:a:0', L = tf.lines.indexOf(tok), mf = tf.rounds[0][L >> 1];
  assert.equal(Int.nomTour(T.int, m), 'Tableau 1 · Tour qualificatif');
  assert.equal(mf[L % 2 ? 'b' : 'a'], null, 'qualifié pas encore connu');
  assert.deepEqual(Int.suivant(T.int, m), { m: mf, side: L % 2 ? 'b' : 'a' });
  assert.equal(Int.avant(T.int, mf, L % 2 ? 'b' : 'a'), m);
  const A = JSON.parse(JSON.stringify(T));
  act(T, 'int/result', { m: m.id, w: m.a, sc: '6-1 6-1' });
  assert.equal(Int.findM(T.int, mf.id)[L % 2 ? 'b' : 'a'], m.a, 'le qualifié entre dans le tableau final');
  const av = Int.avis(A, T);
  assert.ok(av.some(x => x.to[0] === m.a && /Tableau final/.test(x.body)), 'le qualifié connaît son adversaire du tableau final');
  // effacer le résultat de la section retire le qualifié du tableau final
  act(T, 'int/reset', { m: m.id });
  assert.equal(Int.findM(T.int, mf.id)[L % 2 ? 'b' : 'a'], null);
  // un résultat du tableau final bloque l'effacement de la section
  act(T, 'int/result', { m: m.id, w: m.b, sc: '6-1 6-1' });
  const adv = Int.findM(T.int, mf.id);
  act(T, 'int/result', { m: mf.id, w: adv.a, sc: '6-2 6-2' });
  assert.throws(() => act(T, 'int/reset', { m: m.id }), /suivant est déjà joué/);
});

test('structure : limites croissantes, assez de joueurs par tableau ; classement modifiable avant le tirage', () => {
  const T = nouveau(4, () => 'NC');
  assert.throws(() => act(T, 'int/setup', { struct: [{ max: '15', q: 2 }, { max: '30', q: 1 }] }), /dépasser/);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 3 }] });
  act(T, 'int/player/cl', { id: 'j4', cl: '15/2' });
  assert.equal(T.int.players[3].cl, '15/2');
  assert.throws(() => act(T, 'int/draw'), /Tableau 1 \(NC à 30\/1\) : 3 joueurs pour 3 qualifiés/);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 1 }] });
  act(T, 'int/player/cl', { id: 'j4', cl: 'NC' });
  assert.throws(() => act(T, 'int/draw'), /Tableau final.*au moins deux joueurs/, 'un seul qualifié et personne d’autre au tableau final');
  // tableau final de seuls qualifiés : ils se rencontrent (art. 45-3-c)
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 2 }] });
  act(T, 'int/draw');
  assert.deepEqual(T.int.tabs[1].lines.slice().sort(), ['Q:a:0', 'Q:a:1']);
});

test('ancien tournoi tiré avant les tableaux successifs : relu tel quel, ses matchs gardent leur identifiant', () => {
  const T = nouveau(4);
  act(T, 'int/draw');
  // état d'avant : un seul « bracket » et les dates limites à part
  const tab = T.int.tabs[0];
  T.int.bracket = { size: tab.size, rounds: tab.rounds }; T.int.tours = tab.tours; delete T.int.tabs; delete T.int.format;
  assert.equal(Int.tabsOf(T.int).length, 1);
  const m = Int.findM(T.int, 'r0m0');
  assert.ok(m);
  act(T, 'int/result', { m: 'r0m0', w: m.a, sc: 'score libre' });
  assert.ok(Array.isArray(T.int.tabs) && !T.int.bracket, 'converti à la première modification');
  assert.equal(T.int.format, 0, 'ancien tournoi : score libre');
});
