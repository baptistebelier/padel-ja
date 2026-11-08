/* /RAM Club : la page d'un tournoi interne dessinée à partir de sa vraie publication (poules, arbre des tableaux,
   programmation, classement du TMC), sans erreur et avec les branches de l'arbre */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const Int = require('../public/js/interne.js');
const { createJaClub } = require('../lib/jaclub.js');

const { postInterne } = createJaClub({});
const salle = () => {
  const ctx = { M: {}, S: {}, A: {}, V: {}, posts: [], ME: () => 'k1', esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    ic: n => '<svg data-ic="' + n + '"></svg>', empty: (a, b) => b, av: () => '', first: x => x, document: { addEventListener() {} }, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'club', 'app', '20-interne.js'), 'utf8') + '\n;globalThis.__ = { intView, intPost, intArbre };', ctx);
  return ctx;
};
const nouveau = (n, cl) => {
  const T = Int.initialState({ name: 'Interne', sport: 'Tennis' });
  for (let i = 1; i <= n; i++) Int.reduce(T, { type: 'int/player/add', payload: { n: 'Joueur ' + i, ks: ['k' + i], cl: cl ? cl(i) : 'NC' } });
  return T;
};
const afficher = T => {
  const ctx = salle(), post = Object.assign({ id: 'ja-x' }, postInterne({ id: 'x', state: T, created_at: 1 }));
  ctx.posts.push(post);
  return { html: ctx.__.intView('ja-x'), mur: ctx.__.intPost(post) };
};

test('Club : poules et tableau final, programmation visible dans « mon prochain match »', () => {
  const T = nouveau(8);
  Int.reduce(T, { type: 'int/setup', payload: { mode: 'poules', pcfg: { n: 2, q: 1 }, prog: true } });
  Int.reduce(T, { type: 'int/draw' });
  const m = T.int.poules.flatMap(p => p.matches).find(x => x.a === 'j1' || x.b === 'j1');
  Int.reduce(T, { type: 'int/prog', payload: { m: m.id, d: '2030-05-11', h: '10:00', c: 'Court 2' } });
  const { html, mur } = afficher(T);
  assert.match(html, /Poule A/); assert.match(html, /Poule B/);
  assert.match(html, /int-pt/, 'tableau de classement de la poule');
  assert.match(html, /class="ab"/, 'arbre du tableau final');
  assert.match(html, /1er de la poule/, 'places des qualifiés de poule');
  assert.match(mur, /Programmé le sam\. 11\/05 à 10h00 · Court 2/);
});

test('Club : tableaux publiés un par un, le joueur en attente de son tableau ou qualifié pour le suivant le sait', () => {
  // j1 (le joueur connecté, clé k1) est classé 15 : son tableau final n'est pas encore tiré
  const T = nouveau(7, i => (i === 1 ? '15' : i === 2 ? '15/1' : ['NC', '40', '30/5', '30/4', '30/3'][i - 3]));
  Int.reduce(T, { type: 'int/setup', payload: { struct: [{ max: '30/3', q: 1 }] } });
  Int.reduce(T, { type: 'int/tab/draw' });
  assert.match(afficher(T).mur, /Ton tableau n’est pas encore tiré/);
  // un joueur du tableau 1 (connecté : on prend sa clé) qui gagne sa section : qualifié pour un tableau pas encore tiré
  const U = nouveau(4, i => ['NC', '40', '30/5', '15'][i - 1]);
  Int.reduce(U, { type: 'int/setup', payload: { struct: [{ max: '30/3', q: 1 }] } });
  Int.reduce(U, { type: 'int/tab/draw' });
  for (let k = 0; k < 4; k++) Int.allMatches(U.int).filter(m => Int.etat(m) === 'ready').forEach(m => Int.reduce(U, { type: 'int/result', payload: { m: m.id, w: m.a === 'j1' || m.b === 'j1' ? 'j1' : m.a, sc: '6-1 6-1' } }));
  assert.match(afficher(U).mur, /Qualifié pour le tableau suivant/);
});

test('Club : arbre avec branches, exempts cachés, sections et TMC classé', () => {
  const T = nouveau(6, i => ['15', '15/1', '30', '30/1', '30/2', '40'][i - 1]);
  Int.reduce(T, { type: 'int/draw' });
  const { html } = afficher(T);
  assert.equal((html.match(/ab-up/g) || []).length > 0, true, 'des branches relient les joueurs d’un match');
  assert.equal((html.match(/ab-x/g) || []).length, 4, 'deux matchs d’exempts : quatre traits cachés au 1er tour');
  assert.match(html, /class="ab-ts">1</, 'tête de série cerclée');
  const U = nouveau(8, i => ['15', '15/1', '15/2', '15/3', '30', '30/1', '30/2', '30/3'][i - 1]);
  Int.reduce(U, { type: 'int/setup', payload: { mode: 'tmc' } });
  Int.reduce(U, { type: 'int/draw' });
  for (let k = 0; k < 10; k++) Int.allMatches(U.int).filter(m => Int.etat(m) === 'ready').forEach(m => Int.reduce(U, { type: 'int/result', payload: { m: m.id, w: m.a, sc: '6-1 6-1' } }));
  const t = afficher(U).html;
  assert.match(t, /Places 5 à 8/); assert.match(t, /int-cl/, 'classement de 1 à 8');
});
