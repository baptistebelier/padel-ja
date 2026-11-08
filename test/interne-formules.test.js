/* Tournoi interne : poules puis tableau final (art. 53 à 56), TMC (art. 51 bis), consolante (art. 51-2),
   programmation et alertes (art. 13 et 14), place des qualifiés entrants (méthode FFT d'établissement des tableaux) */
const test = require('node:test');
const assert = require('node:assert/strict');
const Int = require('../public/js/interne.js');

const nouveau = (n, cl, opts = {}) => {
  const T = Int.initialState(Object.assign({ name: 'Interne', sport: 'Tennis' }, opts));
  for (let i = 1; i <= n; i++) Int.reduce(T, { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i], cl: cl ? cl(i) : 'NC' } });
  return T;
};
const act = (T, type, payload) => Int.reduce(T, { type, payload });
const jouer = (T, m, w, sc = '6-1 6-1') => act(T, 'int/result', { m: m.id, w, sc });

test('poules : 6 au plus, une tête de série par poule (la n° 1 dans la dernière), effectifs à une unité près', () => {
  const cl = i => ['15', '15/1', '15/2', '30', '30/1', '30/2', '30/3', '30/4', '40', 'NC', 'NC'][i - 1];
  const T = nouveau(11, cl);
  act(T, 'int/setup', { mode: 'poules', pcfg: { n: 2, q: 2 } });
  assert.throws(() => act(T, 'int/setup', { pcfg: { n: 2, q: 9 } }), /1 à 3 qualifiés/);
  act(T, 'int/draw');
  const [A, B] = T.int.poules;
  assert.deepEqual([A.joueurs.length, B.joueurs.length].sort(), [5, 6]);
  assert.ok(B.joueurs.includes('j1') && B.ts.j1 === 1, 'tête de série n° 1 dans la dernière poule');
  assert.ok(A.joueurs.includes('j2') && A.ts.j2 === 2);
  assert.equal(A.matches.length, A.joueurs.length * (A.joueurs.length - 1) / 2, 'chacun rencontre tous les autres');
  const N = nouveau(14);
  act(N, 'int/setup', { mode: 'poules', pcfg: { n: 2, q: 1 } });
  assert.throws(() => act(N, 'int/draw'), /Six joueurs au plus/);
});

test('classement d’une poule : 2 points par victoire, 1 par défaite, 0 par forfait ; manches, jeux, puis confrontation', () => {
  const T = nouveau(4);
  act(T, 'int/setup', { mode: 'poules', pcfg: { n: 1, q: 2 } });
  act(T, 'int/draw');
  const po = T.int.poules[0], m = (a, b) => po.matches.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  // j1 bat tout le monde ; j2, j3, j4 gagnent chacun une fois entre eux : départagés aux manches puis aux jeux
  jouer(T, m('j1', 'j2'), 'j1'); jouer(T, m('j1', 'j3'), 'j1'); jouer(T, m('j1', 'j4'), 'j1');
  jouer(T, m('j2', 'j3'), 'j2', '6-0 6-0');
  jouer(T, m('j3', 'j4'), 'j3', '6-4 6-4');
  act(T, 'int/result', { m: m('j4', 'j2').id, w: 'j4', wo: true });
  const c = Int.classementPoule(T.int, po);
  assert.equal(c[0].id, 'j1'); assert.equal(c[0].pts, 6);
  const j2 = c.find(x => x.id === 'j2'), j4 = c.find(x => x.id === 'j4');
  assert.equal(j2.pts, 3, 'une victoire, une défaite jouée, une défaite par forfait : 2 + 1 + 0');
  assert.equal(j4.pts, 4, 'victoire par forfait : 2 points');
  assert.ok(Int.pouleFinie(po));
  // les qualifiés de la poule entrent au tableau final
  const tf = T.int.tabs[0];
  const noms = tf.rounds[0].flatMap(x => [x.a, x.b]).filter(Boolean);
  assert.ok(noms.includes('j1') && noms.includes(c[1].id), 'le 1er et le 2e sont au tableau final');
  // effacer un résultat de la poule est refusé quand le tableau final a commencé
  const f = tf.rounds[0].find(x => x.a && x.b && x.a !== 'BYE');
  jouer(T, f, f.a);
  assert.throws(() => act(T, 'int/reset', { m: m('j1', 'j2').id }), /tableau final a commencé/);
});

