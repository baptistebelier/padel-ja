/* =========================================================================
   PADEL JA — Moteur partagé (serveur Node + navigateur)
   Score, formats FFT, formules (poules, qualifications, tableau final),
   tirage au sort par cartes, programmation, repos et contrôles réglementaires.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------------
     FORMATS DE JEU (Guide de la compétition padel 2027 — Chap. I)
     --------------------------------------------------------------------- */
  const FORMATS = {
    A1: { name: '3 sets à 6 jeux, jeu décisif à 6/6', sets: 3, games: 6, tbAt: 6, stbLast: false, decisive: false },
    A2: { name: '3 sets à 6 jeux, JD à 6/6, point décisif', sets: 3, games: 6, tbAt: 6, stbLast: false, decisive: true },
    B1: { name: '2 sets à 6 jeux (JD 6/6) + super JD à 10', sets: 3, games: 6, tbAt: 6, stbLast: true, decisive: false },
    B2: { name: '2 sets à 6 jeux + super JD, point décisif', sets: 3, games: 6, tbAt: 6, stbLast: true, decisive: true },
    C1: { name: '2 sets à 4 jeux (JD 4/4) + super JD à 10', sets: 3, games: 4, tbAt: 4, stbLast: true, decisive: false },
    C2: { name: '2 sets à 4 jeux + super JD, point décisif', sets: 3, games: 4, tbAt: 4, stbLast: true, decisive: true },
    D1: { name: '1 set à 9 jeux, JD à 8/8', sets: 1, games: 9, tbAt: 8, stbLast: false, decisive: false },
    D2: { name: '1 set à 9 jeux, JD à 8/8, point décisif', sets: 1, games: 9, tbAt: 8, stbLast: false, decisive: true },
    E:  { name: '1 super jeu décisif à 10 points', sets: 1, stbOnly: true, decisive: false },
    F:  { name: '1 set à 4 jeux, JD à 3/3, point décisif', sets: 1, games: 4, tbAt: 3, stbLast: false, decisive: true }
  };
  const FORMAT_KEYS = Object.keys(FORMATS);
  const REST = { A: 90, B: 60, C: 30, D: 30, E: 0, F: 15 };           // minutes (Chap. I « temps de repos »)
  const DEFAULT_DUR = { A: 95, B: 80, C: 50, D: 55, E: 20, F: 25 };   // estimations ajustables
  const NOT_EF = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

  /* ---------------------------------------------------------------------
     CAHIERS DES CHARGES (Chap. III — tournois seniors par paires)
     --------------------------------------------------------------------- */
  const CATEGORIES = {
    P25:   { formats: ['C1', 'C2', 'D1', 'D2', 'E', 'F'], selection: 'date', days: 1, minPairs: { Messieurs: 4, Dames: 4, Mixte: 4 },
             balls: '3 balles neuves par piste', ja: 'JAP1 minimum', forbid: 'Dames : TOP 3 000 — Messieurs : TOP 30 000', note: 'Formats E ou F conseillés.' },
    P50:   { formats: NOT_EF, selection: 'date', days: 3, minPairs: { Messieurs: 4, Dames: 4, Mixte: 4 },
             balls: '3 balles neuves par piste', ja: 'JAP1 minimum', forbid: 'Dames : TOP 1 000 — Messieurs : TOP 10 000' },
    P100:  { formats: NOT_EF, selection: 'date', days: 3, minPairs: { Messieurs: 8, Dames: 4, Mixte: 8 },
             balls: '3 / piste & 3 / match à partir des 1/2 finales', ja: 'JAP1 minimum', forbid: 'Dames : TOP 500 — Messieurs : TOP 5 000',
             classBalls: 'Obligatoire perdants 1/2 F' },
    P250:  { formats: NOT_EF, finalFormats: ['A1', 'A2', 'B1', 'B2'], selection: 'date', days: 3, minPairs: { Messieurs: 12, Dames: 4, Mixte: 12 },
             balls: '3 / piste & 3 / match à partir des 1/2 finales', ja: 'JAP2 minimum', forbid: 'Dames : TOP 100 — Messieurs : TOP 1 000',
             classBalls: 'Obligatoire perdants 1/2 F', note: 'Finale en A1 / A2 / B1 / B2.' },
    P500:  { formats: NOT_EF, finalFormats: ['A1', 'A2', 'B1', 'B2'], semiFormats: ['A1', 'A2', 'B1', 'B2'], selection: 'weight', deadlineDays: 7, days: 3,
             minPairs: { Messieurs: 24, Dames: 8, Mixte: 24 }, balls: '3 balles neuves par match', ja: 'JAP2 minimum',
             note: '1/2 finales et finale en A1 / A2 / B1 / B2. Sélection au poids, clôture J-7 à 23h59.' },
    P1000: { formats: ['A1', 'A2', 'B1', 'B2'], selection: 'weight', deadlineDays: 7, days: 3, minPairs: { Messieurs: 24, Dames: 16, Mixte: 24 },
             balls: '3 balles neuves par match', ja: 'JAP2 minimum', note: 'Sélection au poids, clôture J-7 à 23h59.' },
    P2000: { formats: ['A1', 'B1'], selection: 'weight', deadlineDays: 14, days: 3, minPairs: { Messieurs: 24, Dames: 24, Mixte: 24 },
             balls: '3 balles / match, changement au 3e set (format A1)', ja: 'JAP3', note: 'Qualifs & 1/16 en B1, A1 à partir des 1/8. Clôture J-14.' }
  };

  const FORMULAS = {
    tf: 'Tableau final direct',
    qualif_tf: 'Qualifications + tableau final',
    poules_tf: 'Poules + tableau final',
    poules: 'Poules uniquement'
  };

  const ROUND_NAMES = { 2: 'Finale', 4: '1/2 finale', 8: '1/4 de finale', 16: '1/8 de finale', 32: '1/16 de finale', 64: '1/32 de finale', 128: '1/64 de finale' };
  const ROUND_SHORT = { 2: 'F', 4: '1/2', 8: '1/4', 16: '1/8', 32: '1/16', 64: '1/32', 128: '1/64' };
  const PHASE_ORDER = { P: 0, Q: 1, TF: 2 };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const other = t => (t === 'A' ? 'B' : 'A');
  const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);
  const MIN = 60000;

  /* ---------------------------------------------------------------------
     SCORE EN DIRECT — rejoue l'historique des points (annulation fiable)
     --------------------------------------------------------------------- */
  function computeScore(fk, points, firstServer) {
    const f = FORMATS[fk] || FORMATS.B2;
    const need = Math.ceil(f.sets / 2);
    const sets = [];
    const won = { A: 0, B: 0 };
    let g = { A: 0, B: 0 }, p = { A: 0, B: 0 };
    let server = firstServer || 'A', tbFirst = null, winner = null;
    const modeFor = () => (f.stbOnly || (f.stbLast && sets.length === f.sets - 1) ? 'stb' : 'game');
    let mode = modeFor();
    if (mode !== 'game') tbFirst = server;

    function endSet(w, tb) {
      sets.push({ A: g.A, B: g.B, tb: mode === 'tb' ? tb : null, stb: mode === 'stb' ? tb : null, w });
      won[w]++;
      g = { A: 0, B: 0 }; p = { A: 0, B: 0 };
      if (won[w] >= need) winner = w;
      else { mode = modeFor(); if (mode !== 'game') tbFirst = server; }
    }

    for (const w of points || []) {
      if (winner) break;
      const l = other(w);
      p[w]++;
      if (mode === 'game') {
        const gameWon = f.decisive ? p[w] >= 4 : p[w] >= 4 && p[w] - p[l] >= 2;
        if (gameWon) {
          g[w]++; p = { A: 0, B: 0 }; server = other(server);
          if (g[w] >= f.games && g[w] - g[l] >= 2) endSet(w, null);
          else if (g.A === f.tbAt && g.B === f.tbAt) { mode = 'tb'; tbFirst = server; }
        }
      } else {
        const target = mode === 'tb' ? 7 : 10;
        if (p[w] >= target && p[w] - p[l] >= 2) {
          const tb = { A: p.A, B: p.B };
          if (mode === 'tb') g[w]++;
          server = other(tbFirst);
          endSet(w, tb);
        } else if ((p.A + p.B) % 2 === 1) server = other(server);
      }
    }
    return {
      format: fk, sets, games: g, points: p, mode, server, winner, setsWon: won,
      labels: pointLabels(p, mode, f.decisive),
      decisivePoint: !winner && f.decisive && mode === 'game' && p.A === 3 && p.B === 3
    };
  }

  /* découpage de l'historique des points en jeux (pour ajouter / retirer un jeu) */
  const gameKey = sc => `${sc.sets.length}:${sc.games.A}:${sc.games.B}`;
  function gameSegments(fk, points, firstServer) {
    const out = [];
    let from = 0, prev = gameKey(computeScore(fk, [], firstServer));
    for (let i = 1; i <= (points || []).length; i++) {
      const k = gameKey(computeScore(fk, points.slice(0, i), firstServer));
      if (k !== prev) { out.push({ from, to: i, w: points[i - 1] }); from = i; prev = k; }
    }
    return out;
  }

  function pointLabels(p, mode, decisive) {
    if (mode !== 'game') return { A: String(p.A), B: String(p.B) };
    const L = ['0', '15', '30', '40'];
    if (p.A >= 3 && p.B >= 3) {
      if (decisive || p.A === p.B) return { A: '40', B: '40' };
      return p.A > p.B ? { A: 'AV', B: '40' } : { A: '40', B: 'AV' };
    }
    return { A: L[Math.min(p.A, 3)], B: L[Math.min(p.B, 3)] };
  }

  function pointFlags(fk, points, firstServer) {
    const s0 = computeScore(fk, points, firstServer);
    const out = { A: null, B: null, decisive: s0.decisivePoint };
    if (s0.winner) return out;
    for (const X of ['A', 'B']) {
      const s1 = computeScore(fk, (points || []).concat(X), firstServer);
      if (s1.winner === X) out[X] = 'BALLE DE MATCH';
      else if (s1.sets.length > s0.sets.length) out[X] = 'BALLE DE SET';
      else if (s0.mode === 'game' && X !== s0.server && s1.games[X] > s0.games[X]) out[X] = 'BALLE DE BREAK';
    }
    return out;
  }

  function setsText(sets) {
    return (sets || []).map(s => {
      if (s.stb) return `[${s.stb.A}-${s.stb.B}]`;
      let t = `${s.A}-${s.B}`;
      if (s.tb) t += `(${Math.min(s.tb.A, s.tb.B)})`;
      return t;
    }).join(' ');
  }

  function manualToSets(fk, arr) {
    const f = FORMATS[fk] || FORMATS.B2;
    return (arr || []).map((s, i) => {
      const a = +s[0], b = +s[1];
      const isStb = f.stbOnly || (f.stbLast && i === f.sets - 1);
      if (isStb) return { A: 0, B: 0, stb: { A: a, B: b }, tb: null, w: a > b ? 'A' : 'B' };
      return { A: a, B: b, tb: null, stb: null, w: a > b ? 'A' : 'B' };
    });
  }

  /* ---------------------------------------------------------------------
     PAIRES : poids, sélection, liste d'attente
     --------------------------------------------------------------------- */
  const NC_RANK = 99999;
  const rankOf = pl => { const r = parseInt(pl && pl.rank, 10); return isNaN(r) ? NC_RANK : r; };
  const weightOf = pair => rankOf(pair.p1) + rankOf(pair.p2);
  const isPair = t => typeof t === 'string' && t !== 'BYE' && t.indexOf(':') < 0;

  function tokenLabel(t) {
    if (t === 'BYE') return 'Exempt';
    if (typeof t !== 'string') return '';
    if (t.startsWith('q:')) return 'Qualifié ' + t.slice(2);
    if (t.startsWith('g:')) { const [, L, r] = t.split(':'); return (r === '1' ? '1er' : r + 'e') + ' poule ' + L; }
    return '';
  }

  function selection(T) {
    const t = T.tournament;
    const cat = CATEGORIES[t.category] || CATEGORIES.P100;
    const active = T.pairs.filter(p => !p.withdrawn);
    const withdrawn = T.pairs.filter(p => p.withdrawn);
    const byDate = (a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || '');
    const byWeight = (a, b) => weightOf(a) - weightOf(b) || byDate(a, b);
    let main, waiting;
    if (T.draw) {
      const inDraw = new Set(T.draw.entrants || []);
      main = T.pairs.filter(p => inDraw.has(p.id));
      waiting = active.filter(p => !inDraw.has(p.id));
    } else {
      const sorted = active.slice().sort(cat.selection === 'weight' ? byWeight : byDate);
      const wc = sorted.filter(p => p.wc), others = sorted.filter(p => !p.wc);
      const max = Math.max(0, (+t.maxPairs || 16) - wc.length);
      main = wc.concat(others.slice(0, max));
      waiting = others.slice(max);
    }
    main = main.slice().sort((a, b) => weightOf(a) - weightOf(b) || ((a.tie || 0) - (b.tie || 0)));
    waiting.sort(cat.selection === 'weight' ? byWeight : byDate);
    return { main, waiting, withdrawn, mode: cat.selection };
  }

  /* ---------------------------------------------------------------------
     PLAN DE LA FORMULE (aperçu avant tirage)
     --------------------------------------------------------------------- */
  const nextPow2 = n => { let s = 2; while (s < n) s *= 2; return s; };
  const defaultSeeds = n => nextPow2(Math.max(n, 2)) / 2;

  function pouleSizes(N, target) {
    const nP = Math.max(1, Math.round(N / Math.max(3, target || 4)));
    const base = Math.floor(N / nP), extra = N % nP;
    return Array.from({ length: nP }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function plan(T, N) {
    const t = T.tournament;
    if (N == null) N = selection(T).main.length;
    const f = t.formula || 'tf';
    const out = { formula: f, N };
    if (f === 'tf') { out.tfEntrants = N; out.tfSize = nextPow2(Math.max(N, 2)); }
    if (f === 'qualif_tf') {
      const Q = Math.max(1, +t.qualifCount || 4);
      const direct = Math.max(0, Math.min(+t.tfDirect || 12, N - Q - 1));
      out.Q = Q; out.direct = direct; out.qualifPairs = N - direct;
      out.qualifSize = nextPow2(Math.max(out.qualifPairs, 2 * Q));
      out.tfEntrants = direct + Q; out.tfSize = nextPow2(Math.max(out.tfEntrants, 2));
    }
    if (f === 'poules' || f === 'poules_tf') {
      out.sizes = pouleSizes(N, +t.pouleSize || 4);
      out.nP = out.sizes.length;
      out.matches = out.sizes.reduce((s, n) => s + n * (n - 1) / 2, 0);
      if (f === 'poules_tf') {
        const k = Math.max(1, +t.pouleQualif || 2);
        out.k = k;
        out.tfEntrants = out.sizes.reduce((s, n) => s + Math.min(k, n), 0);
        out.tfSize = nextPow2(Math.max(out.tfEntrants, 2));
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     TIRAGE AU SORT PAR CARTES
     Chaque chapeau = des cartes numérotées face cachée. Le logiciel associe
     au hasard, à l'avance, chaque numéro à une paire du chapeau. Le JA tire
     un numéro dans la vraie vie (papier, balle) et retourne la carte
     correspondante : la paire prend la prochaine place du chapeau.
     --------------------------------------------------------------------- */
  function seedOrder(S) {             // de haut en bas : TS1 en haut, TS2 en bas (ordre standard)
    let o = [1, 2];
    while (o.length < S) {
      const n = o.length * 2, r = [];
      o.forEach((s, i) => { if (i % 2 === 0) r.push(s, n + 1 - s); else r.push(n + 1 - s, s); });
      o = r;
    }
    return o;
  }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function makePot(label, positions, tokens, rand, hint) {
    return { label, hint: hint || '', positions, next: 0,
             cards: shuffle(tokens, rand).map((token, i) => ({ n: i + 1, token, pos: null, at: null })) };
  }

  function bracketSession(key, label, tokens, seeds, rand, outputs) {
    const N = tokens.length;
    let S = nextPow2(Math.max(N, 2));
    if (outputs) S = Math.max(S, 2 * outputs);
    seeds = outputs ? Math.min(outputs, N) : Math.max(1, Math.min(+seeds || defaultSeeds(N), N, S / 2));
    const order = seedOrder(S).reverse();             // FFT : TS1 en bas du tableau
    const slotOf = {}; order.forEach((v, i) => { slotOf[v] = i; });
    const fill = {};
    for (let v = N + 1; v <= S; v++) fill[slotOf[v]] = 'BYE';
    const pots = [];
    let lo = 1, size = 1;
    while (lo <= seeds) {
      const hi = Math.min(lo + size - 1, seeds);
      const positions = []; for (let v = lo; v <= hi; v++) positions.push(slotOf[v]);
      positions.sort((a, b) => a - b);
      const hint = lo === 1 ? 'En bas du tableau' : lo === 2 ? 'En haut du tableau' : `Places des têtes de série ${lo} à ${hi}`;
      pots.push(makePot(lo === hi ? `Tête de série ${lo}` : `Chapeau ${lo} – ${hi}`, positions, tokens.slice(lo - 1, hi), rand, hint));
      lo = hi + 1; size = lo <= 2 ? 1 : lo - 1;
    }
    const used = new Set(pots.flatMap(p => p.positions));
    const rest = []; for (let i = 0; i < S; i++) if (fill[i] == null && !used.has(i)) rest.push(i);
    if (tokens.length > seeds) pots.push(makePot(seeds ? `Chapeau ${seeds + 1} – ${N}` : 'Tirage intégral', rest, tokens.slice(seeds), rand, 'Autres places du tableau'));
    return { key, label, kind: 'bracket', size: S, seeds, fill, pots, outputs: outputs || null, done: false };
  }

  function poulesSession(tokens, sizes, method, rand) {
    const nP = sizes.length, fill = {}, pots = [];
    const maxRows = Math.max(...sizes);
    let idx = 0;
    for (let r = 0; r < maxRows; r++) {
      const ps = []; for (let p = 0; p < nP; p++) if (sizes[p] > r) ps.push(p);
      const rowTokens = tokens.slice(idx, idx + ps.length); idx += ps.length;
      if (method === 'rang') {
        pots.push(makePot(`Rang ${r + 1} — paires ${idx - ps.length + 1} à ${idx}`, ps.map(p => `${LETTERS[p]}:${r}`), rowTokens, rand, 'Une paire par poule, de la poule A à la dernière'));
      } else {
        const order = r % 2 === 0 ? ps : ps.slice().reverse();   // serpentin
        order.forEach((p, i) => { fill[`${LETTERS[p]}:${r}`] = rowTokens[i]; });
      }
    }
    return { key: 'poules', label: 'Poules', kind: 'poules', sizes, letters: LETTERS.slice(0, nP).split(''), method, fill, pots, done: !pots.length };
  }

  function pouleTfSession(sizes, k, rand) {
    const letters = LETTERS.slice(0, sizes.length).split('');
    const firsts = letters.map(L => `g:${L}:1`);
    const others = [];
    for (let r = 2; r <= k; r++) letters.forEach((L, i) => { if (sizes[i] >= r) others.push(`g:${L}:${r}`); });
    const N = firsts.length + others.length, S = nextPow2(Math.max(N, 2));
    const order = seedOrder(S).reverse();
    const slotOf = {}; order.forEach((v, i) => { slotOf[v] = i; });
    const fill = {};
    for (let v = N + 1; v <= S; v++) fill[slotOf[v]] = 'BYE';
    firsts.forEach((tk, i) => { fill[slotOf[i + 1]] = tk; });
    const half = s => (s < S / 2 ? 0 : 1);
    const firstSlot = {}; firsts.forEach((tk, i) => { firstSlot[tk.split(':')[1]] = slotOf[i + 1]; });
    shuffle(others, rand).forEach(tk => {
      const free = []; for (let i = 0; i < S; i++) if (fill[i] == null) free.push(i);
      const L = tk.split(':')[1];
      const opp = free.filter(s => half(s) !== half(firstSlot[L]));
      const pool = opp.length ? opp : free;
      fill[pool[Math.floor(rand() * pool.length)]] = tk;
    });
    return { key: 'tf', label: 'Tableau final', kind: 'bracket', size: S, seeds: firsts.length, fill, pots: [], done: true, auto: true };
  }

  function prepareDraw(T, opts, rand) {
    rand = rand || Math.random;
    opts = opts || {};
    const t = T.tournament;
    const sel = selection(T);
    sel.main.forEach(p => { p.tie = rand(); });
    const ordered = sel.main.slice().sort((a, b) => weightOf(a) - weightOf(b) || a.tie - b.tie);
    const N = ordered.length;
    if (N < 2) throw new Error('Il faut au moins 2 paires pour effectuer le tirage.');
    const ids = ordered.map(p => p.id);
    const P = plan(T, N);
    const D = { id: uid('d'), formula: P.formula, method: opts.method || 'physical', entrants: ids, seedNo: {}, sessions: [], built: false, createdAt: Date.now(), last: null };
    ids.forEach((id, i) => { D.seedNo[id] = i + 1; });
    if (P.formula === 'tf') D.sessions.push(bracketSession('tf', 'Tableau final', ids, opts.seeds, rand));
    if (P.formula === 'qualif_tf') {
      if (P.qualifPairs < P.Q + 1) throw new Error('Pas assez de paires pour les qualifications : réduisez le nombre d\'entrées directes.');
      D.sessions.push(bracketSession('qualif', 'Qualifications', ids.slice(P.direct), 0, rand, P.Q));
      const qTok = Array.from({ length: P.Q }, (_, i) => 'q:' + (i + 1));
      D.sessions.push(bracketSession('tf', 'Tableau final', ids.slice(0, P.direct).concat(qTok), Math.min(opts.seeds || defaultSeeds(P.tfEntrants), Math.max(1, P.direct)), rand));
    }
    if (P.formula === 'poules' || P.formula === 'poules_tf') {
      D.sessions.push(poulesSession(ids, P.sizes, t.pouleMethod || 'serpentin', rand));
      if (P.formula === 'poules_tf') D.sessions.push(pouleTfSession(P.sizes, P.k, rand));
    }
    D.sessions.forEach(s => { if (!s.pots.length) s.done = true; });
    return D;
  }

  function currentPot(D) {
    if (!D) return null;
    for (const s of D.sessions) {
      if (s.done) continue;
      for (let i = 0; i < s.pots.length; i++) if (s.pots[i].next < s.pots[i].cards.length) return { session: s, pot: s.pots[i], index: i };
    }
    return null;
  }

  function flipCard(T, n, rand) {
    const D = T.draw; const cur = currentPot(D);
    if (!cur) throw new Error('Le tirage est terminé.');
    const { session, pot } = cur;
    let card;
    if (n == null) { const left = pot.cards.filter(c => !c.pos && c.pos !== 0); card = left[Math.floor((rand || Math.random)() * left.length)]; }
    else card = pot.cards.find(c => c.n === +n);
    if (!card) throw new Error(`Pas de carte n°${n} dans ce chapeau (1 à ${pot.cards.length}).`);
    if (card.pos != null) throw new Error(`La carte n°${n} est déjà retournée.`);
    card.pos = pot.positions[pot.next++];
    card.at = Date.now();
    session.fill[card.pos] = card.token;
    D.last = { session: session.key, potLabel: pot.label, n: card.n, token: card.token, pos: card.pos, kind: session.kind, at: card.at };
    if (session.pots.every(p => p.next >= p.cards.length)) session.done = true;
    if (D.sessions.every(s => s.done) && !D.built) buildAll(T);
  }

  function sessionSlots(sess) {
    return Array.from({ length: sess.size }, (_, i) => (sess.fill[i] == null ? null : sess.fill[i]));
  }

  function posLabel(sess, pos) {
    if (sess.kind === 'poules') { const [L, r] = String(pos).split(':'); return `Poule ${L} · position ${+r + 1}`; }
    return `Ligne ${+pos + 1}`;
  }

  /* ---------------------------------------------------------------------
     CONSTRUCTION DES MATCHS
     --------------------------------------------------------------------- */
  function newMatch(id, o) {
    return Object.assign({ id, phase: 'TF', a: 1, size: 2, depth: 1, idx: 0, srcA: null, srcB: null, poule: null, qfinal: false,
      format: null, points: [], firstServer: 'A', manual: null, wo: null, status: 'pending', court: null, order: null,
      startedAt: null, endedAt: null, num: 0 }, o);
  }

  function roundRobin(list) {
    const a = list.slice(); if (a.length % 2) a.push(null);
    const n = a.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const ms = [];
      for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x && y) ms.push(r % 2 ? [y, x] : [x, y]); }
      rounds.push(ms);
      a.splice(1, 0, a.pop());
    }
    return rounds;
  }

  function buildAll(T) {
    const D = T.draw, t = T.tournament, ms = [];
    const tmc = (D.tfMode || t.drawMode) === 'tmc';
    T.poules = [];
    const ps = D.sessions.find(s => s.key === 'poules');
    if (ps) {
      ps.letters.forEach((L, p) => {
        const pairs = []; for (let r = 0; r < ps.sizes[p]; r++) pairs.push(ps.fill[`${L}:${r}`]);
        T.poules.push({ id: L, pairs });
        roundRobin(pairs).forEach((round, ri) => round.forEach((pr, i) => {
          ms.push(newMatch('g' + (ms.length + 1), { phase: 'P', poule: L, depth: ri + 1, idx: p * 10 + i, a: 0, size: 0, srcA: { pair: pr[0] }, srcB: { pair: pr[1] } }));
        }));
      });
    }
    const qualSrc = [];
    const qs = D.sessions.find(s => s.key === 'qualif');
    if (qs) {
      let srcs = sessionSlots(qs).map(tk => ({ pair: tk })), size = qs.size, depth = 1;
      while (size > qs.outputs) {
        const W = [];
        for (let i = 0; i < size / 2; i++) {
          const id = 'q' + (ms.length + 1);
          ms.push(newMatch(id, { phase: 'Q', a: 1, size, depth, idx: i, srcA: srcs[2 * i], srcB: srcs[2 * i + 1], qfinal: size / 2 === qs.outputs }));
          W.push({ from: id, take: 'W' });
        }
        srcs = W; size /= 2; depth++;
      }
      srcs.forEach(s => qualSrc.push(s));
    }
    const ts = D.sessions.find(s => s.key === 'tf');
    if (ts) {
      const toSrc = tk => {
        if (typeof tk === 'string' && tk.startsWith('q:')) return Object.assign({}, qualSrc[+tk.slice(2) - 1]);
        if (typeof tk === 'string' && tk.startsWith('g:')) { const [, L, r] = tk.split(':'); return { poule: L, rank: +r }; }
        return { pair: tk };
      };
      const B = (a, size, srcs, depth) => {
        if (size < 2) return;
        const W = [], L = [];
        for (let i = 0; i < size / 2; i++) {
          const id = 'm' + (ms.length + 1);
          ms.push(newMatch(id, { phase: 'TF', a, size, depth, idx: i, srcA: srcs[2 * i], srcB: srcs[2 * i + 1] }));
          W.push({ from: id, take: 'W' }); L.push({ from: id, take: 'L' });
        }
        B(a, size / 2, W, depth + 1);
        if (tmc) B(a + size / 2, size / 2, L, depth + 1);
        else if (t.thirdPlace && a === 1 && size === 4) B(3, 2, L, depth + 1);
      };
      B(1, ts.size, sessionSlots(ts).map(toSrc), 1);
    }
    T.matches = ms;
    D.built = true;
    numberMatches(T);
  }

  /* ---------------------------------------------------------------------
     ORDRE DES MATCHS (M1, M2…) — standard ou personnalisé par le club.
     Chaque match a une clé « structurelle » (phase, places, tour, rang) qui reste
     la même d'un tournoi à l'autre : l'ordre peut donc être gardé dans un modèle.
     --------------------------------------------------------------------- */
  function matchKey(m) {
    if (m.phase === 'P') return `P:${m.poule}:${m.depth}:${m.idx}`;
    if (m.phase === 'Q') return `Q:${m.size}:${m.idx}`;
    return `TF:${m.a}:${m.size}:${m.idx}`;
  }
  const standardCmp = (x, y) => PHASE_ORDER[x.phase] - PHASE_ORDER[y.phase] || x.depth - y.depth || x.a - y.a || x.idx - y.idx;
  function orderedMatches(T, R) {
    R = R || resolve(T);
    const list = T.matches.filter(m => !R[m.id].staticBye);
    if (!Array.isArray(T.order) || !T.order.length) return list.sort(standardCmp);
    const pos = {}; T.order.forEach((k, i) => { pos[k] = i; });
    const P = m => (matchKey(m) in pos ? pos[matchKey(m)] : 1e6);
    return list.sort((x, y) => P(x) - P(y) || standardCmp(x, y));
  }
  function numberMatches(T) {
    orderedMatches(T).forEach((m, i) => { m.num = i + 1; });
  }
  /* matchs placés avant un match dont ils dépendent */
  function orderIssues(T, R) {
    R = R || resolve(T);
    const byId = {}; T.matches.forEach(m => { byId[m.id] = m; });
    const out = [];
    T.matches.forEach(m => {
      if (R[m.id].staticBye) return;
      const late = depsOf(T, m).map(id => byId[id]).filter(d => d && !R[d.id].staticBye && d.num > m.num);
      if (late.length) out.push({ id: m.id, num: m.num, after: late.map(d => d.num) });
    });
    return out;
  }
  /* structure des matchs avant le tirage (simulation avec des paires fictives) */
  function previewStructure(T) {
    const t = T.tournament;
    const N = selection(T).main.length || +t.maxPairs || 0;
    if (N < 2) return null;
    const X = { tournament: JSON.parse(JSON.stringify(t)), courts: T.courts, draw: null, matches: [], poules: [], order: T.order || null,
      pairs: Array.from({ length: N }, (_, i) => ({ id: 'px' + i, p1: { last: 'Paire', first: '', rank: String(i + 1) }, p2: { last: String(i + 1), first: '', rank: '0' }, registeredAt: '', withdrawn: false })) };
    X.tournament.maxPairs = N;
    let seed = 7; const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    try {
      X.draw = prepareDraw(X, { method: 'auto' }, rand);
      while (currentPot(X.draw)) flipCard(X, null, rand);
      if (!X.draw.built) buildAll(X);
    } catch (e) { return null; }
    return X;
  }

  function matchLabel(m) {
    if (m.phase === 'P') return `Poule ${m.poule} · tour ${m.depth}`;
    if (m.phase === 'Q') return m.qfinal ? 'Qualifs · tour décisif' : `Qualifs · tour ${m.depth}`;
    if (m.a === 1) return ROUND_NAMES[m.size] || `Tour ${m.depth}`;
    if (m.size === 2) return m.a === 3 ? 'Petite finale (3e place)' : `Match pour la ${m.a}e place`;
    return `Places ${m.a}–${m.a + m.size - 1} · ${ROUND_SHORT[m.size] || ''}`;
  }

  function formatOf(T, m) {
    if (m.format) return m.format;
    const t = T.tournament;
    if (m.phase === 'P') return t.formatPoule || t.formatMain;
    if (m.phase === 'Q') return t.formatQualif || t.formatMain;
    if (m.a === 1 && m.size === 2) return t.formatFinal || t.formatSemi || t.formatMain;
    if (m.a === 1 && m.size === 4) return t.formatSemi || t.formatMain;
    if (m.a === 1 && m.size === 8) return t.formatQuarter || t.formatMain;
    if (m.a === 1) return t.formatMain;
    return t.formatClass || t.formatMain;
  }

  /* ---------------------------------------------------------------------
     RÉSOLUTION : qui joue quoi, qui gagne, état de chaque match
     --------------------------------------------------------------------- */
  function resolve(T) {
    const R = {};
    const pouleCache = {};
    const pouleRank = (L, rank) => {
      if (!(L in pouleCache)) pouleCache[L] = pouleStandings(T, R, L);
      const st = pouleCache[L];
      return st.complete && st.rows[rank - 1] ? st.rows[rank - 1].pair : null;
    };
    const side = src => {
      if (!src) return null;
      if (src.pair) return src.pair;
      if (src.poule) return pouleRank(src.poule, src.rank);
      const x = R[src.from]; if (!x) return null;
      return src.take === 'W' ? x.winner : x.loser;
    };
    const sside = src => {
      if (!src) return 'REAL';
      if (src.pair) return src.pair === 'BYE' ? 'BYE' : 'REAL';
      if (src.poule) return 'REAL';
      const x = R[src.from]; return x ? (src.take === 'W' ? x.sW : x.sL) : 'REAL';
    };
    for (const m of T.matches || []) {
      const A = side(m.srcA), B = side(m.srcB);
      const sA = sside(m.srcA), sB = sside(m.srcB);
      const r = { id: m.id, A, B, winner: null, loser: null, state: 'waiting', score: null, fk: formatOf(T, m),
                  staticBye: sA === 'BYE' || sB === 'BYE',
                  sW: sA === 'BYE' && sB === 'BYE' ? 'BYE' : 'REAL',
                  sL: sA === 'BYE' || sB === 'BYE' ? 'BYE' : 'REAL' };
      if (r.staticBye) {
        if (A && B) { r.state = 'bye'; if (A === 'BYE') { r.winner = B; r.loser = 'BYE'; } else { r.winner = A; r.loser = 'BYE'; } }
      } else if (A && B) {
        if (m.wo) {
          r.winner = m.wo === 'A' ? B : A; r.loser = m.wo === 'A' ? A : B; r.state = 'done'; r.woTeam = m.wo;
        } else if (m.manual) {
          r.score = { sets: manualToSets(r.fk, m.manual.sets), winner: m.manual.winner, manual: true };
          r.winner = m.manual.winner === 'A' ? A : B; r.loser = m.manual.winner === 'A' ? B : A; r.state = 'done';
        } else {
          r.score = computeScore(r.fk, m.points, m.firstServer);
          if (r.score.winner) { r.winner = r.score.winner === 'A' ? A : B; r.loser = r.score.winner === 'A' ? B : A; r.state = 'done'; }
          else r.state = m.status === 'live' ? 'live' : 'ready';
        }
      }
      R[m.id] = r;
    }
    return R;
  }

  function scoreText(r) {
    if (!r) return '';
    if (r.woTeam) return 'WO';
    if (!r.score) return '';
    let t = setsText(r.score.sets);
    if (r.state === 'live' && !r.score.manual && r.score.mode !== 'stb') t += (t ? ' ' : '') + `${r.score.games.A}-${r.score.games.B}`;
    return t;
  }

  /* Score vu du vainqueur : « 6-3 4-6 [10-8] » */
  function winnerScoreText(r) {
    if (!r || !r.score) return r && r.woTeam ? 'WO' : '';
    const w = r.score.winner || (r.winner === r.A ? 'A' : 'B'), l = other(w);
    return r.score.sets.map(s => (s.stb ? `[${s.stb[w]}-${s.stb[l]}]` : `${s[w]}-${s[l]}` + (s.tb ? `(${Math.min(s.tb.A, s.tb.B)})` : ''))).join(' ');
  }

  /* ---------------------------------------------------------------------
     POULES : classement (Chap. I — États des résultats)
     2 pts victoire, 1 pt défaite, -2 pts défaite par WO.
     Départage : diff. sets, diff. jeux, puis confrontations directes, puis tirage au sort.
     --------------------------------------------------------------------- */
  function matchStats(r, fk) {
    const f = FORMATS[fk] || FORMATS.B2;
    const s = { A: { sw: 0, sl: 0, gw: 0, gl: 0 }, B: { sw: 0, sl: 0, gw: 0, gl: 0 } };
    if (r.woTeam) {
      const w = other(r.woTeam), need = Math.ceil(f.sets / 2), games = f.stbOnly ? 1 : need * f.games;
      s[w].sw = need; s[r.woTeam].sl = need; s[w].gw = games; s[r.woTeam].gl = games;
      return s;
    }
    (r.score ? r.score.sets : []).forEach(x => {
      const w = x.w, l = other(w);
      s[w].sw++; s[l].sl++;
      const gA = x.stb ? (w === 'A' ? 1 : 0) : x.A, gB = x.stb ? (w === 'B' ? 1 : 0) : x.B;
      s.A.gw += gA; s.A.gl += gB; s.B.gw += gB; s.B.gl += gA;
    });
    return s;
  }

  function pouleStandings(T, R, L) {
    const P = (T.poules || []).find(p => p.id === L);
    if (!P) return { rows: [], complete: false };
    const ms = (T.matches || []).filter(m => m.phase === 'P' && m.poule === L);
    const rows = {}; P.pairs.forEach(id => { rows[id] = { pair: id, played: 0, won: 0, lost: 0, pts: 0, sw: 0, sl: 0, gw: 0, gl: 0 }; });
    const done = [];
    ms.forEach(m => {
      const r = R[m.id]; if (!r || r.state !== 'done') return;
      done.push({ m, r });
      const st = matchStats(r, r.fk);
      ['A', 'B'].forEach(sd => {
        const id = r[sd], x = rows[id]; if (!x) return;
        x.played++; x.sw += st[sd].sw; x.sl += st[sd].sl; x.gw += st[sd].gw; x.gl += st[sd].gl;
        if (r.winner === id) { x.won++; x.pts += 2; } else { x.lost++; x.pts += r.woTeam === sd ? -2 : 1; }
      });
    });
    const tie = id => { const p = T.pairs.find(x => x.id === id); return p && p.tie != null ? p.tie : 0; };
    let list = Object.values(rows).sort((a, b) => b.pts - a.pts || (b.sw - b.sl) - (a.sw - a.sl) || (b.gw - b.gl) - (a.gw - a.gl));
    // confrontations directes entre paires encore à égalité
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i + 1;
      while (j < list.length && list[j].pts === list[i].pts && list[j].sw - list[j].sl === list[i].sw - list[i].sl && list[j].gw - list[j].gl === list[i].gw - list[i].gl) j++;
      const grp = list.slice(i, j);
      if (grp.length > 1) {
        const ids = new Set(grp.map(x => x.pair));
        const h = {}; grp.forEach(x => { h[x.pair] = { s: 0, g: 0 }; });
        done.forEach(({ r }) => {
          if (!ids.has(r.A) || !ids.has(r.B)) return;
          const st = matchStats(r, r.fk);
          h[r.A].s += st.A.sw - st.A.sl; h[r.A].g += st.A.gw - st.A.gl;
          h[r.B].s += st.B.sw - st.B.sl; h[r.B].g += st.B.gw - st.B.gl;
        });
        grp.sort((a, b) => h[b.pair].s - h[a.pair].s || h[b.pair].g - h[a.pair].g || tie(a.pair) - tie(b.pair));
      }
      out.push(...grp); i = j;
    }
    out.forEach((x, i) => { x.rank = i + 1; });
    return { rows: out, complete: ms.length > 0 && ms.every(m => R[m.id] && R[m.id].state === 'done') };
  }

  /* Classement final */
  function standings(T, R) {
    const out = [];
    for (const m of T.matches || []) {
      if (m.phase !== 'TF' || m.size !== 2) continue;
      const r = R[m.id];
      if (r && (r.state === 'done' || r.state === 'bye')) {
        if (r.winner && r.winner !== 'BYE') out.push({ place: m.a, pair: r.winner });
        if (r.loser && r.loser !== 'BYE') out.push({ place: m.a + 1, pair: r.loser });
      }
    }
    if (T.draw && T.draw.formula === 'poules' && (T.poules || []).length === 1) {
      const st = pouleStandings(T, R, T.poules[0].id);
      if (st.complete) return st.rows.map(x => ({ place: x.rank, pair: x.pair }));
    }
    return out.sort((a, b) => a.place - b.place);
  }

  /* ---------------------------------------------------------------------
     PROGRAMMATION — estimation des horaires par terrain
     --------------------------------------------------------------------- */
  const letter = fk => (fk || 'B').charAt(0);
  const durOf = (T, fk) => ((T.tournament.durations || {})[letter(fk)] || DEFAULT_DUR[letter(fk)]) * MIN;
  const restOf = fk => REST[letter(fk)] * MIN;

  function baseTime(T, court) {
    const d = T.tournament.dateStart || localNow().slice(0, 10);
    const h = (court && court.start) || T.tournament.startTime || '09:00';
    return new Date(`${d}T${h}:00`).getTime();
  }

  function depsOf(T, m) {
    const out = [];
    [m.srcA, m.srcB].forEach(s => {
      if (!s) return;
      if (s.from) out.push(s.from);
      if (s.poule) T.matches.forEach(x => { if (x.phase === 'P' && x.poule === s.poule) out.push(x.id); });
    });
    return out;
  }

  const sortKey = (x, y) => PHASE_ORDER[x.phase] - PHASE_ORDER[y.phase] || x.depth - y.depth || x.a - y.a || x.idx - y.idx;

  function timeline(T, R, now) {
    R = R || resolve(T);
    now = now || Date.now();
    const started = (T.matches || []).some(m => m.status !== 'pending' || m.points.length);
    const floor = started ? now : 0;
    const times = {}, pairFree = {};
    const queues = T.courts.map(c => ({ c, q: T.matches.filter(m => m.court === c.id && !R[m.id].staticBye).sort((a, b) => a.order - b.order), i: 0, free: baseTime(T, c) }));
    const scheduled = new Set(T.matches.filter(m => m.court).map(m => m.id));
    const deps = m => depsOf(T, m).filter(id => scheduled.has(id) && !R[id].staticBye);
    const place = (Q, force) => {
      const m = Q.q[Q.i];
      const d = deps(m);
      if (!force && d.some(id => !times[id])) return false;
      const r = R[m.id];
      let ready = 0;
      d.forEach(id => { if (times[id]) ready = Math.max(ready, times[id].end + (R[id].state === 'done' ? 0 : restOf(R[id].fk))); });
      [r.A, r.B].forEach(p => { if (p && pairFree[p]) ready = Math.max(ready, pairFree[p]); });
      let start, end;
      if (r.state === 'done' && m.startedAt) { start = m.startedAt; end = m.endedAt || m.startedAt + durOf(T, r.fk); }
      else if (r.state === 'done') { start = Q.free; end = m.endedAt || start; }
      else if (m.status === 'live' && m.startedAt) { start = m.startedAt; end = Math.max(now + 5 * MIN, start + durOf(T, r.fk)); }
      else { start = Math.max(Q.free, ready, floor); end = start + durOf(T, r.fk); }
      times[m.id] = { start, end, court: Q.c.id };
      [r.A, r.B].forEach(p => { if (p && p !== 'BYE') pairFree[p] = end + restOf(r.fk); });
      Q.free = end; Q.i++;
      return true;
    };
    let guard = 0;
    while (queues.some(Q => Q.i < Q.q.length) && guard++ < 5000) {
      let progress = false;
      queues.slice().sort((a, b) => a.free - b.free).forEach(Q => { while (Q.i < Q.q.length && place(Q, false)) progress = true; });
      if (!progress) {
        const Q = queues.filter(Q => Q.i < Q.q.length).sort((a, b) => a.free - b.free)[0];
        place(Q, true);
      }
    }
    return times;
  }

  function autoSchedule(T) {
    const R = resolve(T);
    const now = Date.now();
    T.matches.forEach(m => { if (R[m.id].state !== 'done' && m.status !== 'live') { m.court = null; m.order = null; } });
    const kept = timeline(T, R, now);
    const free = {}, count = {};
    T.courts.forEach(c => {
      const mine = T.matches.filter(m => m.court === c.id);
      free[c.id] = Math.max(baseTime(T, c), ...mine.map(m => (kept[m.id] ? kept[m.id].end : 0)));
      count[c.id] = mine.length ? Math.max(...mine.map(m => m.order || 0)) + 1 : 0;
    });
    const started = T.matches.some(m => m.status !== 'pending' || m.points.length);
    const end = {}, pairFree = {};
    Object.keys(kept).forEach(id => {
      end[id] = kept[id].end;
      const r = R[id]; [r.A, r.B].forEach(p => { if (p) pairFree[p] = Math.max(pairFree[p] || 0, kept[id].end + (r.state === 'done' ? restOf(r.fk) : restOf(r.fk))); });
    });
    const rest = T.matches.filter(m => !R[m.id].staticBye && !m.court && R[m.id].state !== 'done').sort((x, y) => x.num - y.num || sortKey(x, y));
    // on suit l'ordre M1, M2… mais un match ne passe jamais avant ceux dont il dépend
    const placed = new Set(Object.keys(end));
    const needs = m => depsOf(T, m).filter(id => !R[id].staticBye && R[id].state !== 'done' && !placed.has(id));
    const todo = [];
    while (rest.length) {
      const i = rest.findIndex(m => needs(m).every(id => !rest.some(x => x.id === id)));
      const m = rest.splice(i < 0 ? 0 : i, 1)[0];
      todo.push(m); placed.add(m.id);
    }
    for (const m of todo) {
      const r = R[m.id];
      let ready = started ? now : 0;
      depsOf(T, m).forEach(id => { if (end[id] && !R[id].staticBye) ready = Math.max(ready, end[id] + restOf(R[id].fk)); });
      [r.A, r.B].forEach(p => { if (p && pairFree[p]) ready = Math.max(ready, pairFree[p]); });
      let best = null, bestStart = Infinity;
      T.courts.forEach(c => { const st = Math.max(free[c.id], ready); if (st < bestStart) { bestStart = st; best = c.id; } });
      if (!best) break;
      m.court = best; m.order = count[best]++;
      end[m.id] = bestStart + durOf(T, r.fk);
      free[best] = end[m.id];
      [r.A, r.B].forEach(p => { if (p) pairFree[p] = end[m.id] + restOf(r.fk); });
    }
  }

  function moveMatch(T, id, court, index) {
    const m = T.matches.find(x => x.id === id); if (!m) return;
    const oldCourt = m.court;
    m.court = court || null;
    const renum = cid => {
      const list = T.matches.filter(x => x.court === cid && x !== m).sort((a, b) => a.order - b.order);
      if (cid === m.court) { const i = Math.max(0, Math.min(index == null ? list.length : index, list.length)); list.splice(i, 0, m); }
      list.forEach((x, i) => { x.order = i; });
    };
    if (oldCourt && oldCourt !== m.court) renum(oldCourt);
    if (m.court) renum(m.court); else m.order = null;
  }

  /* ---------------------------------------------------------------------
     REPOS DES PAIRES & MATCHS PAR JOUR
     --------------------------------------------------------------------- */
  function restMsAfter(fk, eStreak) {
    if (letter(fk) === 'E') return eStreak > 0 && eStreak % 3 === 0 ? 15 * MIN : 0;
    return restOf(fk);
  }

  function pairsStatus(T, R, tl, now) {
    R = R || resolve(T); now = now || Date.now(); tl = tl || timeline(T, R, now);
    const ids = T.draw ? T.draw.entrants : [];
    const out = {};
    ids.forEach(id => { out[id] = { pair: id, played: 0, lastEnd: null, lastFk: null, eStreak: 0, live: null, next: null, nextStart: null, alive: false }; });
    const done = T.matches.filter(m => R[m.id].state === 'done' && m.endedAt).sort((a, b) => a.endedAt - b.endedAt);
    done.forEach(m => {
      const r = R[m.id];
      [r.A, r.B].forEach(p => {
        const x = out[p]; if (!x) return;
        x.played++; x.lastEnd = m.endedAt; x.lastFk = r.fk;
        x.eStreak = letter(r.fk) === 'E' ? x.eStreak + 1 : 0;
      });
    });
    T.matches.forEach(m => {
      const r = R[m.id];
      if (r.state === 'live') [r.A, r.B].forEach(p => { if (out[p]) out[p].live = m.id; });
      if (r.state === 'ready' || r.state === 'waiting') {
        [r.A, r.B].forEach(p => {
          const x = out[p]; if (!x) return;
          x.alive = true;
          const st = tl[m.id] ? tl[m.id].start : Infinity;
          if (!x.next || st < x.nextStart) { x.next = m.id; x.nextStart = st; }
        });
      }
    });
    // une paire encore « vivante » peut attendre un match pas encore résolu (vainqueur de…)
    Object.values(out).forEach(x => {
      if (x.live) { x.state = 'playing'; return; }
      x.restUntil = x.lastEnd ? x.lastEnd + restMsAfter(x.lastFk, x.eStreak) : null;
      x.waiting = x.lastEnd ? now - x.lastEnd : null;
      if (!x.lastEnd) x.state = x.next ? 'fresh' : 'idle';
      else if (now < x.restUntil) x.state = 'rest';
      else x.state = x.next ? 'ready' : 'idle';
      x.restLeft = x.restUntil ? Math.max(0, x.restUntil - now) : 0;
    });
    return out;
  }

  function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  function dayChecks(T, R, tl) {
    R = R || resolve(T); tl = tl || timeline(T, R);
    const per = {};
    T.matches.forEach(m => {
      const r = R[m.id]; if (r.staticBye || r.state === 'bye' || !r.A || !r.B || r.woTeam) return;
      const ts = m.startedAt || (tl[m.id] && tl[m.id].start); if (!ts) return;
      [r.A, r.B].forEach(p => { const k = p + '|' + dayKey(ts); (per[k] = per[k] || []).push(letter(r.fk)); });
    });
    const W = [];
    const name = id => { const p = T.pairs.find(x => x.id === id); return p ? `${(p.p1.last || '').toUpperCase()} / ${(p.p2.last || '').toUpperCase()}` : id; };
    Object.keys(per).forEach(k => {
      const [pair, day] = k.split('|'), L = per[k], n = L.length;
      const c = x => L.filter(y => x.includes(y)).length;
      const msg = [];
      if (n >= 3 && n <= 5 && c('EF')) msg.push('formats E/F interdits');
      if ((n === 3 || n === 4) && c('A') > 2) msg.push('2 matchs max. en format A');
      if (n === 4 && !c('CD')) msg.push('1 match obligatoire en C ou D');
      if (n === 5 && c('A')) msg.push('format A interdit');
      if (n === 5 && c('CD') < 3) msg.push('3 matchs min. en C/D');
      if (n === 5 && c('B') > 2) msg.push('2 matchs max. en B');
      if (n === 6 && c('ABEF')) msg.push('formats C/D uniquement');
      if (n >= 7 && c('CD') > 2) msg.push('2 matchs max. en C/D (E/F conseillés)');
      if (msg.length) W.push({ lvl: 'err', pair, day, n, msg: `${name(pair)} — ${n} matchs le ${new Date(day).toLocaleDateString('fr-FR')} : ${msg.join(', ')}.` });
    });
    T.matches.forEach(m => {
      const t = tl[m.id]; if (!t || R[m.id].state === 'done') return;
      const s = new Date(t.start), e = new Date(t.end);
      if (s.getHours() < 7 || dayKey(t.start) !== dayKey(t.end - 1)) W.push({ lvl: 'warn', msg: `M${m.num} estimé entre ${s.toTimeString().slice(0, 5)} et ${e.toTimeString().slice(0, 5)} : aucune rencontre après minuit ni avant 7h.` });
    });
    return W;
  }

  /* ---------------------------------------------------------------------
     CONTRÔLE DES RÈGLES (avertissements pour le JA)
     --------------------------------------------------------------------- */
  function checkRules(T) {
    const t = T.tournament, cat = CATEGORIES[t.category];
    const W = [];
    if (!cat) return W;
    const sel = selection(T);
    const min = cat.minPairs[t.gender] || 4;
    if (sel.main.length < min) W.push({ lvl: 'warn', msg: `${t.category} ${t.gender} : minimum ${min} paires (actuellement ${sel.main.length}).` });
    const check = (fk, label, allowed) => { if (fk && allowed && !allowed.includes(fk)) W.push({ lvl: 'err', msg: `Format ${fk} non autorisé pour ${label} en ${t.category} (autorisés : ${allowed.join(', ')}).` }); };
    const f = t.formula || 'tf';
    if (f !== 'poules') {
      check(t.formatMain, 'le tableau final', cat.formats);
      check(t.formatQuarter || t.formatMain, 'les 1/4 de finale', cat.formats);
      check(t.formatSemi || t.formatMain, 'les 1/2 finales', cat.semiFormats || cat.formats);
      check(t.formatFinal || t.formatSemi || t.formatMain, 'la finale', cat.finalFormats || cat.formats);
      if (t.drawMode === 'tmc') check(t.formatClass, 'les matchs de classement', cat.formats);
    }
    if (f.startsWith('poules')) check(t.formatPoule || t.formatMain, 'les poules', cat.formats);
    if (f === 'qualif_tf') check(t.formatQualif || t.formatMain, 'les qualifications', cat.formats);
    const P = plan(T, sel.main.length);
    const minMatches = ['E', 'F'].includes(letter(t.formatMain)) ? 5 : 3;
    if (f === 'tf' && t.drawMode !== 'tmc') W.push({ lvl: 'warn', msg: `Élimination directe : une paire peut ne jouer qu'un match. Le minimum est de ${minMatches} matchs par paire (TMC ou poules recommandés).` });
    if (f === 'tf' && t.drawMode === 'tmc' && P.tfSize < 8) W.push({ lvl: 'warn', msg: `TMC de ${P.tfSize} places : moins de 3 matchs garantis. Préférez une poule unique.` });
    if (f === 'poules' && P.sizes && Math.min(...P.sizes) < 4) W.push({ lvl: 'warn', msg: 'Poule de 3 paires : seulement 2 matchs par paire.' });
    if (f === 'poules_tf' && P.sizes && Math.min(...P.sizes) < 3) W.push({ lvl: 'warn', msg: 'Poules trop petites.' });
    if (f === 'qualif_tf' && P.qualifPairs < P.Q + 1) W.push({ lvl: 'err', msg: 'Pas assez de paires pour les qualifications.' });
    if (cat.deadlineDays && t.dateStart) {
      const d = new Date(t.dateStart + 'T23:59:00'); d.setDate(d.getDate() - cat.deadlineDays);
      W.push({ lvl: 'info', msg: `Clôture des inscriptions ${t.category} : ${d.toLocaleDateString('fr-FR')} à 23h59 (J-${cat.deadlineDays}).` });
    }
    const ws = {};
    sel.main.forEach(p => { const w = weightOf(p); ws[w] = (ws[w] || 0) + 1; });
    if (Object.values(ws).some(n => n > 1)) W.push({ lvl: 'info', msg: 'Égalité de poids entre paires : départage par tirage au sort.' });
    return W;
  }

  /* ---------------------------------------------------------------------
     MODÈLES DE TOURNOI (formats préenregistrés)
     --------------------------------------------------------------------- */
  const TEMPLATE_FIELDS = ['category', 'gender', 'maxPairs', 'formula', 'drawMode', 'thirdPlace', 'pouleSize', 'pouleQualif', 'pouleMethod',
    'tfDirect', 'qualifCount', 'formatMain', 'formatQuarter', 'formatSemi', 'formatFinal', 'formatClass', 'formatPoule', 'formatQualif', 'startTime', 'durations', 'balls'];

  const courtsOf = (n, start) => Array.from({ length: n }, (_, i) => ({ name: `Terrain ${i + 1}`, start }));
  const PRESETS = [
    { id: 'soiree-16', name: 'Soirée P100 / P250 — 16 paires', desc: '4 terrains dès 19h. TMC 16 : 1 set à 9 jeux sans avantage, 1/2 et finale en 2 sets à 6 jeux + super tie-break.',
      fields: { category: 'P100', maxPairs: 16, formula: 'tf', drawMode: 'tmc', formatMain: 'D2', formatClass: 'D2', formatSemi: 'B2', formatFinal: 'B2', startTime: '19:00' },
      courts: courtsOf(4, '19:00') },
    { id: 'p25-8', name: 'P25 express — 8 paires', desc: '2 terrains dès 18h30. TMC 8 en super tie-break (format E), 1/2 et finale en 1 set de 4 jeux (F).',
      fields: { category: 'P25', maxPairs: 8, formula: 'tf', drawMode: 'tmc', formatMain: 'E', formatClass: 'E', formatSemi: 'F', formatFinal: 'F', startTime: '18:30' },
      courts: courtsOf(2, '18:30') },
    { id: 'journee-poules-16', name: 'Journée P100 — 16 paires en poules', desc: '4 poules de 4 (serpentin), 2 qualifiés par poule vers un tableau de 8. Poules en C2, TF en C2, finale en B2.',
      fields: { category: 'P100', maxPairs: 16, formula: 'poules_tf', pouleSize: 4, pouleQualif: 2, pouleMethod: 'serpentin', drawMode: 'tmc', formatPoule: 'C2', formatMain: 'C2', formatClass: 'C2', formatSemi: 'C2', formatFinal: 'B2', startTime: '09:00' },
      courts: courtsOf(4, '09:00') },
    { id: 'we-p250-24', name: 'Week-end P250 — 24 paires', desc: '12 entrées directes + 12 paires en qualifications pour 4 places. TMC 16, finale en B2.',
      fields: { category: 'P250', maxPairs: 24, formula: 'qualif_tf', tfDirect: 12, qualifCount: 4, drawMode: 'tmc', formatQualif: 'C2', formatMain: 'C2', formatClass: 'C2', formatSemi: 'B2', formatFinal: 'B2', startTime: '09:00' },
      courts: courtsOf(4, '09:00') },
    { id: 'poule-5', name: 'Petit tableau — 5 paires', desc: 'Poule unique de 5 : 4 matchs par paire. Format D2, 2 terrains.',
      fields: { category: 'P25', maxPairs: 5, formula: 'poules', pouleSize: 5, formatPoule: 'D2', formatMain: 'D2', startTime: '19:00' },
      courts: courtsOf(2, '19:00') }
  ];

  function templateFromState(T, name, desc) {
    const fields = {};
    TEMPLATE_FIELDS.forEach(k => { fields[k] = T.tournament[k]; });
    return { id: uid('t'), name: name || 'Mon modèle', desc: desc || '', fields, courts: T.courts.map(c => ({ name: c.name, start: c.start })), order: Array.isArray(T.order) && T.order.length ? T.order.slice() : null, createdAt: Date.now() };
  }

  function applyTemplate(T, tpl) {
    if (T.draw) throw new Error('Annulez le tirage avant d\'appliquer un modèle.');
    const f = Object.assign({}, tpl.fields);
    TEMPLATE_FIELDS.forEach(k => { if (k in f) T.tournament[k] = f[k]; });
    ['formatQuarter', 'formatSemi', 'formatFinal', 'formatClass', 'formatPoule', 'formatQualif'].forEach(k => { if (!(k in f)) T.tournament[k] = ''; });
    // le modèle fixe le nombre de terrains et leurs horaires ; les noms génériques (« Terrain 3 »)
    // ne remplacent pas les noms déjà donnés (réglages mémorisés du compte ou saisis à la main)
    const generic = n => /^terrain\s*\d+$/i.test(String(n || '').trim());
    if (tpl.courts && tpl.courts.length) T.courts = tpl.courts.map((c, i) => ({ id: 'c' + (i + 1),
      name: generic(c.name) && T.courts[i] && T.courts[i].name ? T.courts[i].name : c.name, start: c.start }));
    T.order = Array.isArray(tpl.order) && tpl.order.length ? tpl.order.slice() : null;
    T.tournament.template = tpl.name;
  }

  /* ---------------------------------------------------------------------
     BARÈMES DE POINTS FFT (Chap. II — tournois par paires, MAJ sept. 2026)
     P25 à P250 : selon le nombre de paires (4-8, 9-12, 13-16, 17-20, 21-24, 25-28, 29-32 et +)
     --------------------------------------------------------------------- */
  const BAREME = {"P25":[[25,20,15,9,6,4,2,1],[25,20,16,14,10,8,7,6,4,3,2,1],[25,20,17,15,14,13,12,11,8,7,6,5,4,3,2,1],[25,22,19,17,15,13,12,11,9,8,7,6,5,4,3,2,1,1,1,1],[25,22,19,17,15,13,12,11,9,8,7,6,5,5,5,5,4,4,3,3,2,2,1,1],[25,22,19,17,15,13,12,11,8,7,6,5,4,4,4,4,3,3,3,3,2,2,2,2,1,1,1,1],[25,22,19,17,15,14,13,12,10,9,8,7,6,5,4,3,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,1]],"P50":[[50,40,30,20,13,5,3,1],[50,40,33,28,20,15,10,5,3,2,1,1],[50,40,35,30,25,23,20,15,13,11,9,8,5,3,2,1],[50,43,38,35,30,28,25,23,18,15,13,12,10,9,8,6,5,3,2,1],[50,43,38,35,30,28,25,23,19,18,17,16,15,14,13,12,10,9,8,6,5,3,2,1],[50,43,38,35,30,28,25,23,19,18,17,16,15,14,13,12,10,9,8,7,6,5,4,3,2,2,1,1],[50,43,38,35,30,29,28,27,23,22,21,20,19,18,17,16,14,13,13,12,12,11,11,10,9,8,7,6,5,4,3,2]],"P100":[[100,80,60,40,25,10,5,1],[100,80,65,55,40,30,20,10,5,3,2,1],[100,80,70,60,50,45,40,30,25,21,18,15,10,5,3,1],[100,85,75,70,60,55,50,45,35,30,25,23,20,18,15,12,10,5,3,1],[100,85,75,70,60,55,50,45,38,36,34,32,30,28,26,24,20,18,15,12,10,5,3,1],[100,85,75,70,60,55,50,45,38,36,34,32,30,28,26,24,20,18,16,14,12,10,8,6,4,3,2,1],[100,85,75,70,60,58,56,54,45,43,41,39,37,35,33,31,27,26,25,24,23,22,21,20,17,15,13,11,9,7,5,3]],"P250":[[250,200,150,100,63,25,13,3],[250,200,165,140,100,75,50,25,13,8,5,3],[250,200,175,150,125,115,100,75,63,53,45,38,25,13,8,3],[250,213,188,175,150,138,125,113,88,75,63,58,50,45,38,30,25,13,8,3],[250,213,188,175,150,138,125,113,95,90,85,80,75,70,65,60,50,45,38,30,25,13,8,3],[250,213,188,175,150,138,125,113,95,90,85,80,75,70,65,60,50,45,40,35,30,25,20,15,10,8,5,3],[250,213,188,175,150,145,140,135,113,108,103,98,93,88,83,78,68,65,63,60,58,55,53,50,43,38,33,28,23,18,13,8]]};
  const BAREME_UNIQUE = {
    P500: { Messieurs: [500, 425, 375, 350, 300, 290, 280, 270, 225, 215, 205, 195, 185, 175, 165, 155, 135, 130, 125, 120, 115, 110, 105, 100, 85, 75, 65, 55, 45, 35, 25, 15],
            Dames: [500, 425, 375, 350, 300, 275, 250, 225, 190, 180, 170, 160, 150, 140, 130, 120, 100, 90, 80, 70, 60, 50, 40, 30, 20] },
    P1000: { Messieurs: [1000, 850, 750, 700, 600, 580, 560, 540, 450, 430, 410, 390, 370, 350, 330, 310, 270, 260, 250, 240, 230, 220, 210, 200, 170, 150, 130, 110, 90, 70, 50, 30],
             Dames: [1000, 850, 750, 700, 600, 550, 500, 450, 380, 360, 340, 320, 300, 280, 260, 240, 200, 180, 160, 140, 120, 100, 80, 60, 40] },
    P2000: { all: [2000, 1700, 1500, 1400, 1200, 1160, 1120, 1080, 900, 860, 820, 780, 740, 700, 660, 620, 540, 520, 500, 480, 460, 440, 420, 400, 340, 300, 260, 220, 180, 140, 100, 60] }
  };
  function pointsFor(T, place, nPairs) {
    const t = T.tournament;
    if (!place || nPairs < 4) return null;
    let arr;
    if (BAREME[t.category]) arr = BAREME[t.category][nPairs <= 8 ? 0 : nPairs <= 12 ? 1 : nPairs <= 16 ? 2 : nPairs <= 20 ? 3 : nPairs <= 24 ? 4 : nPairs <= 28 ? 5 : 6];
    else if (BAREME_UNIQUE[t.category]) { const b = BAREME_UNIQUE[t.category]; arr = b.all || (t.gender === 'Dames' ? b.Dames : b.Messieurs); }
    if (!arr) return null;
    return arr[Math.min(place, arr.length) - 1];
  }

  /* ---------------------------------------------------------------------
     CLASSEMENT EN TEMPS RÉEL
     Chaque paire est placée dans la fourchette de places encore possible :
     au départ un seul bloc, qui se scinde au fil des tours.
     --------------------------------------------------------------------- */
  /* résultats à la clôture : place exacte, sinon la moins favorable de la fourchette
     (règle FFT pour les matchs de classement non disputés) */
  function finalResults(T, R) {
    const LS = liveStandings(T, R);
    const out = [];
    LS.groups.forEach(g => g.pairs.forEach(p => {
      const place = g.exact ? g.lo : g.hi;
      out.push({ pair: p, place, placeLo: g.lo, placeHi: g.hi, exact: g.exact, points: pointsFor(T, place, LS.N) });
    }));
    return out.sort((a, b) => a.place - b.place);
  }

  function liveStandings(T, R) {
    R = R || resolve(T);
    const D = T.draw;
    if (!D || !D.built) return { N: 0, groups: [] };
    const N = D.entrants.length;
    const range = {};
    D.entrants.forEach(id => { range[id] = [1, N]; });
    const tf = T.matches.filter(m => m.phase === 'TF');
    const tfSess = D.sessions.find(s => s.key === 'tf');
    const tfEntrants = tfSess ? Object.values(tfSess.fill).filter(x => x !== 'BYE').length : N;
    const inTf = new Set();
    tf.forEach(m => { const r = R[m.id]; [r.A, r.B].forEach(p => { if (p && p !== 'BYE') inTf.add(p); }); });
    // éliminés avant le tableau final (poules, qualifications)
    if (D.formula === 'poules_tf' || D.formula === 'qualif_tf') {
      const elim = new Set();
      if (D.formula === 'poules_tf') (T.poules || []).forEach(P => { const st = pouleStandings(T, R, P.id); if (st.complete) st.rows.forEach(x => { if (!inTf.has(x.pair)) elim.add(x.pair); }); });
      T.matches.filter(m => m.phase === 'Q').forEach(m => { const r = R[m.id]; if (r.state === 'done' && r.loser && r.loser !== 'BYE') elim.add(r.loser); });
      elim.forEach(p => { range[p] = [tfEntrants + 1, N]; });
      inTf.forEach(p => { range[p] = [1, tfEntrants]; });
    }
    if (D.formula === 'poules') {
      (T.poules || []).forEach(P => { const st = pouleStandings(T, R, P.id); if (T.poules.length === 1 && st.complete) st.rows.forEach(x => { range[x.pair] = [x.rank, x.rank]; }); });
    }
    // tableau final : le match le plus avancé de chaque paire donne sa fourchette
    const deepest = {};
    tf.forEach(m => { const r = R[m.id]; [r.A, r.B].forEach(p => { if (p && p !== 'BYE' && (!deepest[p] || m.depth > deepest[p].depth)) deepest[p] = m; }); });
    Object.keys(deepest).forEach(p => {
      const m = deepest[p], r = R[m.id];
      let lo = m.a, hi = m.a + m.size - 1;
      if (r.state === 'done' || r.state === 'bye') {
        if (m.size === 2) { lo = hi = r.winner === p ? m.a : m.a + 1; }
        else if (r.winner === p) hi = m.a + m.size / 2 - 1;
        else lo = m.a + m.size / 2;              // élimination directe : place partagée
      }
      range[p] = [lo, Math.min(hi, tfEntrants)];
    });
    const groups = {};
    Object.keys(range).forEach(p => { const [lo, hi] = range[p]; const k = lo + '-' + hi; (groups[k] = groups[k] || { lo, hi, pairs: [] }).pairs.push(p); });
    const list = Object.values(groups).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    list.forEach(g => { g.exact = g.lo === g.hi; g.ptsHi = pointsFor(T, g.lo, N); g.ptsLo = pointsFor(T, Math.min(g.hi, N), N); });
    return { N, groups: list };
  }

  /* ---------------------------------------------------------------------
     RÉGLAGES DU COMPTE (club, terrains, logo, partenaires…)
     --------------------------------------------------------------------- */
  // logo = version couleur ; logoLight = version claire (fonds sombres : TV, overlay) ; logoDark = version sombre (fonds clairs : PDF)
  const PROFILE_FIELDS = ['club', 'address', 'ja', 'jaNumber', 'jaPhone', 'balls', 'startTime', 'durations', 'colors', 'look', 'logo', 'logoLight', 'logoDark', 'sponsors'];
  function profileFromState(T) {
    const p = { courts: T.courts.map(c => ({ name: c.name, start: c.start })) };
    PROFILE_FIELDS.forEach(k => { p[k] = JSON.parse(JSON.stringify(T.tournament[k] == null ? '' : T.tournament[k])); });
    return p;
  }
  function applyProfile(T, p) {
    if (!p) return;
    PROFILE_FIELDS.forEach(k => { if (p[k] !== undefined && p[k] !== '') T.tournament[k] = JSON.parse(JSON.stringify(p[k])); });
    if (p.courts && p.courts.length) T.courts = p.courts.map((c, i) => ({ id: 'c' + (i + 1), name: c.name, start: c.start }));
  }

  /* ---------------------------------------------------------------------
     ÉTAT INITIAL & MIGRATION
     --------------------------------------------------------------------- */
  const RAM_COLORS = { bg: '#0B0B0B', primary: '#151515', accent: '#E0F50A', accent2: '#F5104C' };
  // habillage de l'écran TV et de l'overlay
  const DEFAULT_LOOK = { font: 'anton', style: 'street', shadows: true, borders: true, bg: 'dots', corners: 'square', deco: true };
  const LOOK_FONTS = { anton: 'Anton', bebas: 'Bebas Neue', oswald: 'Oswald', archivo: 'Archivo Black', montserrat: 'Montserrat', teko: 'Teko', barlow: 'Barlow Condensed', marker: 'RAM Marker' };

  function initialState() {
    const today = localNow().slice(0, 10);
    return {
      version: 2,
      tournament: {
        name: 'Open de padel', category: 'P100', gender: 'Messieurs', dateStart: today, dateEnd: today,
        club: '', address: '', ja: '', jaNumber: '', jaPhone: '', balls: '', deadline: '', maxPairs: 16,
        formula: 'tf', drawMode: 'tmc', thirdPlace: true,
        pouleSize: 4, pouleQualif: 2, pouleMethod: 'serpentin', tfDirect: 12, qualifCount: 4,
        formatMain: 'C2', formatQuarter: '', formatSemi: '', formatFinal: 'B2', formatClass: 'C2', formatPoule: '', formatQualif: '',
        startTime: '09:00', durations: Object.assign({}, DEFAULT_DUR), prize: '', notes: '',
        colors: Object.assign({}, RAM_COLORS), look: Object.assign({}, DEFAULT_LOOK), logo: '', logoLight: '', logoDark: '', sponsors: []
      },
      courts: [{ id: 'c1', name: 'Terrain 1', start: '09:00' }, { id: 'c2', name: 'Terrain 2', start: '09:00' }, { id: 'c3', name: 'Terrain 3', start: '09:00' }],
      pairs: [], draw: null, matches: [], poules: [], order: null,
      display: { tv: 'bracket', rotate: false, rotateSec: 20, rotateViews: ['bracket', 'poules', 'schedule', 'live', 'standings'], stream: null, overlay: 'green', ticker: '' }
    };
  }

  function migrate(T) {
    const base = initialState();
    T.tournament = Object.assign({}, base.tournament, T.tournament || {});
    if (!T.tournament.colors || T.tournament.colors.bg === '#0A0F2C') T.tournament.colors = Object.assign({}, RAM_COLORS);
    if (!Array.isArray(T.tournament.sponsors)) T.tournament.sponsors = T.tournament.sponsor ? [{ id: uid('s'), name: T.tournament.sponsor, logo: '' }] : [];
    delete T.tournament.sponsor;
    T.tournament.look = Object.assign({}, DEFAULT_LOOK, T.tournament.look || {});
    T.display = Object.assign({}, base.display, T.display || {});
    T.courts = T.courts || base.courts;
    T.pairs = T.pairs || [];
    T.poules = T.poules || [];
    if (!Array.isArray(T.order)) T.order = null;
    T.matches = (T.matches || []).map(m => Object.assign(newMatch(m.id), m));
    if (T.draw && !T.draw.sessions) {
      const old = T.draw, fill = {};
      (old.slots || []).forEach((s, i) => { fill[i] = s; });
      T.draw = { id: old.id || uid('d'), formula: 'tf', method: 'auto', entrants: (old.slots || []).filter(isPair), seedNo: old.seedNo || {},
        sessions: [{ key: 'tf', label: 'Tableau final', kind: 'bracket', size: old.size, seeds: old.seeds, fill, pots: [], done: true }], built: true, createdAt: old.createdAt, last: null };
    }
    T.version = 2;
    return T;
  }

  /* ---------------------------------------------------------------------
     RÉDUCTEUR — toutes les actions passent par ici
     --------------------------------------------------------------------- */
  function findMatch(T, id) { const m = T.matches.find(x => x.id === id); if (!m) throw new Error('Match introuvable'); return m; }

  function afterScore(T, m) {
    const r = resolve(T)[m.id];
    if (r.state === 'done') { if (!m.endedAt) m.endedAt = Date.now(); m.status = 'done'; }
    else if (m.status === 'done') { m.status = m.points.length ? 'live' : 'pending'; m.endedAt = null; }
  }

  function replacePair(T, oldId, newId) {
    const D = T.draw; if (!D) return;
    D.entrants = D.entrants.map(x => (x === oldId ? newId : x));
    D.seedNo[newId] = D.seedNo[oldId];
    D.sessions.forEach(s => {
      Object.keys(s.fill).forEach(k => { if (s.fill[k] === oldId) s.fill[k] = newId; });
      s.pots.forEach(p => p.cards.forEach(c => { if (c.token === oldId) c.token = newId; }));
    });
    (T.poules || []).forEach(p => { p.pairs = p.pairs.map(x => (x === oldId ? newId : x)); });
    T.matches.forEach(m => { ['srcA', 'srcB'].forEach(k => { if (m[k] && m[k].pair === oldId) m[k] = { pair: newId }; }); });
    const old = T.pairs.find(x => x.id === oldId); if (old) old.withdrawn = true;
  }

  function reduce(T, action, rand) {
    const p = action.payload || {};
    const now = Date.now();
    if (T.tournament && T.tournament.closed && !['noop', 'display/set', 'tournament/setClosed'].includes(action.type))
      throw new Error('Tournoi clôturé : rouvrez-le pour le modifier.');
    switch (action.type) {
      case 'noop': break;
      case 'tournament/update': Object.assign(T.tournament, p); break;
      case 'tournament/new': { const fresh = initialState(); Object.keys(T).forEach(k => delete T[k]); Object.assign(T, fresh); break; }
      case 'state/replace': { Object.keys(T).forEach(k => delete T[k]); Object.assign(T, migrate(p.state)); break; }

      case 'court/add': T.courts.push({ id: uid('c'), name: p.name || `Terrain ${T.courts.length + 1}`, start: T.tournament.startTime || '09:00' }); break;
      case 'court/update': Object.assign(T.courts.find(c => c.id === p.id) || {}, p.fields); break;
      case 'court/remove':
        T.courts = T.courts.filter(c => c.id !== p.id);
        T.matches.forEach(m => { if (m.court === p.id) { m.court = null; m.order = null; } }); break;

      case 'pair/add':
        T.pairs.push({ id: uid('p'), p1: p.p1, p2: p.p2, registeredAt: p.registeredAt || localNow(), withdrawn: false, wc: !!p.wc, note: p.note || '' }); break;
      case 'pairs/import': (p.list || []).forEach(x => T.pairs.push(Object.assign({ id: uid('p'), withdrawn: false, wc: false, note: '' }, x))); break;
      case 'pair/update': { const pr = T.pairs.find(x => x.id === p.id); if (pr) deepAssign(pr, p.fields); break; }
      case 'pair/remove':
        if (T.draw && T.draw.entrants.includes(p.id)) throw new Error('Paire engagée dans le tirage : utilisez « Remplacer » ou un WO.');
        T.pairs = T.pairs.filter(x => x.id !== p.id); break;
      case 'pair/withdraw': { const pr = T.pairs.find(x => x.id === p.id); if (pr) pr.withdrawn = p.value !== false; break; }

      case 'draw/prepare':
        T.draw = prepareDraw(T, p, rand); T.matches = []; T.poules = [];
        if (T.draw.sessions.every(s => s.done)) { buildAll(T); autoSchedule(T); }
        break;
      case 'draw/create':      // tirage 100 % ordinateur
        T.draw = prepareDraw(T, Object.assign({}, p, { method: 'auto' }), rand); T.matches = []; T.poules = [];
        while (currentPot(T.draw)) flipCard(T, null, rand);
        if (!T.draw.built) buildAll(T);
        autoSchedule(T);
        break;
      case 'draw/flip': flipCard(T, p.n, rand); if (T.draw.built && !T.matches.some(m => m.court)) autoSchedule(T); break;
      case 'draw/flipRandom': flipCard(T, null, rand); if (T.draw.built && !T.matches.some(m => m.court)) autoSchedule(T); break;
      case 'draw/auto': while (currentPot(T.draw)) flipCard(T, null, rand); if (!T.draw.built) buildAll(T); if (!T.matches.some(m => m.court)) autoSchedule(T); break;
      case 'draw/reset': T.draw = null; T.matches = []; T.poules = []; T.pairs.forEach(x => { delete x.tie; }); break;
      case 'tournament/reset':
        if (p.level === 'scores') T.matches.forEach(m => Object.assign(m, { points: [], manual: null, wo: null, status: 'pending', startedAt: null, endedAt: null }));
        if (p.level === 'draw' || p.level === 'all') { T.draw = null; T.matches = []; T.poules = []; T.pairs.forEach(x => { delete x.tie; }); }
        if (p.level === 'all') T.pairs = [];
        break;
      case 'tournament/setClosed': T.tournament.closed = !!p.closed; T.tournament.closedAt = p.closed ? (p.at || now) : null; break;
      case 'draw/replace': replacePair(T, p.oldId, p.newId); break;

      case 'match/point': {
        const m = findMatch(T, p.id);
        const r = resolve(T)[m.id];
        if (r.state === 'done' || r.state === 'waiting' || r.state === 'bye') break;
        m.manual = null; m.wo = null;
        m.points.push(p.team === 'B' ? 'B' : 'A');
        if (m.status === 'pending') { m.status = 'live'; m.startedAt = m.startedAt || now; }
        afterScore(T, m); break;
      }
      case 'match/game': {          // donne le jeu en cours à une équipe (score suivi aux jeux)
        const m = findMatch(T, p.id);
        const r = resolve(T)[m.id];
        if (r.state === 'done' || r.state === 'waiting' || r.state === 'bye') break;
        m.manual = null; m.wo = null;
        const team = p.team === 'B' ? 'B' : 'A';
        const fk = r.fk, k0 = gameKey(computeScore(fk, m.points, m.firstServer));
        for (let i = 0; i < 40; i++) {
          m.points.push(team);
          const sc = computeScore(fk, m.points, m.firstServer);
          if (gameKey(sc) !== k0 || sc.winner) break;
        }
        if (m.status === 'pending') { m.status = 'live'; m.startedAt = m.startedAt || now; }
        afterScore(T, m); break;
      }
      case 'match/ungame': {        // retire le dernier jeu gagné par une équipe
        const m = findMatch(T, p.id);
        const team = p.team === 'B' ? 'B' : 'A';
        const seg = gameSegments(formatOf(T, m), m.points, m.firstServer).filter(g => g.w === team).pop();
        if (!seg) throw new Error('Aucun jeu à retirer pour cette équipe.');
        m.points.splice(seg.from, seg.to - seg.from);
        if (m.status === 'done') m.status = 'live';
        afterScore(T, m); break;
      }
      case 'match/undoPoint': { const m = findMatch(T, p.id); m.points.pop(); if (m.status === 'done') m.status = 'live'; afterScore(T, m); break; }
      case 'match/server': { const m = findMatch(T, p.id); m.firstServer = p.team; break; }
      case 'match/start': { const m = findMatch(T, p.id); m.status = 'live'; m.startedAt = m.startedAt || now; if (p.court) moveMatch(T, m.id, p.court, 0); break; }
      case 'match/manual': {
        const m = findMatch(T, p.id);
        const sets = (p.sets || []).filter(s => s && s.length === 2 && s[0] !== '' && s[1] !== '').map(s => [+s[0], +s[1]]);
        let a = 0, b = 0; sets.forEach(s => { if (s[0] > s[1]) a++; else if (s[1] > s[0]) b++; });
        if (!sets.length || a === b) throw new Error('Score incomplet : impossible de désigner un vainqueur.');
        m.manual = { sets, winner: a > b ? 'A' : 'B' }; m.wo = null; m.status = 'done';
        m.startedAt = m.startedAt || now; m.endedAt = m.endedAt || now; break;
      }
      case 'match/winner': {        // vainqueur désigné sans score (le score pourra être saisi plus tard)
        const m = findMatch(T, p.id);
        const team = p.team === 'B' ? 'B' : 'A';
        m.manual = { sets: [], winner: team, noScore: true }; m.wo = null; m.status = 'done';
        m.startedAt = m.startedAt || now; m.endedAt = now; break;
      }
      case 'match/wo': { const m = findMatch(T, p.id); m.wo = p.team; m.manual = null; m.status = 'done'; m.endedAt = m.endedAt || now; break; }
      case 'match/reset': { const m = findMatch(T, p.id); Object.assign(m, { points: [], manual: null, wo: null, status: 'pending', startedAt: null, endedAt: null }); break; }
      case 'match/format': { const m = findMatch(T, p.id); m.format = p.format || null; break; }

      case 'schedule/auto': autoSchedule(T); break;
      case 'order/set':
      case 'order/reset': {
        T.order = action.type === 'order/set' && Array.isArray(p.keys) && p.keys.length ? p.keys.slice() : null;
        if (T.matches.length) {
          numberMatches(T);
          const started = T.matches.some(m => m.status !== 'pending' || m.points.length);
          if (!started && p.reschedule !== false) autoSchedule(T);
        }
        break;
      }
      case 'schedule/move': moveMatch(T, p.id, p.court, p.index); break;
      case 'schedule/clear': T.matches.forEach(m => { if (m.status === 'pending') { m.court = null; m.order = null; } }); break;

      case 'template/apply': applyTemplate(T, p.template); break;
      case 'profile/apply': applyProfile(T, p.profile); break;
      case 'display/set': Object.assign(T.display, p); break;
      case 'demo/load': loadDemo(T, rand || Math.random, p); break;
      default: throw new Error('Action inconnue : ' + action.type);
    }
    return T;
  }

  function deepAssign(target, src) {
    Object.keys(src).forEach(k => {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object') deepAssign(target[k], src[k]);
      else target[k] = src[k];
    });
  }

  function localNow() {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function loadDemo(T, rand, opts) {
    const last = ['MARTIN', 'BERNARD', 'DUBOIS', 'THOMAS', 'ROBERT', 'RICHARD', 'PETIT', 'DURAND', 'LEROY', 'MOREAU', 'SIMON', 'LAURENT', 'LEFEBVRE', 'MICHEL',
      'GARCIA', 'DAVID', 'BERTRAND', 'ROUX', 'VINCENT', 'FOURNIER', 'MOREL', 'GIRARD', 'ANDRE', 'MERCIER', 'BLANC', 'GUERIN', 'BOYER', 'GARNIER', 'CHEVALIER', 'FRANCOIS', 'LEGRAND', 'GAUTHIER',
      'PERRIN', 'ROUSSEL', 'NICOLAS', 'FAURE', 'COLIN', 'MASSON', 'MARCHAND', 'DUVAL'];
    const first = ['Lucas', 'Hugo', 'Louis', 'Nathan', 'Gabriel', 'Jules', 'Arthur', 'Adam', 'Raphaël', 'Léo', 'Paul', 'Tom', 'Théo', 'Maël', 'Noah', 'Ethan',
      'Sacha', 'Victor', 'Enzo', 'Mathis', 'Axel', 'Baptiste', 'Clément', 'Antoine', 'Maxime', 'Romain', 'Julien', 'Thomas', 'Nicolas', 'Pierre', 'Alexis', 'Kylian'];
    const names = shuffle(last, rand);
    const n = (opts && opts.n) || 16;
    const t = T.tournament;
    Object.assign(t, { name: 'Open /RAM Padel', category: 'P250', gender: 'Messieurs', club: 'Padel Club Démo', address: 'Brive-la-Gaillarde',
      ja: 'Juge-Arbitre Démo', jaNumber: 'JAP2', balls: 'Head Pro S (3 / piste)', maxPairs: 14, formatMain: 'C2', formatSemi: 'B2', formatFinal: 'B2', formatClass: 'C2',
      prize: '1 500 € de dotation', sponsors: [{ id: 's1', name: '/RAM · Rise And Move', logo: '' }, { id: 's2', name: 'Padel Club Démo', logo: '' }], colors: Object.assign({}, RAM_COLORS) });
    T.pairs = []; T.draw = null; T.matches = []; T.poules = [];
    const base = new Date(); base.setDate(base.getDate() - 20);
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getTime() + i * 3600000 * (5 + Math.floor(rand() * 20)));
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      T.pairs.push({
        id: uid('p'),
        p1: { last: names[(i * 2) % names.length], first: first[(i * 2) % first.length], rank: String(300 + Math.floor(rand() * 4000)), licence: String(1000000 + Math.floor(rand() * 8999999)) },
        p2: { last: names[(i * 2 + 1) % names.length], first: first[(i * 2 + 1) % first.length], rank: String(300 + Math.floor(rand() * 4000)), licence: String(1000000 + Math.floor(rand() * 8999999)) },
        registeredAt: d.toISOString().slice(0, 16), withdrawn: false, wc: false, note: '', demo: true   // jamais enregistrée dans la base de joueurs
      });
    }
  }

  return {
    FORMATS, FORMAT_KEYS, CATEGORIES, FORMULAS, PRESETS, TEMPLATE_FIELDS, templateFromState, PROFILE_FIELDS, profileFromState, applyProfile, pointsFor, liveStandings, REST, DEFAULT_DUR, ROUND_NAMES, ROUND_SHORT, RAM_COLORS, DEFAULT_LOOK, LOOK_FONTS,
    computeScore, pointFlags, pointLabels, setsText, scoreText, winnerScoreText, manualToSets,
    weightOf, rankOf, isPair, tokenLabel, selection, plan, pouleSizes, seedOrder, nextPow2, defaultSeeds,
    prepareDraw, currentPot, sessionSlots, posLabel, buildAll, matchLabel, formatOf,
    resolve, pouleStandings, standings, finalResults, matchKey, orderedMatches, orderIssues, previewStructure, timeline, autoSchedule, depsOf, pairsStatus, dayChecks, restMsAfter,
    checkRules, initialState, migrate, reduce, localNow
  };
});
