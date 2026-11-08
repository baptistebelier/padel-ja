/* Tournoi interne : tableaux à sections publiés un par un. On lance le tournoi avec un seul tableau
   (NC à 30/3, 4 qualifiés), on ajoute des participants classés au-dessus pendant qu'il se joue, puis on
   ajoute et tire les tableaux suivants jusqu'au tableau final. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Int = require('../public/js/interne.js');

const act = (T, type, payload) => Int.reduce(T, { type, payload });
const ajouter = (T, n, cl) => act(T, 'int/player/add', { n, ks: ['k' + n], cl });

test('un seul tableau à sections au départ, puis les tableaux suivants et des participants en cours de tournoi', () => {
  const T = Int.initialState({ name: 'Interne par séries', sport: 'Tennis' });
  const bas = ['NC', 'NC', '40', '40', '30/5', '30/5', '30/4', '30/4', '30/3', '30/3', 'NC', '40'];
  bas.forEach((cl, i) => ajouter(T, 'Bas ' + (i + 1), cl));
  act(T, 'int/setup', { struct: [{ max: '30/3', q: 4 }] });
  // tirer seulement le tableau 1 : 12 joueurs, 4 sections de 4
  act(T, 'int/tab/draw');
  const I = T.int;
  assert.equal(I.tabs.length, 1);
  assert.equal(I.tabs[0].nom, 'Tableau 1'); assert.equal(I.tabs[0].plage, 'NC à 30/3'); assert.equal(I.tabs[0].q, 4);
  assert.equal(I.status, 'live');
  assert.equal(Int.final(I), null, 'pas encore de tableau final');
  assert.equal(Int.champion(I), null);
  assert.deepEqual(Int.controles(I), [], 'le tableau publié est conforme, rien ne manque');
  // ajouter un joueur trop faible : refusé ; classé au-dessus : accepté
  assert.throws(() => ajouter(T, 'Tard', '30/4'), /classé 30\/2 ou mieux/);
  ajouter(T, 'Milieu 1', '30/2'); ajouter(T, 'Milieu 2', '30/1'); ajouter(T, 'Milieu 3', '30'); ajouter(T, 'Milieu 4', '15/5');
  ajouter(T, 'Milieu 5', '30/2'); ajouter(T, 'Milieu 6', '30/1');
  assert.equal(Int.ajoutPossible(I).min, '30/2');
  // un joueur placé ne change plus de classement et ne se retire plus ; un joueur en attente, si
  assert.throws(() => act(T, 'int/player/cl', { id: 'j1', cl: '15' }), /classement ne change plus/);
  assert.throws(() => act(T, 'int/player/remove', { id: 'j1' }), /ne peut plus être retiré/);
  act(T, 'int/player/cl', { id: 'j18', cl: '30' });
  assert.throws(() => act(T, 'int/player/cl', { id: 'j18', cl: 'NC' }), /classé 30\/2 ou mieux/);
  // le tableau 1 se joue pendant ce temps
  const m = I.tabs[0].rounds[0].find(x => Int.etat(x) === 'ready');
  act(T, 'int/result', { m: m.id, w: m.a, sc: '6-2 6-2' });
  // découpage : le tableau 1 ne change plus, on ajoute le tableau 2 (30/2 à 15/5, 2 qualifiés)
  assert.throws(() => act(T, 'int/setup', { struct: [{ max: '30/2', q: 4 }, { max: '15/5', q: 2 }] }), /tableau 1 est tiré/);
  act(T, 'int/setup', { struct: [{ max: '30/3', q: 4 }, { max: '15/5', q: 2 }] });
  const x = Int.prochain(I);
  assert.equal(x.spec.nom, 'Tableau 2'); assert.equal(x.spec.plage, '30/2 à 15/5');
  assert.equal(x.direct.length, 6); assert.equal(x.qIn.length, 4);
  act(T, 'int/tab/draw');
  assert.equal(I.tabs.length, 2);
  assert.equal(I.tabs[1].lines.filter(l => /^Q:a:/.test(l)).length, 4, 'les 4 qualifiés du tableau 1 ont leur place');
  assert.deepEqual(Int.controles(I), []);
  // encore des participants, assez classés pour le tableau final pas encore tiré
  assert.throws(() => ajouter(T, 'Trop tard', '30/1'), /classé 15\/4 ou mieux/);
  ajouter(T, 'Haut 1', '15/4'); ajouter(T, 'Haut 2', '15/1'); ajouter(T, 'Haut 3', '15');
  // le tableau final : les 2 qualifiés du tableau 2 et les mieux classés
  act(T, 'int/tab/draw');
  const tf = Int.final(I);
  assert.ok(tf && tf.role === 'final' && tf.nom === 'Tableau final');
  assert.equal(tf.lines.filter(l => /^Q:b:/.test(l)).length, 2);
  assert.throws(() => act(T, 'int/tab/draw'), /Tous les tableaux sont tirés/);
  assert.throws(() => ajouter(T, 'Hors délai', '-15'), /plus aucun participant/);
  assert.throws(() => act(T, 'int/setup', { struct: [{ max: '30/3', q: 4 }, { max: '15/5', q: 2 }, { max: '5/6', q: 1 }] }), /tableau final est tiré/);
  assert.deepEqual(Int.controles(I), []);
  // retirer le dernier tableau tiré tant qu'il n'a pas de résultat
  act(T, 'int/tab/undraw');
  assert.equal(Int.final(I), null);
  act(T, 'int/tab/draw', { vierge: true });
  assert.ok(Int.final(I).lines.every(l => l === 'BYE' || /^Q:/.test(l)), 'tableau final vierge : seules les places des qualifiés');
});

test('tableau final avec plus de qualifiés que de joueurs directs : tiré quand même (art. 50-3), sans alerte', () => {
  const T = Int.initialState({ sport: 'Tennis' });
  ['NC', 'NC', '40', '40', '30/5', '30/5', '30/4', '30/4', '30/3', '30/3', '15/4'].forEach((cl, i) => ajouter(T, 'J' + i, cl));
  act(T, 'int/setup', { struct: [{ max: '30/3', q: 4 }] });
  act(T, 'int/tab/draw'); act(T, 'int/tab/draw');
  const tf = Int.final(T.int);
  assert.equal(tf.lines.filter(x => /^Q:/.test(x)).length, 4);
  assert.deepEqual(Int.controles(T.int), []);
});

test('un tableau qui ne peut pas être tiré ne change rien', () => {
  const T = Int.initialState({ sport: 'Tennis' });
  ['NC', 'NC', '40'].forEach((cl, i) => ajouter(T, 'J' + i, cl));
  act(T, 'int/setup', { struct: [{ max: '30/3', q: 4 }] });
  assert.throws(() => act(T, 'int/tab/draw'), /Réduis le nombre de qualifiés/);
  assert.equal(T.int.tabs.length, 0);
  assert.equal(T.int.status, 'setup');
});
