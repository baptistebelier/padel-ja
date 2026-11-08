/* =========================================================================
   /RAM JA — Tournoi interne d'un club (tennis ou padel, simple ou double)
   Moteur partagé (serveur Node + navigateur), à côté des tournois FFT et des animations.
   - Le juge-arbitre crée le tournoi dans /RAM JA : règlement, format de match (formats FFT 1 à 7),
     participants (adhérents du club) et leur classement, structure (tableau unique ou tableaux
     successifs par classement), date limite de chaque tour, tirage.
   - Les tableaux suivent les règlements sportifs FFT 2027 (articles 45 à 50) :
       · dimension : la plus petite puissance de 2 × qualifiés sortants ≥ effectif (art. 47-2) ;
       · tableau intermédiaire « à sections » : une section par qualifié, une tête de série par section,
         la n° 1 en bas de la dernière section, la n° 2 en bas de celle du dessus… (art. 46-1-e-ii, 49) ;
       · tableau final : têtes de série = le quart de la dimension, en haut des fractions du demi-tableau
         haut, en bas de celles du demi-tableau bas ; 3-4, puis 5-8… tirées au sort entre elles (art. 46, 51 bis-5) ;
       · exempts aux premières têtes de série, puis aux mieux classés placés comme des têtes de série (art. 47-4) ;
       · qualifiés du tableau précédent : une place par fraction, tirée au sort, jamais face à un autre
         qualifié pour leur premier match, en non-exempt si possible (art. 45-3-c, 46-2, 47-5, 47-6).
   - Les joueurs organisent eux-mêmes leurs matchs sur plusieurs semaines : le gagnant saisit le
     résultat dans /RAM Club, l'adversaire le confirme (ou le conteste : le juge-arbitre tranche).
     Le score est vérifié selon le format du tournoi (art. 9 et 12).
   - avis(avant, après) : les notifications à envoyer (prochain adversaire connu, match d'avant
     sur le point de se jouer, résultat à confirmer, contestation, rappel avant la date limite).
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Int = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const today = () => new Date().toISOString().slice(0, 10);
  const isInterne = T => !!(T && T.kind === 'interne' && T.int);
  const TOURS = ['Finale', 'Demi-finales', 'Quarts de finale', 'Huitièmes de finale', 'Seizièmes de finale', '32es de finale', '64es de finale'];

  /* ---------- formats de jeu (règlements sportifs FFT, art. 9) ---------- */
  // j : jeux pour gagner une manche ; t : jeu décisif à t-t ; sjd : 3e manche = super jeu décisif à 10 points ; pd : point décisif
  const FORMATS = {
    1: { l: '3 sets à 6 jeux, jeu décisif à 6-6', j: 6, t: 6, sjd: false, pd: false, ex: '6-3 3-6 7-5' },
    2: { l: '2 sets à 6 jeux, jeu décisif à 6-6, 3e set = super jeu décisif à 10 points', j: 6, t: 6, sjd: true, pd: false, ex: '6-3 3-6 10-7' },
    3: { l: '2 sets à 4 jeux, point décisif, jeu décisif à 4-4, 3e set = super jeu décisif à 10 points', j: 4, t: 4, sjd: true, pd: true, ex: '4-2 3-5 10-6' },
    4: { l: '2 sets à 6 jeux, point décisif, jeu décisif à 6-6, 3e set = super jeu décisif à 10 points', j: 6, t: 6, sjd: true, pd: true, ex: '6-4 4-6 10-8' },
    5: { l: '2 sets à 3 jeux, point décisif, jeu décisif à 2-2, 3e set = super jeu décisif à 10 points', j: 3, t: 2, sjd: true, pd: true, ex: '3-1 2-3 10-5' },
    6: { l: '2 sets à 4 jeux, point décisif, jeu décisif à 3-3, 3e set = super jeu décisif à 10 points', j: 4, t: 3, sjd: true, pd: true, ex: '4-1 3-4 10-6' },
    7: { l: '2 sets à 5 jeux, point décisif, jeu décisif à 4-4, 3e set = super jeu décisif à 10 points', j: 5, t: 4, sjd: true, pd: true, ex: '5-3 4-5 10-8' }
  };
  const formatNom = f => (FORMATS[f] ? 'Format ' + f + ' : ' + FORMATS[f].l : 'Score libre');
  // une manche : 6-0 à 6-4, 7-5, 7-6 (jeu décisif à 6-6) ; avec un jeu décisif à t-t < j : j-(j-1) après le jeu décisif
  function mancheOk(a, b, F) {
    const w = Math.max(a, b), l = Math.min(a, b), J = F.j, T = F.t;
    if (a === b) return false;
    if (w === J && l <= J - 2) return true;
    if (T === J) return w === J + 1 && (l === J - 1 || l === J);
    return T === J - 1 && w === J && l === J - 1;
  }
  const sjdOk = (a, b) => { const w = Math.max(a, b), l = Math.min(a, b); return w >= 10 && w - l >= 2 && (w === 10 || w - l === 2); };
  /* le score d'un match, écrit du côté du vainqueur (6-3 4-6 10-7) ; écrit du côté du perdant, il est retourné.
     → { ok, sc } ou { ok: false, err } */
  function verifScore(f, sc) {
    const F = FORMATS[f], s = String(sc || '').trim();
    if (!F) return { ok: true, sc: s.slice(0, 60) };
    if (/\b(ab|abandon)\b/i.test(s)) return { ok: true, sc: s.slice(0, 60) };   // abandon : le score s'arrête où il s'est arrêté
    const toks = s.split(/[\s,;]+/).filter(Boolean);
    const sets = toks.map(t => t.match(/^(\d{1,2})[-/](\d{1,2})(\(\d{1,2}\))?$/));
    if (!toks.length || sets.some(x => !x)) return { ok: false, err: `Score illisible : écris les manches séparées par une espace, par exemple ${F.ex}.` };
    if (sets.length < 2 || sets.length > 3) return { ok: false, err: `Un match se joue en deux manches gagnantes, par exemple ${F.ex}.` };
    const essai = inv => {
      const l = sets.map(x => (inv ? [+x[2], +x[1], x[3] || ''] : [+x[1], +x[2], x[3] || '']));
      let g = 0, p = 0;
      for (let i = 0; i < l.length; i++) {
        if (g === 2 || p === 2) return null;   // match déjà gagné : une manche de trop
        const [a, b] = l[i], ok = i === 2 && F.sjd ? sjdOk(a, b) : mancheOk(a, b, F);
        if (!ok) return null;
        if (a > b) g++; else p++;
      }
      return g === 2 ? l.map(([a, b, tb]) => a + '-' + b + tb).join(' ') : null;
    };
    const n = essai(false) || essai(true);
    if (n) return { ok: true, sc: n };
    return { ok: false, err: `Score impossible au format ${f} (${F.l}). Par exemple : ${F.ex}.` };
  }

  /* ---------- classement FFT : de NC à -30, puis les numérotés (N12, T60…) ---------- */
  const ECHELONS = ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1', '30', '15/5', '15/4', '15/3', '15/2', '15/1', '15', '5/6', '4/6', '3/6', '2/6', '1/6', '0', '-2/6', '-4/6', '-15', '-30'];
  function rang(cl) {
    const c = String(cl || '').trim().toUpperCase().replace(/\s+/g, '');
    const i = ECHELONS.indexOf(c); if (i >= 0) return i;
    const n = c.match(/^[NT](\d{1,4})$/); if (n) return 100 + Math.max(0, 5000 - +n[1]);   // numéroté : N1 devant N60
    return 0;
  }
  const clNorm = cl => { const c = String(cl || '').trim().toUpperCase().replace(/\s+/g, ''); return ECHELONS.includes(c) || /^[NT]\d{1,4}$/.test(c) ? c : ''; };

  function initialState(opts = {}) {
    const padel = opts.sport === 'Padel';
    return {
      version: 2,
      kind: 'interne',
      tournament: { name: String(opts.name || 'Tournoi interne').slice(0, 80), category: 'Tournoi interne', gender: '', dateStart: today(), dateEnd: '', club: opts.club || '', closed: false, regMode: '' },
      courts: [], pairs: [], matches: [], poules: [], draw: null, order: null,
      int: { sport: padel ? 'Padel' : 'Tennis', simple: !padel, regle: '', format: padel ? 0 : 2, struct: [], players: [], tabs: [], status: 'setup', seed: Math.floor(Math.random() * 1e9), relances: {} }
    };
  }

  /* tirage reproductible : graine du tournoi */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const melange = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pow2 = n => { let s = 1; while (s < n) s *= 2; return s; };
  /* ordre « classique » des têtes de série (ancien tirage, gardé pour les tests et l'affichage) */
  function seedOrder(n) {
    let a = [1];
    while (a.length < n) { const m = a.length * 2 + 1, b = []; a.forEach(s => b.push(s, m - s)); a = b; }
    return a;
  }
  /* places des têtes de série d'un tableau de dimension D (ligne de la tête de série n° r = out[r-1]) :
     1 en haut, 2 en bas, puis 3-4 en haut du 2e quart et en bas du 3e quart (tirées au sort entre elles), puis 5-8… */
  function placesTS(D, R) {
    if (D < 2) return [0];
    const out = [0, D - 1];
    for (let k = 2; (D >> k) >= 2; k++) {
      const F = D >> k, n = 1 << k, g = [];
      for (let j = 0; j < n; j++) {
        if (j < n / 2) { if (j % 2) g.push(j * F); }
        else if ((j - n / 2) % 2 === 0) g.push((j + 1) * F - 1);
      }
      out.push(...melange(g, R));
    }
    return out;
  }

  /* ---------- les tableaux ---------- */
  const tabsOf = I => (I.tabs && I.tabs.length ? I.tabs : I.bracket ? [legacyTab(I)] : []);
  // tournoi tiré avant les tableaux successifs : un seul tableau, ses identifiants de match inchangés
  function legacyTab(I) {
    const B = I.bracket, ts = {};
    I.players.forEach(p => { if (+p.seed > 0) ts[p.id] = +p.seed; });
    B.rounds.forEach(l => l.forEach(m => { m.t = ''; }));
    return { id: '', nom: 'Tableau', q: 1, size: B.size, s: B.size, lines: B.rounds[0].flatMap(m => [m.a, m.b]), ts, rounds: B.rounds, tours: I.tours || [] };
  }
  function norm(I) {
    if (!I.tabs && I.bracket) { I.tabs = [legacyTab(I)]; delete I.bracket; delete I.tours; }
    if (!I.tabs) I.tabs = [];
    if (!Array.isArray(I.struct)) I.struct = [];
    if (I.format == null) I.format = 0;   // tournoi créé avant les formats : score libre
    return I;
  }
  const tire = I => tabsOf(I).length > 0;
  const tabDe = (I, m) => tabsOf(I).find(t => t.id === (m.t || '')) || tabsOf(I)[0];
  const final = I => { const l = tabsOf(I); return l[l.length - 1] || null; };
  const LETTRES = 'abcdefgh';
  const plageNom = (lo, hi) => (lo === hi ? ECHELONS[lo] : (lo === 0 ? 'NC' : ECHELONS[lo]) + ' à ' + (hi >= ECHELONS.length ? 'numérotés' : ECHELONS[hi]));

  /* répartition : tableau d'entrée de chaque participant d'après son classement */
  function repartition(I) {
    const st = I.struct || [], out = st.map(() => []).concat([[]]);
    I.players.forEach(p => {
      const v = rang(p.cl);
      let k = st.findIndex(x => v <= rang(x.max));
      if (k < 0) k = st.length;
      out[k].push(p);
    });
    return out;
  }

  /* construire un tableau : dimension, exempts, têtes de série, qualifiés entrants, puis tirage des autres */
  function construire(spec, direct, qIn, R) {
    const q = spec.q, E = direct.length + qIn.length;
    let s = 1; while (s * q < E) s *= 2;
    const D = s * q, b = D - E, finalTab = q === 1;
    // ordre de classement : têtes de série choisies à la main d'abord, puis le classement, puis le sort
    const tri = melange(direct.slice(), R).sort((x, y) => ((+x.seed || 999) - (+y.seed || 999)) || (rang(y.cl) - rang(x.cl)));
    const classes = direct.some(p => rang(p.cl) > 0 || +p.seed > 0);
    const nTS = !classes ? 0 : Math.min(direct.length, finalTab ? Math.max(1, D / 4) : q);
    // place d'une « tête de série » n° r (aussi celle des exempts suivants, art. 47-4-b)
    let pos;
    if (finalTab) { const l = placesTS(D, R); pos = r => l[r - 1]; }
    else {
      const sec = Array.from({ length: q }, () => placesTS(s, R).map(x => s - 1 - x));   // dans une section : la tête de série en bas
      pos = r => { const niv = Math.ceil(r / q), k = (r - 1) % q, j = niv % 2 ? q - 1 - k : k; return j * s + sec[j][niv - 1]; };
    }
    const lines = new Array(D).fill(null), ts = {}, reserve = new Set();
    const nPos = Math.min(D / 2, Math.max(nTS, b));
    for (let r = 1; r <= nPos; r++) {
      const L = pos(r);
      if (r <= tri.length) { lines[L] = tri[r - 1].id; if (r <= nTS) ts[tri[r - 1].id] = r; }
      else reserve.add(L);   // plus d'exempts que de joueurs directs : place gardée pour un qualifié
      if (r <= b) lines[L ^ 1] = 'BYE';
    }
    // qualifiés entrants : une place par fraction, tirée au sort, jamais face à un autre qualifié, en non-exempt si possible
    if (qIn.length) {
      let nf = finalTab ? pow2(qIn.length) : q * pow2(Math.ceil(qIn.length / q));
      nf = Math.min(nf, D / 2);
      const fs = D / nf, ordre = melange(Array.from({ length: nf }, (_, i) => i), R);
      melange(qIn.slice(), R).forEach((tok, n) => {
        const essais = ordre.slice(n % nf).concat(ordre.slice(0, n % nf));
        let L = null;
        for (const f of essais) {
          const libres = [];
          for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null && !reserve.has(x) && lines[x ^ 1] !== 'BYE' && !String(lines[x ^ 1] || '').startsWith('Q:')) libres.push(x);
          if (!libres.length) for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null && !String(lines[x ^ 1] || '').startsWith('Q:')) libres.push(x);
          if (!libres.length && !direct.length) for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null) libres.push(x);   // tableau de seuls qualifiés (art. 45-3-c)
          if (libres.length) { L = libres[Math.floor(R() * libres.length)]; break; }
        }
        if (L === null) throw new Error('Impossible de placer les qualifiés : augmente la taille du tableau ou réduis le nombre de qualifiés.');
        lines[L] = tok; reserve.delete(L);
      });
    }
    // les autres, au sort
    const reste = melange(tri.slice(nPos), R), vides = [];
    lines.forEach((x, i) => { if (x === null) vides.push(i); });
    reste.forEach((p, i) => { lines[vides[i]] = p.id; });
    lines.forEach((x, i) => { if (x === null) lines[i] = 'BYE'; });
    const nb = Math.log2(s), rounds = [];
    for (let r = 0; r < nb; r++) {
      const n = D / Math.pow(2, r + 1), l = [];
      for (let i = 0; i < n; i++) l.push({ id: spec.id + 'r' + r + 'm' + i, t: spec.id, r, i, a: null, b: null });
      rounds.push(l);
    }
    return { id: spec.id, nom: spec.nom, plage: spec.plage, q, size: D, s, lines, ts, rounds, tours: Array.from({ length: nb }, () => ({ fin: '' })) };
  }

  /* tous les tableaux du tournoi : du plus faible classement au tableau final */
  function build(I) {
    norm(I);
    if (I.players.length < 2) throw new Error('Il faut au moins deux participants.');
    const R = rng(I.seed), st = I.struct || [], rep = repartition(I), tabs = [];
    let qIn = [], lo = 0;
    for (let k = 0; k <= st.length; k++) {
      const finalTab = k === st.length, hi = finalTab ? 999 : rang(st[k].max);
      const spec = finalTab
        ? { id: '', nom: st.length ? 'Tableau final' : 'Tableau', plage: st.length ? (lo >= ECHELONS.length ? 'numérotés' : 'à partir de ' + ECHELONS[lo]) : '', q: 1 }
        : { id: LETTRES[k], nom: 'Tableau ' + (k + 1), plage: plageNom(lo, hi), q: Math.max(1, Math.min(16, +st[k].q || 1)) };
      const E = rep[k].length + qIn.length;
      if (E < 2) throw new Error(`${spec.nom}${spec.plage ? ' (' + spec.plage + ')' : ''} : il faut au moins deux joueurs. Change les limites de classement des tableaux.`);
      if (!finalTab && E <= spec.q) throw new Error(`${spec.nom} (${spec.plage}) : ${E} joueur${E > 1 ? 's' : ''} pour ${spec.q} qualifié${spec.q > 1 ? 's' : ''}. Réduis le nombre de qualifiés.`);
      const t = construire(spec, rep[k], qIn, R);
      tabs.push(t);
      qIn = finalTab ? [] : Array.from({ length: spec.q }, (_, j) => 'Q:' + spec.id + ':' + j);
      lo = hi + 1;
    }
    I.tabs = tabs;
    resolve(I);
  }

  /* le qualifié j sorti du tableau d'identifiant tid (null tant qu'il n'est pas connu) */
  function qualifie(I, tok) {
    const [, tid, j] = tok.split(':'), t = tabsOf(I).find(x => x.id === tid);
    if (!t) return null;
    const m = t.rounds[t.rounds.length - 1][+j];
    return m && m.w && m.conf ? m.w : null;
  }
  const brut = (I, x) => (x && String(x).startsWith('Q:') ? qualifie(I, x) : x);
  /* faire avancer les gagnants (et les exemptés) dans les tableaux, qualifiés compris */
  function resolve(I) {
    tabsOf(I).forEach(T => T.rounds.forEach((l, r) => l.forEach(m => {
      let a, b;
      if (r) {
        const f1 = T.rounds[r - 1][2 * m.i], f2 = T.rounds[r - 1][2 * m.i + 1];
        a = (f1.w && f1.conf && f1.w) || null; b = (f2.w && f2.conf && f2.w) || null;   // un résultat compte une fois confirmé
      } else { a = brut(I, T.lines[2 * m.i]) || null; b = brut(I, T.lines[2 * m.i + 1]) || null; }
      if (m.a !== a || m.b !== b) {
        if (m.w && ((m.w !== a && m.w !== b) || m.bye)) ['w', 'sc', 'conf', 'by', 'wo', 'conteste', 'bye', 'at'].forEach(k => delete m[k]);
        m.a = a; m.b = b;
      }
      if (m.a === 'BYE' && m.b && m.b !== 'BYE') { m.w = m.b; m.bye = true; m.conf = true; }
      else if (m.b === 'BYE' && m.a && m.a !== 'BYE') { m.w = m.a; m.bye = true; m.conf = true; }
      else if (m.a === 'BYE' && m.b === 'BYE') { m.w = 'BYE'; m.bye = true; m.conf = true; }
    })));
  }
  const etat = m => (m.w ? (m.conf ? 'done' : 'pending') : m.a && m.b ? 'ready' : 'wait');
  const allMatches = I => tabsOf(I).flatMap(t => t.rounds.flat());
  const findM = (I, id) => allMatches(I).find(m => m.id === id);
  /* le match suivant d'un match, et de quel côté son gagnant y joue (dans le tableau suivant pour un qualifié) */
  function suivant(I, m) {
    const T = tabDe(I, m); if (!T) return null;
    if (m.r < T.rounds.length - 1) return { m: T.rounds[m.r + 1][Math.floor(m.i / 2)], side: m.i % 2 ? 'b' : 'a' };
    if (T.q === 1) return null;
    const tok = 'Q:' + T.id + ':' + m.i;
    for (const U of tabsOf(I)) { const L = U.lines.indexOf(tok); if (L >= 0) return { m: U.rounds[0][L >> 1], side: L % 2 ? 'b' : 'a' }; }
    return null;
  }
  /* le match qui donnera l'adversaire d'un joueur déjà qualifié pour m */
  function avant(I, m, side) {
    const T = tabDe(I, m); if (!T) return null;
    if (m.r) return T.rounds[m.r - 1][2 * m.i + (side === 'a' ? 0 : 1)];
    const tok = T.lines[2 * m.i + (side === 'a' ? 0 : 1)];
    if (!String(tok || '').startsWith('Q:')) return null;
    const [, tid, j] = tok.split(':'), U = tabsOf(I).find(x => x.id === tid);
    return U ? U.rounds[U.rounds.length - 1][+j] : null;
  }
  /* nom d'un tour : « Quarts de finale », « Tableau 1 · Tour 2 », « Tableau 1 · Tour qualificatif »… */
  const tourNom = (r, nb) => TOURS[nb - 1 - r] || 'Tour ' + (r + 1);
  function nomTour(I, m) {
    const T = tabDe(I, m), nb = T.rounds.length, plusieurs = tabsOf(I).length > 1;
    if (T.q === 1) return (plusieurs ? 'Tableau final · ' : '') + tourNom(m.r, nb);
    return T.nom + ' · ' + (m.r === nb - 1 ? 'Tour qualificatif' : 'Tour ' + (m.r + 1));
  }
  const finDe = (I, m) => ((tabDe(I, m).tours || [])[m.r] || {}).fin || '';
  const champion = I => { const T = final(I); if (!T) return null; const f = T.rounds[T.rounds.length - 1][0]; return f.w && f.conf && f.w !== 'BYE' ? f.w : null; };
  const joueur = (I, id) => I.players.find(p => p.id === id) || null;
  /* nom d'un participant, d'un exempt ou d'une place de qualifié (« Qualifié 2 du tableau 1 ») */
  function nomDe(I, id) {
    if (id === 'BYE') return 'Exempt';
    if (String(id || '').startsWith('Q:')) {
      const q = qualifie(I, id); if (q) return nomDe(I, q);
      const [, tid, j] = id.split(':'), T = tabsOf(I).find(x => x.id === tid);
      return 'Qualifié ' + (+j + 1) + (T ? ' du ' + T.nom.toLowerCase() : '');
    }
    return (joueur(I, id) || {}).n || '';
  }
  const tsDe = (I, id) => { for (const T of tabsOf(I)) if (T.ts && T.ts[id]) return T.ts[id]; return 0; };
  /* classement final : vainqueur, finaliste, demi-finalistes… (tableau final) */
  function places(I) {
    const T = final(I); if (!T) return [];
    const out = [], nb = T.rounds.length, ch = champion(I);
    if (ch) out.push({ place: 1, id: ch });
    for (let r = nb - 1; r >= 0; r--) {
      const pl = Math.pow(2, nb - 1 - r) + 1;
      T.rounds[r].forEach(m => { if (m.w && m.conf && !m.bye) { const lo = m.w === m.a ? m.b : m.a; if (lo && lo !== 'BYE') out.push({ place: pl, lo: Math.min(pl * 2 - 2, Math.pow(2, nb)), id: lo }); } });
    }
    return out;
  }

  function reduce(T, action) {
    const I = T.int, p = action.payload || {};
    if (!I) throw new Error('Ce tournoi n’est pas un tournoi interne.');
    norm(I);
    const deja = tire(I), fini = I.status === 'done';
    const exige = (ok, msg) => { if (!ok) throw new Error(msg); };
    switch (action.type) {
      case 'int/setup': {
        if (p.name != null) T.tournament.name = String(p.name).slice(0, 80) || 'Tournoi interne';
        if (p.club != null) T.tournament.club = String(p.club).slice(0, 80);
        if (p.dateStart != null) T.tournament.dateStart = String(p.dateStart).slice(0, 10);
        if (p.dateEnd != null) T.tournament.dateEnd = String(p.dateEnd).slice(0, 10);
        if (p.regle != null) I.regle = String(p.regle).slice(0, 8000);
        if (p.regMode != null) T.tournament.regMode = ['none'].includes(p.regMode) ? p.regMode : '';
        if (p.sport != null && (p.sport === 'Padel' ? 'Padel' : 'Tennis') !== I.sport) { exige(!deja, 'Le sport ne change plus après le tirage.'); I.sport = p.sport === 'Padel' ? 'Padel' : 'Tennis'; if (I.sport === 'Padel') { I.format = 0; I.struct = []; } else if (!I.format) I.format = I.simple ? 2 : 4; }
        if (p.simple != null && !!p.simple !== I.simple) { exige(!deja, 'Simple ou double ne change plus après le tirage.'); I.simple = !!p.simple; if (!I.simple && (I.format === 1 || I.format === 2)) I.format = 4; }
        if (p.format != null && +p.format !== I.format) {
          exige(!deja || !allMatches(I).some(m => m.w && !m.bye), 'Des résultats sont saisis : le format ne change plus.');
          const f = +p.format || 0;
          exige(f === 0 || FORMATS[f], 'Format inconnu.');
          exige(I.sport === 'Tennis' || f === 0, 'Les formats FFT concernent le tennis.');
          exige(I.simple || f === 0 || FORMATS[f].pd, 'En double, le point décisif est obligatoire (art. 11) : formats 3 à 7.');
          I.format = f;
        }
        if (p.struct != null) {
          exige(!deja, 'Le tableau est tiré : annule le tirage pour changer la structure.');
          exige(Array.isArray(p.struct) && p.struct.length <= 4, 'Quatre tableaux successifs au plus avant le tableau final.');
          const st = p.struct.map(x => ({ max: clNorm(x && x.max), q: Math.floor(+(x && x.q) || 0) }));
          st.forEach((x, k) => {
            exige(x.max && rang(x.max) < 100, `Tableau ${k + 1} : choisis le classement le plus haut admis (de NC à -30).`);
            exige(x.q >= 1 && x.q <= 16, `Tableau ${k + 1} : de 1 à 16 qualifiés sortants.`);
            exige(!k || rang(x.max) > rang(st[k - 1].max), `Tableau ${k + 1} : son classement le plus haut doit dépasser celui du tableau ${k}.`);
          });
          I.struct = st;
        }
        return T;
      }
      case 'int/player/add': {
        exige(!deja, 'Le tableau est tiré : retire le tirage pour changer les participants.');
        exige(I.players.length < 128, '128 participants au plus.');
        const n = String(p.n || '').trim().slice(0, 80); exige(n, 'Le nom du participant manque.');
        const ks = (Array.isArray(p.ks) ? p.ks : [p.k]).filter(Boolean).map(String).slice(0, 2);
        exige(!ks.some(k => I.players.some(x => (x.ks || []).includes(k))), 'Cet adhérent participe déjà.');
        const x = { id: 'j' + (I.players.length ? Math.max(...I.players.map(y => +String(y.id).slice(1) || 0)) + 1 : 1), n, ks };
        const cl = clNorm(p.cl); if (cl) x.cl = cl;
        I.players.push(x);
        return T;
      }
      case 'int/player/remove': exige(!deja, 'Le tableau est tiré.'); I.players = I.players.filter(x => x.id !== p.id); return T;
      case 'int/player/seed': {
        exige(!deja, 'Le tableau est tiré.');
        const x = joueur(I, p.id); exige(x, 'Participant introuvable.');
        const s = +p.seed || 0; if (s) I.players.forEach(y => { if (y !== x && +y.seed === s) delete y.seed; });
        if (s > 0 && s <= 32) x.seed = s; else delete x.seed;
        return T;
      }
      case 'int/player/cl': {
        exige(!deja, 'Le tableau est tiré : annule le tirage pour changer un classement.');
        const x = joueur(I, p.id); exige(x, 'Participant introuvable.');
        const cl = clNorm(p.cl); if (cl) x.cl = cl; else delete x.cl;
        return T;
      }
      case 'int/tour': {
        const U = tabsOf(I).find(x => x.id === String(p.t || '')) || (p.t == null ? final(I) : null);
        exige(U && U.tours[p.r], 'Tour inconnu.');
        U.tours[p.r].fin = String(p.fin || '').slice(0, 10);
        return T;
      }
      case 'int/draw': {
        exige(!fini, 'Tournoi terminé.');
        exige(!allMatches(I).some(m => m.w && !m.bye), 'Des résultats sont saisis : le tirage ne se refait plus.');
        if (p.reseed) I.seed = Math.floor(Math.random() * 1e9);
        build(I); I.status = 'live';
        return T;
      }
      case 'int/undraw': {
        exige(!allMatches(I).some(m => m.w && !m.bye), 'Des résultats sont saisis : le tirage ne s’annule plus.');
        I.tabs = []; I.status = 'setup';
        return T;
      }
      /* résultat : saisi par un joueur du match (à confirmer par l'adversaire) ou par le juge-arbitre (validé) */
      case 'int/result': {
        exige(!fini, 'Tournoi terminé.');
        const m = findM(I, p.m); exige(m, 'Match introuvable.');
        exige(m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE', 'Ce match n’a pas encore ses deux joueurs.');
        exige(p.w === m.a || p.w === m.b, 'Le vainqueur doit être l’un des deux joueurs.');
        const nx = suivant(I, m);
        exige(!(nx && nx.m.w && !nx.m.bye && m.w && m.w !== p.w), 'Le match suivant est déjà joué.');
        const ja = !p.by;
        if (!ja) exige(p.by === m.a || p.by === m.b, 'Seuls les joueurs du match saisissent son résultat.');
        let sc = String(p.sc || '').slice(0, 60);
        if (!p.wo && FORMATS[I.format]) {
          exige(sc.trim(), `Indique le score, par exemple ${FORMATS[I.format].ex}.`);
          const v = verifScore(I.format, sc); exige(v.ok, v.err); sc = v.sc;
        }
        Object.assign(m, { w: p.w, sc, by: p.by || 'ja', at: Date.now(), conf: ja || !!p.wo });
        if (p.wo) m.wo = true; else delete m.wo;
        delete m.conteste;
        resolve(I);
        return T;
      }
      case 'int/confirm': {
        const m = findM(I, p.m); exige(m && m.w && !m.conf, 'Rien à confirmer.');
        exige(p.by && (p.by === m.a || p.by === m.b) && p.by !== m.by, 'Seul l’adversaire confirme le résultat.');
        m.conf = true; delete m.conteste;
        resolve(I);
        return T;
      }
      case 'int/contest': {
        const m = findM(I, p.m); exige(m && m.w && !m.conf, 'Rien à contester.');
        exige(p.by && (p.by === m.a || p.by === m.b) && p.by !== m.by, 'Seul l’adversaire conteste le résultat.');
        m.conteste = String(p.why || '').slice(0, 300) || 'Résultat contesté';
        return T;
      }
      case 'int/reset': {
        const m = findM(I, p.m); exige(m && !m.bye, 'Match introuvable.');
        const nx = suivant(I, m);
        exige(!(nx && nx.m.w && !nx.m.bye), 'Le match suivant est déjà joué : efface-le d’abord.');
        ['w', 'sc', 'by', 'at', 'conf', 'wo', 'conteste'].forEach(k => delete m[k]);
        resolve(I);
        return T;
      }
      case 'int/remind': { (I.relances = I.relances || {})[p.m] = Date.now(); return T; }
      case 'int/finish': { I.status = 'done'; T.tournament.closed = true; T.tournament.closedAt = Date.now(); return T; }
      case 'int/reopen': case 'tournament/setClosed': { if (action.type === 'tournament/setClosed' && p.closed) { I.status = 'done'; T.tournament.closed = true; return T; } I.status = tire(I) ? 'live' : 'setup'; T.tournament.closed = false; return T; }
      case 'noop': return T;
    }
    throw new Error('Action inconnue : ' + action.type);
  }

  /* ce qui doit être annoncé entre deux états : [{ to: [ids des participants], body, tag, ja? }] */
  function avis(A, B) {
    const out = [];
    if (!A || !B || !isInterne(A) || !isInterne(B) || !tire(B.int)) return out;
    const IA = A.int, IB = B.int, nm = id => nomDe(IB, id);
    const avantM = id => (tire(IA) ? findM(IA, id) : null);
    const fin = m => { const f = finDe(IB, m); return f ? ' avant le ' + f.split('-').reverse().slice(0, 2).join('/') : ''; };
    for (const m of allMatches(IB)) {
      const o = avantM(m.id) || {};
      const reel = x => x && x !== 'BYE';
      // le match devient prêt : les deux joueurs connaissent leur adversaire
      if (reel(m.a) && reel(m.b) && !m.w && !(o.a === m.a && o.b === m.b)) {
        out.push({ to: [m.a], body: `${nomTour(IB, m)} : ton adversaire est ${nm(m.b)}. Contactez-vous pour organiser le match${fin(m)}.`, tag: 'pret-' + m.id });
        out.push({ to: [m.b], body: `${nomTour(IB, m)} : ton adversaire est ${nm(m.a)}. Contactez-vous pour organiser le match${fin(m)}.`, tag: 'pret-' + m.id });
        // le match d'après attend déjà un joueur : il sait que son adversaire sortira de ce match
        const nx = suivant(IB, m);
        if (nx) { const att = nx.side === 'a' ? nx.m.b : nx.m.a; if (reel(att)) out.push({ to: [att], body: `${nm(m.a)} et ${nm(m.b)} vont jouer : le gagnant sera ton adversaire (${nomTour(IB, nx.m).toLowerCase()}).`, tag: 'avant-' + nx.m.id }); }
      }
      // résultat saisi par un joueur : l'adversaire confirme
      if (m.w && !m.conf && m.by && m.by !== 'ja' && !(o.w === m.w && o.at === m.at)) {
        const adv = m.by === m.a ? m.b : m.a;
        out.push({ to: [adv], body: `${nm(m.by)} a saisi le résultat de votre match : ${m.w === m.by ? 'victoire de ' + nm(m.by) : 'ta victoire'}${m.sc ? ' (' + m.sc + ')' : ''}. Confirme-le dans l’appli.`, tag: 'conf-' + m.id });
      }
      // contestation : le juge-arbitre tranche
      if (m.conteste && !o.conteste) out.push({ to: [], ja: true, body: `Résultat contesté (${nomTour(IB, m).toLowerCase()}) : ${nm(m.a)} contre ${nm(m.b)}. À trancher dans /RAM JA.`, tag: 'contest-' + m.id });
    }
    // vainqueur du tournoi
    const ch = champion(IB);
    if (ch && ch !== champion(IA)) out.push({ to: IB.players.map(p => p.id), body: `${nm(ch)} remporte ${B.tournament.name || 'le tournoi interne'} !`, tag: 'champion' });
    return out;
  }
  /* rappels : matchs prêts dont la date limite approche (2 jours), une seule fois par match */
  function aRelancer(T, auj = today()) {
    if (!isInterne(T) || !tire(T.int) || T.int.status !== 'live') return [];
    const I = T.int, lim = new Date(new Date(auj + 'T12:00').getTime() + 2 * 864e5).toISOString().slice(0, 10);
    return allMatches(I).filter(m => { const f = finDe(I, m); return etat(m) === 'ready' && f && f <= lim && f >= auj && !(I.relances || {})[m.id]; });
  }
  return { initialState, reduce, isInterne, build, resolve, etat, allMatches, findM, suivant, avant, champion, places, nomDe, joueur, tourNom, nomTour, finDe, avis, aRelancer, seedOrder, placesTS,
    tabsOf, tire, tsDe, repartition, rang, clNorm, ECHELONS, FORMATS, formatNom, verifScore, norm };
});
