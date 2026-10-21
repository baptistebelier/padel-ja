/* Outils communs aux tests : moteur, hasard reproductible, tournoi de démonstration */
const E = require('../public/js/engine.js');

// générateur pseudo-aléatoire à graine fixe : un même test donne toujours le même tirage
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const act = (T, type, payload, rand) => E.reduce(T, { type, payload: payload || {} }, rand);

// tournoi de démo (16 paires inscrites), réglages éventuels, puis tirage 100 % ordinateur
function demoTournament(opts = {}) {
  const rand = seeded(opts.seed || 42);
  const T = E.initialState();
  act(T, 'demo/load', { n: opts.pairs || 16 }, rand);
  if (opts.fields) act(T, 'tournament/update', opts.fields);
  if (opts.courts) {
    while (T.courts.length < opts.courts) act(T, 'court/add');
    while (T.courts.length > opts.courts) act(T, 'court/remove', { id: T.courts[T.courts.length - 1].id });
  }
  if (opts.draw !== false) act(T, 'draw/create', {}, rand);
  return T;
}

// joue tous les matchs jouables (vainqueur choisi par `pick`) jusqu'à ce qu'il n'en reste plus
function playAll(T, pick = () => 'A') {
  for (let guard = 0; guard < 500; guard++) {
    const R = E.resolve(T);
    const m = T.matches.find(x => R[x.id].state === 'ready' || R[x.id].state === 'live');
    if (!m) return;
    act(T, 'match/winner', { id: m.id, team: pick(m, R) });
  }
  throw new Error('playAll : boucle sans fin');
}

// points d'un jeu blanc gagné par `w`
const game = w => [w, w, w, w];
const repeat = (arr, n) => Array.from({ length: n }, () => arr).flat();

module.exports = { E, seeded, act, demoTournament, playAll, game, repeat };