test('poules et entrées directes : les mieux classés attendent au tableau final, le 2e d’une poule dans l’autre moitié que le 1er', () => {
  const cl = i => (i <= 8 ? 'NC' : ['15', '15/1', '15/2', '15/3'][i - 9]);
  const T = nouveau(12, cl);
  act(T, 'int/setup', { mode: 'poules', pcfg: { n: 2, q: 2, max: '30/1' } });
  act(T, 'int/draw');
  assert.equal(T.int.poules.flatMap(p => p.joueurs).length, 8);
  const tf = T.int.tabs[0];
  assert.equal(tf.size, 8);
  for (const k of [0, 1]) {
    const L1 = tf.lines.indexOf('P:' + k + ':1'), L2 = tf.lines.indexOf('P:' + k + ':2');
    assert.ok(L1 >= 0 && L2 >= 0);
    assert.notEqual(L1 < 4, L2 < 4, 'poule ' + k + ' : 1er et 2e dans des moitiés différentes');
  }
  assert.equal(Int.nomDe(T.int, 'P:0:1'), '1er de la poule a');
});

test('TMC : tableau principal (n° 1 en bas, n° 2 en haut), tableaux de classement, chacun classé de 1 à 8', () => {
  const cl = i => ['15', '15/1', '15/2', '15/3', '30', '30/1', '30/2', '30/3'][i - 1];
  const T = nouveau(8, cl);
  act(T, 'int/setup', { mode: 'tmc' });
  act(T, 'int/draw');
  const main = T.int.tabs[0];
  assert.equal(main.lines.indexOf('j1'), 7, 'n° 1 en bas');
  assert.equal(main.lines.indexOf('j2'), 0, 'n° 2 en haut');
  assert.deepEqual(T.int.tabs.map(t => t.nom), ['Tableau principal', 'Places 5 à 8', 'Places 3 et 4', 'Places 7 et 8']);
  assert.throws(() => act(T, 'int/consol', { ids: ['j1', 'j2'] }), /Pas de consolante/);
  // tout jouer : le mieux classé gagne toujours
  for (let tour = 0; tour < 10; tour++) Int.allMatches(T.int).filter(m => Int.etat(m) === 'ready').forEach(m => jouer(T, m, +m.a.slice(1) < +m.b.slice(1) ? m.a : m.b));
  // 2 têtes de série à 8 (le quart du tableau) : 1 et 2 ne se croisent qu'en finale, les autres places dépendent du tirage
  const pl = Int.places(T.int);
  assert.deepEqual(pl.map(x => x.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(pl.slice(0, 2).map(x => x.id), ['j1', 'j2']);
  assert.equal(new Set(pl.map(x => x.id)).size, 8, 'chacun a une place');
  assert.equal(pl[7].id, 'j8', 'le moins bien classé, battu partout, est dernier');
  assert.ok(Int.allMatches(T.int).every(m => m.w), 'tout le monde a joué tous ses matchs');
  const n = {}; Int.allMatches(T.int).forEach(m => [m.a, m.b].forEach(x => { n[x] = (n[x] || 0) + 1; }));
  assert.ok(Object.values(n).every(v => v === 3), 'trois matchs chacun');
  const G = nouveau(33); act(G, 'int/setup', { mode: 'tmc' });
  assert.throws(() => act(G, 'int/draw'), /32 joueurs au plus/);
});

test('TMC à 6 : les exempts n’empêchent pas de classer chacun de 1 à 6', () => {
  const T = nouveau(6, i => ['15', '15/1', '30', '30/1', '30/2', '40'][i - 1]);
  act(T, 'int/setup', { mode: 'tmc' });
  act(T, 'int/draw');
  for (let tour = 0; tour < 10; tour++) Int.allMatches(T.int).filter(m => Int.etat(m) === 'ready').forEach(m => jouer(T, m, +m.a.slice(1) < +m.b.slice(1) ? m.a : m.b));
  assert.deepEqual(Int.places(T.int).map(x => x.place), [1, 2, 3, 4, 5, 6]);
  assert.equal(Int.places(T.int)[0].id, 'j1');
});

test('consolante : seulement des battus de l’épreuve principale ; son vainqueur à part', () => {
  const T = nouveau(8, i => ['15', '15/1', '15/2', '15/3', '30', '30/1', '30/2', '30/3'][i - 1]);
  act(T, 'int/draw');
  const r0 = T.int.tabs[0].rounds[0];
  r0.forEach(m => jouer(T, m, +m.a.slice(1) < +m.b.slice(1) ? m.a : m.b));
  const battus = Int.consolables(T.int).map(p => p.id).sort();
  assert.deepEqual(battus, r0.map(m => (+m.a.slice(1) < +m.b.slice(1) ? m.b : m.a)).sort(), 'les quatre battus du 1er tour');
  assert.throws(() => act(T, 'int/consol', { ids: ['j1', 'j5'] }), /Seuls les joueurs battus/);
  act(T, 'int/consol', { ids: battus });
  const C = Int.consolante(T.int);
  assert.equal(C.nom, 'Consolante'); assert.equal(C.size, 4);
  assert.equal(Int.nomTour(T.int, C.rounds[1][0]), 'Consolante · Finale');
  C.rounds.forEach(l => l.forEach(m => { const x = Int.findM(T.int, m.id); if (Int.etat(x) === 'ready') jouer(T, x, x.a); }));
  const x = Int.findM(T.int, C.rounds[1][0].id); if (Int.etat(x) === 'ready') jouer(T, x, x.a);
  assert.ok(Int.vainqueur(Int.consolante(T.int)));
  assert.equal(Int.champion(T.int), null, 'le vainqueur de la consolante n’est pas celui du tournoi');
});

test('qualifiés entrants : loin des têtes de série dans leur fraction', () => {
  // tableau 1 de 8 NC qualifiant 2 ; tableau final de 6 classés + 2 qualifiés : dimension 8
  const cl = i => (i <= 8 ? 'NC' : ['15', '15/1', '15/2', '15/3', '15/4', '15/5'][i - 9]);
  const T = nouveau(14, cl);
  act(T, 'int/setup', { struct: [{ max: '30/1', q: 2 }] });
  act(T, 'int/draw');
  const tf = T.int.tabs[1], L = ['Q:a:0', 'Q:a:1'].map(t => tf.lines.indexOf(t)).sort((a, b) => a - b);
  assert.ok(L[0] >= 2 && L[0] < 4, 'demi-tableau haut : partie basse de la moitié');
  assert.ok(L[1] >= 4 && L[1] < 6, 'demi-tableau bas : partie haute de la moitié');
  // plus de qualifiés entrants que d'admis directs dans un tableau intermédiaire : refusé
  const U = nouveau(10, i => (i <= 8 ? 'NC' : i === 9 ? '30' : '15'));
  act(U, 'int/setup', { struct: [{ max: '30/1', q: 3 }, { max: '15/1', q: 1 }] });
  assert.throws(() => act(U, 'int/draw'), /3 qualifiés entrants pour 1 joueur/);
});

test('programmation : pas avant 7 heures, alertes de parties par jour, de repos, de terrain et de 12 heures', () => {
  const T = nouveau(4, i => ['15', '30', '30/1', '40'][i - 1]);
  act(T, 'int/setup', { prog: true, terrains: ['Court 1', 'Court 2', 'Court 1'], format: 2 });
  assert.deepEqual(T.int.terrains, ['Court 1', 'Court 2']);
  act(T, 'int/draw');
  const [m1, m2] = T.int.tabs[0].rounds[0], f = T.int.tabs[0].rounds[1][0];
  assert.throws(() => act(T, 'int/prog', { m: m1.id, d: '2030-05-11', h: '06:30' }), /avant 7 heures/);
  act(T, 'int/prog', { m: m1.id, d: '2030-05-11', h: '09:00', c: 'Court 1' });
  act(T, 'int/prog', { m: m2.id, d: '2030-05-11', h: '09:30', c: 'Court 1' });
  assert.ok(Int.alertes(T.int).some(a => /Court 1 : deux matchs en même temps/.test(a.txt)));
  act(T, 'int/prog', { m: m2.id, d: '2030-05-11', h: '09:00', c: 'Court 2' });
  // finale le même jour, 30 min après la fin estimée (1 h 45 en format 2) : repos insuffisant (1 h 30)
  jouer(T, m1, m1.a); jouer(T, m2, m2.a);
  act(T, 'int/prog', { m: f.id, d: '2030-05-11', h: '11:15', c: 'Court 1' });
  assert.ok(Int.alertes(T.int).some(a => /de repos entre ses matchs/.test(a.txt)), JSON.stringify(Int.alertes(T.int)));
  act(T, 'int/prog', { m: f.id, d: '2030-05-11', h: '14:30', c: 'Court 1' });
  assert.deepEqual(Int.alertes(T.int), []);
  // le lendemain à 7 h après un match fini vers 16 h 15 : moins de 12 heures ? non (15 h) ; à la veille 22 h → oui
  act(T, 'int/prog', { m: f.id, d: '2030-05-12', h: '07:00', c: 'Court 1' });
  assert.deepEqual(Int.alertes(T.int), []);
  act(T, 'int/prog', { m: m1.id, d: '2030-05-11', h: '22:00', c: 'Court 2' });
  assert.ok(Int.alertes(T.int).some(a => /moins de 12 heures/.test(a.txt)));
  assert.equal(Int.progNom(Int.findM(T.int, f.id)), 'dim. 12/05 à 07h00 · Court 1');
  act(T, 'int/prog', { m: f.id, d: '' });
  assert.equal(Int.findM(T.int, f.id).d, undefined, 'déprogrammé');
});

test('limite de parties par jour selon le format et la catégorie', () => {
  const T = nouveau(8);
  act(T, 'int/setup', { format: 2, categorie: 'seniors' });
  act(T, 'int/draw');
  const [q1, q2] = T.int.tabs[0].rounds[0], d = T.int.tabs[0].rounds[1][0], fin = T.int.tabs[0].rounds[2][0];
  jouer(T, q1, q1.a); jouer(T, q2, q2.a);
  const r0 = T.int.tabs[0].rounds[0]; jouer(T, r0[2], r0[2].a); jouer(T, r0[3], r0[3].a);
  const d2 = T.int.tabs[0].rounds[1][1];
  jouer(T, d, d.a); jouer(T, d2, d2.a);
  act(T, 'int/prog', { m: q1.id, d: '2030-06-01', h: '08:00' });
  act(T, 'int/prog', { m: d.id, d: '2030-06-01', h: '12:00' });
  act(T, 'int/prog', { m: fin.id, d: '2030-06-01', h: '17:00' });
  assert.ok(Int.alertes(T.int).some(a => /3 matchs le sam\. 01\/06, 2 au plus au format 2/.test(a.txt)));
});

test('avis : poules annoncées en un message par joueur, programmation annoncée', () => {
  const T = nouveau(6);
  act(T, 'int/setup', { mode: 'poules', pcfg: { n: 2, q: 1 } });
  const A0 = JSON.parse(JSON.stringify(T));
  act(T, 'int/draw');
  const av = Int.avis(A0, T);
  assert.equal(av.filter(x => /^Poule [AB] : tu rencontres/.test(x.body)).length, 6, 'un message par joueur');
  assert.ok(!av.some(x => /ton adversaire est/.test(x.body)), 'pas un message par match de poule');
  const m = T.int.poules[0].matches[0], A1 = JSON.parse(JSON.stringify(T));
  act(T, 'int/prog', { m: m.id, d: '2030-05-11', h: '10:00', c: 'Court 3' });
  const p = Int.avis(A1, T);
  assert.equal(p.length, 2);
  assert.match(p[0].body, /est programmé le sam\. 11\/05 à 10h00 · Court 3/);
});
