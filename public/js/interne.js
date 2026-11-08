/* =========================================================================
   /RAM JA — Tournoi interne d'un club (tennis ou padel, simple ou double)
   Moteur partagé (serveur Node + navigateur), à côté des tournois FFT et des animations.
   - Le juge-arbitre crée le tournoi dans /RAM JA : règlement, format de match (formats FFT 1 à 7),
     participants (adhérents du club) et leur classement, formule, date limite de chaque tour, tirage.
   - Trois formules (règlements sportifs FFT 2027) :
       · tableaux : un tableau unique, ou des tableaux successifs par classement (art. 45 à 50) ;
       · poules puis tableau final : poules de 6 au plus, une tête de série par poule, les premiers
         de chaque poule rejoignent le tableau final (art. 53 à 56) ;
       · tournoi multi-chances (TMC) : les perdants sont reversés dans des tableaux de classement,
         chacun est classé de 1 à n (art. 51 bis).
     Une épreuve de consolation peut s'ajouter aux deux premières (art. 51-2).
   - Règles des tableaux :
       · dimension : la plus petite puissance de 2 × qualifiés sortants ≥ effectif (art. 47-2) ;
       · tableau intermédiaire « à sections » : une section par qualifié, une tête de série par section,
         la n° 1 en bas de la dernière section, la n° 2 en bas de celle du dessus… (art. 46-1-e-ii, 49) ;
       · tableau final : têtes de série = le quart de la dimension, en haut des fractions du demi-tableau
         haut, en bas de celles du demi-tableau bas ; 3-4, puis 5-8… tirées au sort entre elles (art. 46) ;
         TMC : la n° 1 en bas, la n° 2 en haut (art. 51 bis-5) ;
       · exempts aux premières têtes de série, puis aux mieux classés placés comme des têtes de série (art. 47-4) ;
       · qualifiés du tableau précédent : une place par fraction, tirée au sort, jamais face à un autre
         qualifié pour leur premier match, en non-exempt si possible (art. 45-3-c, 46-2, 47-5, 47-6).
   - Les joueurs organisent eux-mêmes leurs matchs sur plusieurs semaines (le gagnant saisit le résultat
     dans /RAM Club, l'adversaire le confirme) ou le juge-arbitre les programme (jour, heure, terrain) :
     limites de parties par jour, repos et horaires sont vérifiés (art. 9, 13 et 14).
   - avis(avant, après) : les notifications à envoyer.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Int = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const today = () => new Date().toISOString().slice(0, 10);
  const isInterne = T => !!(T && T.kind === 'interne' && T.int);
  const TOURS = ['Finale', 'Demi-finales', 'Quarts de finale', 'Huitièmes de finale', 'Seizièmes de finale', '32es de finale', '64es de finale'];

  /* ---------- formats de jeu (règlements sportifs FFT, art. 9, 13, 14) ---------- */
  // j : jeux pour gagner une manche ; t : jeu décisif à t-t ; sjd : 3e manche = super jeu décisif ; pd : point décisif
  // simples / parties : par jour au plus ; repos : minutes entre deux simples (reposJ : jeunes et seniors +) ; duree : estimation en minutes
  const FORMATS = {
    1: { l: '3 sets à 6 jeux, jeu décisif à 6-6', j: 6, t: 6, sjd: false, pd: false, ex: '6-3 3-6 7-5', simples: 2, parties: 3, repos: 90, reposJ: 180, duree: 150 },
    2: { l: '2 sets à 6 jeux, jeu décisif à 6-6, 3e set = super jeu décisif à 10 points', j: 6, t: 6, sjd: true, pd: false, ex: '6-3 3-6 10-7', simples: 2, parties: 3, repos: 90, reposJ: 180, duree: 105 },
    3: { l: '2 sets à 4 jeux, point décisif, jeu décisif à 4-4, 3e set = super jeu décisif à 10 points', j: 4, t: 4, sjd: true, pd: true, ex: '4-2 3-5 10-6', simples: 3, parties: 4, repos: 30, reposJ: 30, duree: 60 },
    4: { l: '2 sets à 6 jeux, point décisif, jeu décisif à 6-6, 3e set = super jeu décisif à 10 points', j: 6, t: 6, sjd: true, pd: true, ex: '6-4 4-6 10-8', simples: 2, parties: 3, repos: 90, reposJ: 90, duree: 90 },
    5: { l: '2 sets à 3 jeux, point décisif, jeu décisif à 2-2, 3e set = super jeu décisif à 10 points', j: 3, t: 2, sjd: true, pd: true, ex: '3-1 2-3 10-5', simples: 4, parties: 5, repos: 30, reposJ: 30, duree: 45 },
    6: { l: '2 sets à 4 jeux, point décisif, jeu décisif à 3-3, 3e set = super jeu décisif à 10 points', j: 4, t: 3, sjd: true, pd: true, ex: '4-1 3-4 10-6', simples: 3, parties: 4, repos: 30, reposJ: 30, duree: 60 },
    7: { l: '2 sets à 5 jeux, point décisif, jeu décisif à 4-4, 3e set = super jeu décisif à 10 points', j: 5, t: 4, sjd: true, pd: true, ex: '5-3 4-5 10-8', simples: 2, parties: 3, repos: 30, reposJ: 30, duree: 75 }
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
  /* manches et jeux d'un match (du côté du vainqueur) pour le classement d'une poule (art. 56) :
     le super jeu décisif compte comme une manche avec un jeu d'écart ; une victoire par forfait donne ce qu'il faut pour gagner */
  function bilan(I, m) {
    const F = FORMATS[I.format] || { j: 6, sjd: false };
    if (m.wo) return { mg: 2, mp: 0, jg: 2 * F.j, jp: 0 };
    const o = { mg: 0, mp: 0, jg: 0, jp: 0 };
    String(m.sc || '').split(/[\s,;]+/).forEach((t, i) => {
      const x = t.match(/^(\d{1,2})[-/](\d{1,2})/); if (!x) return;
      let a = +x[1], b = +x[2];
      if (i === 2 && F.sjd) { a = a > b ? 1 : 0; b = 1 - a; }
      if (a > b) o.mg++; else if (b > a) o.mp++;
      o.jg += a; o.jp += b;
    });
    return o;
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
  const CATEGORIES = { seniors: 'Seniors', jeunes: 'Jeunes (12 ans et plus)', plus: 'Seniors + (35 ans et plus)', plus50: 'Seniors + 50 ans et plus' };

  function initialState(opts = {}) {
    const padel = opts.sport === 'Padel';
    return {
      version: 2,
      kind: 'interne',
      tournament: { name: String(opts.name || 'Tournoi interne').slice(0, 80), category: 'Tournoi interne', gender: '', dateStart: today(), dateEnd: '', club: opts.club || '', closed: false, regMode: '' },
      courts: [], pairs: [], matches: [], poules: [], draw: null, order: null,
      int: { sport: padel ? 'Padel' : 'Tennis', simple: !padel, regle: '', format: padel ? 0 : 2, mode: 'tableaux', struct: [], pcfg: { n: 2, q: 1, max: '' },
        prog: false, terrains: [], categorie: 'seniors', players: [], tabs: [], poules: [], status: 'setup', seed: Math.floor(Math.random() * 1e9), relances: {} }
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

  /* ---------- tableaux et poules ---------- */
  const tabsOf = I => (I.tabs && I.tabs.length ? I.tabs : I.bracket ? [legacyTab(I)] : []);
  const poulesOf = I => I.poules || [];
  // tournoi tiré avant les tableaux successifs : un seul tableau, ses identifiants de match inchangés
  function legacyTab(I) {
    const B = I.bracket, ts = {};
    I.players.forEach(p => { if (+p.seed > 0) ts[p.id] = +p.seed; });
    B.rounds.forEach(l => l.forEach(m => { m.t = ''; }));
    return { id: '', nom: 'Tableau', role: 'final', q: 1, size: B.size, s: B.size, lines: B.rounds[0].flatMap(m => [m.a, m.b]), ts, rounds: B.rounds, tours: I.tours || [] };
  }
  function norm(I) {
    if (!I.tabs && I.bracket) { I.tabs = [legacyTab(I)]; delete I.bracket; delete I.tours; }
    if (!I.tabs) I.tabs = [];
    if (!I.poules) I.poules = [];
    if (!Array.isArray(I.struct)) I.struct = [];
    if (I.format == null) I.format = 0;   // tournoi créé avant les formats : score libre
    if (!I.mode) I.mode = 'tableaux';
    if (!I.pcfg) I.pcfg = { n: 2, q: 1, max: '' };
    if (!Array.isArray(I.terrains)) I.terrains = [];
    if (!I.categorie) I.categorie = 'seniors';
    return I;
  }
  const tire = I => tabsOf(I).length > 0 || poulesOf(I).length > 0;
  const estTok = x => /^[QPL]:/.test(String(x || ''));
  // le tableau principal (celui du vainqueur) ; un tableau d'avant les rôles : le dernier tableau à un seul qualifié
  const final = I => { const l = tabsOf(I); return l.find(t => t.role === 'final') || l.find(t => !t.role && t.q === 1 && t.id === '') || l[l.length - 1] || null; };
  const consolante = I => tabsOf(I).find(t => t.role === 'consol') || null;
  const LETTRES = 'abcdefgh';
  const plageNom = (lo, hi) => (lo === hi ? ECHELONS[lo] : (lo === 0 ? 'NC' : ECHELONS[lo]) + ' à ' + (hi >= ECHELONS.length ? 'numérotés' : ECHELONS[hi]));
  const POULES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  /* formule poules : qui joue les poules (jusqu'au classement choisi), qui entre directement au tableau final */
  function repartitionPoules(I) {
    const c = I.pcfg || {}, lim = c.max ? rang(c.max) : Infinity, pou = [], dir = [];
    I.players.forEach(p => (rang(p.cl) <= lim ? pou : dir).push(p));
    return { poules: pou, direct: dir };
  }
  // ordre de classement : têtes de série choisies à la main d'abord, puis le classement, puis le sort
  const trier = (l, R) => melange(l.slice(), R).sort((x, y) => ((+x.seed || 999) - (+y.seed || 999)) || (rang(y.cl) - rang(x.cl)));

  /* construire un tableau : dimension, exempts, têtes de série, qualifiés entrants, puis tirage des autres */
  function construire(spec, direct, qIn, R) {
    const q = spec.q, E = direct.length + qIn.length;
    let s = 1; while (s * q < E) s *= 2;
    const D = s * q, b = D - E, finalTab = q === 1;
    const tri = trier(direct, R);
    const classes = direct.some(p => rang(p.cl) > 0 || +p.seed > 0);
    // tableau intermédiaire : autant de têtes de série que de qualifiés, ou le huitième de l'effectif (multiple du
    // nombre de sections) au-delà de 8 joueurs par qualifié (méthode FFT d'établissement des tableaux)
    const nTS = !classes ? 0 : Math.min(direct.length, finalTab ? Math.max(1, D / 4) : E > 8 * q ? Math.ceil(E / 8 / q) * q : q);
    // place d'une « tête de série » n° r (aussi celle des exempts suivants, art. 47-4-b)
    let pos;
    if (finalTab) { const l = placesTS(D, R).map(x => (spec.tmc ? D - 1 - x : x)); pos = r => l[r - 1]; }
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
    // qualifiés entrants : une place par fraction, tirée au sort, jamais face à un autre qualifié, en non-exempt si possible ;
    // le 2e d'une poule va dans l'autre moitié que le 1er de sa poule (spec.oppose)
    if (qIn.length) {
      let nf = finalTab ? pow2(qIn.length) : q * pow2(Math.ceil(qIn.length / q));
      nf = Math.min(nf, D / 2);
      const fs = D / nf, ordre = melange(Array.from({ length: nf }, (_, i) => i), R), opp = spec.oppose || {};
      const toks = melange(qIn.slice(), R).sort((x, y) => (opp[x] ? 1 : 0) - (opp[y] ? 1 : 0));
      toks.forEach((tok, n) => {
        const Lp = opp[tok] ? lines.indexOf(opp[tok]) : -1;
        const essais = ordre.slice(n % nf).concat(ordre.slice(0, n % nf)).filter(f => Lp < 0 || (f * fs < D / 2) !== (Lp < D / 2) || D < 4);
        let L = null;
        // dans sa fraction, loin de la tête de série : partie basse d'une fraction du demi-tableau haut, partie haute dans
        // le demi-tableau bas ; dans une section (tête de série en bas), sa partie haute
        const loin = (x, f) => { const mi = f * fs + fs / 2; return !finalTab ? x < mi : f * fs < D / 2 ? x >= mi : x < mi; };
        for (const f of essais) {
          let libres = [];
          for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null && !reserve.has(x) && lines[x ^ 1] !== 'BYE' && !estTok(lines[x ^ 1])) libres.push(x);
          if (fs >= 4 && libres.some(x => loin(x, f))) libres = libres.filter(x => loin(x, f));
          if (!libres.length) for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null && !estTok(lines[x ^ 1])) libres.push(x);
          if (!libres.length && (!direct.length || spec.poules)) for (let x = f * fs; x < (f + 1) * fs; x++) if (lines[x] === null) libres.push(x);   // seuls qualifiés, ou sortis de poules (art. 45-3-c, 55-3)
          if (libres.length) { L = libres[Math.floor(R() * libres.length)]; break; }
        }
        if (L === null) for (let x = 0; x < D && L === null; x++) if (lines[x] === null && (spec.poules || !estTok(lines[x ^ 1]))) L = x;
        if (L === null) throw new Error('Impossible de placer les qualifiés : augmente la taille du tableau ou réduis le nombre de qualifiés.');
        lines[L] = tok; reserve.delete(L);
      });
    }
    // les autres, au sort
    const reste = melange(tri.slice(nPos), R), vides = [];
    lines.forEach((x, i) => { if (x === null) vides.push(i); });
    reste.forEach((p, i) => { lines[vides[i]] = p.id; });
    lines.forEach((x, i) => { if (x === null) lines[i] = 'BYE'; });
    return tabDeLignes(spec, lines, ts, s);
  }
  /* un tableau dont les lignes du 1er tour sont connues (aussi les tableaux de classement d'un TMC) */
  function tabDeLignes(spec, lines, ts, s) {
    const D = lines.length, q = spec.q || 1, nb = Math.log2(s || D), rounds = [];
    for (let r = 0; r < nb; r++) {
      const n = D / Math.pow(2, r + 1), l = [];
      for (let i = 0; i < n; i++) l.push({ id: spec.id + 'r' + r + 'm' + i, t: spec.id, r, i, a: null, b: null });
      rounds.push(l);
    }
    const t = { id: spec.id, nom: spec.nom, plage: spec.plage || '', role: spec.role || (q === 1 ? 'final' : 'inter'), q, size: D, s: s || D, lines, ts: ts || {}, rounds, tours: Array.from({ length: nb }, () => ({ fin: '' })) };
    if (spec.lo) t.lo = spec.lo;
    return t;
  }

  /* formule tableaux : du plus faible classement au tableau final */
  function buildTableaux(I, R) {
    const st = I.struct || [], rep = repartition(I), tabs = [];
    let qIn = [], lo = 0;
    for (let k = 0; k <= st.length; k++) {
      const finalTab = k === st.length, hi = finalTab ? 999 : rang(st[k].max);
      const spec = finalTab
        ? { id: '', nom: st.length ? 'Tableau final' : 'Tableau', plage: st.length ? (lo >= ECHELONS.length ? 'numérotés' : 'à partir de ' + ECHELONS[lo]) : '', q: 1, role: 'final' }
        : { id: LETTRES[k], nom: 'Tableau ' + (k + 1), plage: plageNom(lo, hi), q: Math.max(1, Math.min(16, +st[k].q || 1)), role: 'inter' };
      const E = rep[k].length + qIn.length;
      if (E < 2) throw new Error(`${spec.nom}${spec.plage ? ' (' + spec.plage + ')' : ''} : il faut au moins deux joueurs. Change les limites de classement des tableaux.`);
      if (k > 0 && !finalTab && qIn.length > rep[k].length) throw new Error(`${spec.nom}${spec.plage ? ' (' + spec.plage + ')' : ''} : ${qIn.length} qualifiés entrants pour ${rep[k].length} joueur${rep[k].length > 1 ? 's' : ''} admis directement ; deux qualifiés se rencontreraient d’entrée (art. 45-3-c). Réduis le nombre de qualifiés du tableau précédent ou change les limites de classement.`);
      if (!finalTab && E <= spec.q) throw new Error(`${spec.nom} (${spec.plage}) : ${E} joueur${E > 1 ? 's' : ''} pour ${spec.q} qualifié${spec.q > 1 ? 's' : ''}. Réduis le nombre de qualifiés.`);
      tabs.push(construire(spec, rep[k], qIn, R));
      qIn = finalTab ? [] : Array.from({ length: spec.q }, (_, j) => 'Q:' + spec.id + ':' + j);
      lo = hi + 1;
    }
    I.tabs = tabs; I.poules = [];
  }
  /* formule poules : poules de 6 au plus (effectifs à une unité près), une tête de série par poule, réparties comme
     dans un tableau à sections (n° 1 dans la dernière poule…), les autres en serpentin pour équilibrer (art. 54) */
  function buildPoules(I, R) {
    const c = I.pcfg || {}, { poules: P, direct } = repartitionPoules(I);
    const n = Math.max(1, Math.floor(+c.n || 1)), q = Math.max(1, Math.floor(+c.q || 1));
    if (P.length < 2 * n) throw new Error(`${P.length} joueurs pour ${n} poules : il faut au moins deux joueurs par poule.`);
    if (Math.ceil(P.length / n) > 6) throw new Error(`Six joueurs au plus par poule (art. 54) : il faut au moins ${Math.ceil(P.length / 6)} poules.`);
    if (Math.floor(P.length / n) <= q) throw new Error(`Chaque poule doit compter plus de joueurs que de qualifiés (${q} par poule).`);
    const tri = trier(P, R), classes = P.some(p => rang(p.cl) > 0 || +p.seed > 0), groupes = Array.from({ length: n }, () => []);
    tri.forEach((p, i) => { const rangee = Math.floor(i / n), k = i % n, j = rangee % 2 ? k : n - 1 - k; groupes[j].push(p); });
    I.poules = groupes.map((g, k) => {
      const ids = g.map(p => p.id), matches = [];
      // chaque joueur rencontre tous les autres, dans un ordre de tournante
      const l = ids.length % 2 ? ids.concat(['-']) : ids.slice(), N = l.length;
      for (let t = 0; t < N - 1; t++) for (let x = 0; x < N / 2; x++) { const a = l[x], b = l[N - 1 - x]; if (a !== '-' && b !== '-') matches.push({ id: 'p' + k + 'm' + matches.length, poule: k, a, b }); l.splice(1, 0, l.pop()); }
      return { id: 'p' + k, k, nom: 'Poule ' + POULES[k], joueurs: ids, ts: classes ? { [g[0].id]: n - k } : {}, q, matches, fin: '' };
    });
    // têtes de série : la n° 1 est dans la dernière poule (serpentin), son numéro = n - k
    const toks = [], oppose = {};
    I.poules.forEach(po => { for (let r = 1; r <= q; r++) { toks.push('P:' + po.k + ':' + r); if (r === 2) oppose['P:' + po.k + ':2'] = 'P:' + po.k + ':1'; } });
    if (direct.length + toks.length < 2) throw new Error('Il faut au moins deux joueurs au tableau final.');
    I.tabs = [construire({ id: '', nom: 'Tableau final', plage: direct.length ? 'qualifiés des poules et ' + direct.length + ' entrée' + (direct.length > 1 ? 's' : '') + ' directe' + (direct.length > 1 ? 's' : '') : 'qualifiés des poules', q: 1, role: 'final', oppose, poules: true }, direct, toks, R)];
  }
  /* formule TMC : tableau principal (32 au plus), puis les perdants de chaque tour reversés dans un tableau de
     classement plus petit, placés d'après leur place dans le tableau d'avant (art. 51 bis-3) ; chacun est classé */
  function buildTMC(I, R) {
    if (I.players.length > 32) throw new Error('Un TMC compte 32 joueurs au plus (art. 51 bis).');
    const main = construire({ id: '', nom: 'Tableau principal', q: 1, role: 'final', tmc: true, lo: 1 }, I.players, [], R);
    main.lo = 1;
    const tabs = [main], file = [main];
    while (file.length) {
      const T = file.shift(), nb = T.rounds.length;
      for (let r = 0; r < nb - 1; r++) {
        const g = T.size / Math.pow(2, r + 1), lo = T.lo + g, id = 'k' + lo + 's' + g;
        const nom = g === 2 ? `Places ${lo} et ${lo + 1}` : `Places ${lo} à ${lo + g - 1}`;
        const U = tabDeLignes({ id, nom, q: 1, role: 'class', lo }, T.rounds[r].map(m => 'L:' + m.id), {}, g);
        tabs.push(U); file.push(U);
      }
    }
    I.tabs = tabs; I.poules = [];
  }
  function build(I) {
    norm(I);
    if (I.players.length < 2) throw new Error('Il faut au moins deux participants.');
    const R = rng(I.seed);
    if (I.mode === 'poules') buildPoules(I, R);
    else if (I.mode === 'tmc') buildTMC(I, R);
    else buildTableaux(I, R);
    resolve(I);
  }

  /* ---------- poules : classement (art. 56) ---------- */
  const pouleFinie = po => po.matches.every(m => m.w && m.conf);
  function classementPoule(I, po) {
    const st = {}, R = rng((I.seed || 0) + po.k * 7919), alea = {};
    po.joueurs.forEach(id => { st[id] = { id, pts: 0, j: 0, g: 0, mg: 0, mp: 0, jg: 0, jp: 0 }; alea[id] = R(); });
    const fait = po.matches.filter(m => m.w && m.conf);
    fait.forEach(m => {
      const lo = m.w === m.a ? m.b : m.a, b = bilan(I, m), W = st[m.w], L = st[lo]; if (!W || !L) return;
      W.pts += 2; W.g++; W.j++; L.j++; if (!m.wo) L.pts += 1;
      W.mg += b.mg; W.mp += b.mp; W.jg += b.jg; W.jp += b.jp; L.mg += b.mp; L.mp += b.mg; L.jg += b.jp; L.jp += b.jg;
    });
    // égalité : différence de manches, puis de jeux, sur toute la poule, puis entre les seuls joueurs à départager, puis le sort
    const diff = (ids, sub) => {
      const o = {}; ids.forEach(id => { o[id] = { m: 0, j: 0 }; });
      fait.filter(m => !sub || (ids.includes(m.a) && ids.includes(m.b))).forEach(m => {
        const lo = m.w === m.a ? m.b : m.a, b = bilan(I, m);
        if (o[m.w]) { o[m.w].m += b.mg - b.mp; o[m.w].j += b.jg - b.jp; }
        if (o[lo]) { o[lo].m += b.mp - b.mg; o[lo].j += b.jp - b.jg; }
      });
      return o;
    };
    const ranger = (ids, niveau) => {
      if (ids.length < 2) return ids;
      if (niveau === 0) { const g = {}; ids.forEach(id => (g[st[id].pts] = g[st[id].pts] || []).push(id)); return Object.keys(g).sort((a, b) => b - a).flatMap(k => ranger(g[k], 1)); }
      if (niveau === 3) return ids.slice().sort((a, b) => alea[a] - alea[b]);
      const d = diff(ids, niveau === 2), g = {};
      ids.forEach(id => { const k = d[id].m * 1000 + d[id].j; (g[k] = g[k] || []).push(id); });
      return Object.keys(g).sort((a, b) => b - a).flatMap(k => ranger(g[k], niveau + 1));
    };
    return ranger(po.joueurs.slice(), 0).map(id => st[id]);
  }

  /* une place à venir : qualifié d'un tableau (Q), d'une poule (P), perdant d'un match de TMC (L) */
  function qualifie(I, tok) {
    const [k, x, y] = tok.split(':');
    if (k === 'Q') {
      const t = tabsOf(I).find(u => u.id === x); if (!t) return null;
      const m = t.rounds[t.rounds.length - 1][+y];
      return m && m.w && m.conf ? m.w : null;
    }
    if (k === 'P') {
      const po = poulesOf(I).find(u => u.k === +x); if (!po || !pouleFinie(po)) return null;
      const c = classementPoule(I, po)[+y - 1];
      return c ? c.id : null;
    }
    if (k === 'L') {
      const m = findM(I, x); if (!m || !m.w || !m.conf) return null;
      if (m.w === 'BYE') return 'BYE';
      return m.w === m.a ? m.b : m.a;
    }
    return null;
  }
  const brut = (I, x) => (estTok(x) ? qualifie(I, x) : x);
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
  const allMatches = I => poulesOf(I).flatMap(po => po.matches).concat(tabsOf(I).flatMap(t => t.rounds.flat()));
  const findM = (I, id) => allMatches(I).find(m => m.id === id);
  const pouleDe = (I, m) => (m && m.poule != null ? poulesOf(I).find(po => po.k === m.poule) || null : null);
  const tabDe = (I, m) => (m.poule != null ? null : tabsOf(I).find(t => t.id === (m.t || '')) || tabsOf(I)[0]);
  /* les matchs dont les joueurs dépendent du résultat de m (tour suivant, qualifié, perdant reversé, poule) */
  function dependants(I, m) {
    const out = [], nx = suivant(I, m);
    if (nx) out.push(nx.m);
    const toks = m.poule != null ? null : ['L:' + m.id];
    tabsOf(I).forEach(U => U.lines.forEach((x, L) => {
      if ((toks && toks.includes(x)) || (m.poule != null && String(x).startsWith('P:' + m.poule + ':'))) out.push(U.rounds[0][L >> 1]);
    }));
    return out;
  }
  const bloque = (I, m) => dependants(I, m).some(d => d.w && !d.bye);
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
    if (String(tok || '').startsWith('L:')) return findM(I, tok.slice(2)) || null;
    if (!String(tok || '').startsWith('Q:')) return null;
    const [, tid, j] = tok.split(':'), U = tabsOf(I).find(x => x.id === tid);
    return U ? U.rounds[U.rounds.length - 1][+j] : null;
  }
  /* nom d'un tour : « Quarts de finale », « Tableau 1 · Tour 2 », « Poule B », « Places 5 à 8 · Finale »… */
  const tourNom = (r, nb) => TOURS[nb - 1 - r] || 'Tour ' + (r + 1);
  function nomTour(I, m) {
    const po = pouleDe(I, m); if (po) return po.nom;
    const T = tabDe(I, m), nb = T.rounds.length, plusieurs = tabsOf(I).length > 1 || poulesOf(I).length > 0;
    if (T.q === 1) return (plusieurs ? T.nom + ' · ' : '') + tourNom(m.r, nb);
    return T.nom + ' · ' + (m.r === nb - 1 ? 'Tour qualificatif' : 'Tour ' + (m.r + 1));
  }
  const finDe = (I, m) => { const po = pouleDe(I, m); if (po) return po.fin || ''; const T = tabDe(I, m); return ((T && T.tours) || [])[m.r] ? T.tours[m.r].fin || '' : ''; };
  const vainqueur = T => { if (!T) return null; const f = T.rounds[T.rounds.length - 1][0]; return f && f.w && f.conf && f.w !== 'BYE' ? f.w : null; };
  const champion = I => vainqueur(final(I));
  const joueur = (I, id) => I.players.find(p => p.id === id) || null;
  const ORD = r => (r === 1 ? '1er' : r + 'e');
  /* nom d'un participant, d'un exempt ou d'une place à venir (« Qualifié 2 du tableau 1 », « 1er de la poule A ») */
  function nomDe(I, id) {
    if (id === 'BYE') return 'Exempt';
    if (estTok(id)) {
      const q = qualifie(I, id); if (q) return nomDe(I, q);
      const [k, x, y] = id.split(':');
      if (k === 'P') { const po = poulesOf(I).find(u => u.k === +x); return ORD(+y) + ' de la ' + (po ? po.nom.toLowerCase() : 'poule'); }
      if (k === 'L') { const m = findM(I, x); return m && m.a && m.b ? 'Perdant de ' + nomDe(I, m.a) + ' – ' + nomDe(I, m.b) : 'Perdant d’un match du tour précédent'; }
      const T = tabsOf(I).find(u => u.id === x);
      return 'Qualifié ' + (+y + 1) + (T ? ' du ' + T.nom.toLowerCase() : '');
    }
    return (joueur(I, id) || {}).n || '';
  }
  const tsDe = (I, id) => { for (const T of tabsOf(I)) if (T.role !== 'class' && T.ts && T.ts[id]) return T.ts[id]; for (const po of poulesOf(I)) if (po.ts && po.ts[id]) return po.ts[id]; return 0; };
  /* classement final : vainqueur, finaliste, demi-finalistes… ; en TMC, tout le monde de 1 à n */
  function places(I) {
    if (I.mode === 'tmc' && tabsOf(I).some(t => t.role === 'class' || t.lo)) {
      const brut = [];
      tabsOf(I).forEach(T => {
        const f = T.rounds[T.rounds.length - 1][0];
        if (!f || !f.w || !f.conf) return;
        if (f.w !== 'BYE') brut.push({ p: T.lo, id: f.w });
        const lo = f.w === f.a ? f.b : f.a;
        if (!f.bye && lo && lo !== 'BYE') brut.push({ p: T.lo + 1, id: lo });
      });
      return brut.sort((a, b) => a.p - b.p).map((x, i) => ({ place: i + 1, id: x.id }));
    }
    const T = final(I); if (!T) return [];
    const out = [], nb = T.rounds.length, ch = champion(I);
    if (ch) out.push({ place: 1, id: ch });
    for (let r = nb - 1; r >= 0; r--) {
      const pl = Math.pow(2, nb - 1 - r) + 1;
      T.rounds[r].forEach(m => { if (m.w && m.conf && !m.bye) { const lo = m.w === m.a ? m.b : m.a; if (lo && lo !== 'BYE') out.push({ place: pl, lo: Math.min(pl * 2 - 2, Math.pow(2, nb)), id: lo }); } });
    }
    return out;
  }
  /* consolante : les battus de l'épreuve principale (un match perdu, joué ou par forfait), pas déjà dans la consolante */
  function consolables(I) {
    const battus = new Set();
    allMatches(I).forEach(m => {
      const T = m.poule != null ? null : tabDe(I, m);
      if (T && (T.role === 'consol' || T.role === 'class')) return;
      if (m.poule != null) return;   // une défaite en poule n'élimine pas
      if (m.w && m.conf && !m.bye) { const lo = m.w === m.a ? m.b : m.a; if (lo && lo !== 'BYE') battus.add(lo); }
    });
    return I.players.filter(p => battus.has(p.id));
  }

  /* ---------- programmation : jour, heure, terrain ; limites et repos (art. 13 et 14) ---------- */
  const minutes = h => { const x = String(h || '').match(/^(\d{1,2}):(\d{2})$/); return x ? +x[1] * 60 + +x[2] : null; };
  const debutMs = m => (m.d && minutes(m.h) != null ? Date.parse(m.d + 'T00:00:00Z') + minutes(m.h) * 60000 : null);
  const jourFr = d => { const x = new Date(d + 'T12:00:00Z'); return ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][x.getUTCDay()] + ' ' + d.split('-').reverse().slice(0, 2).join('/'); };
  const progNom = m => (m.d ? jourFr(m.d) + (m.h ? ' à ' + m.h.replace(':', 'h') : '') + (m.c ? ' · ' + m.c : '') : '');
  /* alertes sur le programme : [{ m, txt }] */
  function alertes(I) {
    const out = [], F = FORMATS[I.format] || { simples: 3, parties: 4, repos: 30, reposJ: 30, duree: 90 }, cat = I.categorie || 'seniors';
    const dur = F.duree * 60000, simple = I.simple;
    const repos = (simple ? (cat === 'seniors' ? F.repos : F.reposJ) : 30) * 60000;
    let maxJour = simple ? F.simples : F.parties;
    if (cat === 'plus50') maxJour = Math.min(maxJour, 2);   // art. 13-4
    const progs = allMatches(I).filter(m => debutMs(m) != null && !m.bye);
    progs.forEach(m => { if (minutes(m.h) < 7 * 60) out.push({ m: m.id, txt: `${progNom(m)} : aucune partie ne commence avant 7 heures (art. 14).` }); });
    // terrains : deux matchs en même temps sur le même terrain
    progs.forEach((m, i) => progs.slice(i + 1).forEach(n => {
      if (m.c && n.c && m.c === n.c && Math.abs(debutMs(m) - debutMs(n)) < dur) out.push({ m: n.id, txt: `${m.c} : deux matchs en même temps (${progNom(m)} et ${progNom(n)}).` });
    }));
    // chaque joueur : parties par jour, repos entre deux parties, 12 heures entre deux journées
    const parJoueur = {};
    progs.forEach(m => [m.a, m.b].forEach(x => { if (x && x !== 'BYE') (parJoueur[x] = parJoueur[x] || []).push(m); }));
    Object.keys(parJoueur).forEach(id => {
      const l = parJoueur[id].sort((a, b) => debutMs(a) - debutMs(b)), nm = nomDe(I, id), jours = {};
      l.forEach(m => { (jours[m.d] = jours[m.d] || []).push(m); });
      Object.keys(jours).forEach(d => { if (jours[d].length > maxJour) out.push({ m: jours[d][maxJour].id, txt: `${nm} : ${jours[d].length} matchs le ${jourFr(d)}, ${maxJour} au plus${FORMATS[I.format] ? ' au format ' + I.format : ''} (art. 13).` }); });
      for (let k = 1; k < l.length; k++) {
        const a = l[k - 1], b = l[k], ecart = debutMs(b) - (debutMs(a) + dur);
        if (a.d === b.d && ecart < repos) out.push({ m: b.id, txt: `${nm} : ${Math.max(0, Math.round(ecart / 60000))} min de repos entre ses matchs du ${jourFr(a.d)}, ${repos / 60000} min au moins (art. 14, match estimé à ${F.duree} min).` });
        else if (a.d !== b.d && ecart < 12 * 3600000) out.push({ m: b.id, txt: `${nm} : moins de 12 heures de repos entre le ${jourFr(a.d)} et le ${jourFr(b.d)} (art. 14).` });
      }
    });
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
          exige(!allMatches(I).some(m => m.w && !m.bye), 'Des résultats sont saisis : le format ne change plus.');
          const f = +p.format || 0;
          exige(f === 0 || FORMATS[f], 'Format inconnu.');
          exige(I.sport === 'Tennis' || f === 0, 'Les formats FFT concernent le tennis.');
          exige(I.simple || f === 0 || FORMATS[f].pd, 'En double, le point décisif est obligatoire (art. 11) : formats 3 à 7.');
          I.format = f;
        }
        if (p.mode != null && p.mode !== I.mode) {
          exige(!deja, 'Le tableau est tiré : annule le tirage pour changer de formule.');
          exige(['tableaux', 'poules', 'tmc'].includes(p.mode), 'Formule inconnue.');
          I.mode = p.mode;
        }
        if (p.pcfg != null) {
          exige(!deja, 'Le tableau est tiré : annule le tirage pour changer les poules.');
          const n = Math.floor(+p.pcfg.n || 0), q = Math.floor(+p.pcfg.q || 0), max = p.pcfg.max ? clNorm(p.pcfg.max) : '';
          exige(n >= 1 && n <= 26, 'De 1 à 26 poules.');
          exige(q >= 1 && q <= 3, 'De 1 à 3 qualifiés par poule.');
          I.pcfg = { n, q, max };
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
        if (p.prog != null) I.prog = !!p.prog;
        if (p.terrains != null) { exige(Array.isArray(p.terrains), 'Terrains illisibles.'); I.terrains = [...new Set(p.terrains.map(x => String(x || '').trim().slice(0, 30)).filter(Boolean))].slice(0, 30); }
        if (p.categorie != null) { exige(CATEGORIES[p.categorie], 'Catégorie inconnue.'); I.categorie = p.categorie; }
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
        if (p.poule != null) { const po = poulesOf(I).find(x => x.k === +p.poule); exige(po, 'Poule inconnue.'); po.fin = String(p.fin || '').slice(0, 10); return T; }
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
        I.tabs = []; I.poules = []; I.status = 'setup';
        return T;
      }
      /* consolante (art. 51-2) : le juge-arbitre y inscrit les battus qui ont accepté ; tableau établi selon leur classement */
      case 'int/consol': {
        exige(I.mode !== 'tmc', 'Pas de consolante dans un TMC (art. 51 bis).');
        exige(deja && !fini, 'Le tournoi doit être en cours.');
        const C = consolante(I);
        exige(!C || !C.rounds.flat().some(m => m.w && !m.bye), 'La consolante a commencé : elle ne se refait plus.');
        const ok = new Set(consolables(I).map(x => x.id)), ids = [...new Set((p.ids || []).map(String))];
        if (!ids.length) { I.tabs = I.tabs.filter(t => t.role !== 'consol'); return T; }
        exige(ids.length >= 2, 'Il faut au moins deux joueurs pour la consolante.');
        exige(ids.every(id => ok.has(id)), 'Seuls les joueurs battus dans l’épreuve principale entrent en consolante.');
        I.tabs = I.tabs.filter(t => t.role !== 'consol');
        I.tabs.push(construire({ id: 'c', nom: 'Consolante', q: 1, role: 'consol' }, ids.map(id => joueur(I, id)), [], rng(I.seed + 99991)));
        resolve(I);
        return T;
      }
      /* résultat : saisi par un joueur du match (à confirmer par l'adversaire) ou par le juge-arbitre (validé) */
      case 'int/result': {
        exige(!fini, 'Tournoi terminé.');
        const m = findM(I, p.m); exige(m, 'Match introuvable.');
        exige(m.a && m.b && m.a !== 'BYE' && m.b !== 'BYE', 'Ce match n’a pas encore ses deux joueurs.');
        exige(p.w === m.a || p.w === m.b, 'Le vainqueur doit être l’un des deux joueurs.');
        exige(!(m.w && bloque(I, m) && (m.w !== p.w || m.poule != null)), m.poule != null ? 'Le tableau final a commencé avec les qualifiés de cette poule.' : 'Le match suivant est déjà joué.');
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
        exige(!bloque(I, m), m.poule != null ? 'Le tableau final a commencé avec les qualifiés de cette poule : efface d’abord ses matchs.' : 'Le match suivant est déjà joué : efface-le d’abord.');
        ['w', 'sc', 'by', 'at', 'conf', 'wo', 'conteste'].forEach(k => delete m[k]);
        resolve(I);
        return T;
      }
      /* programmation d'un match : jour, heure, terrain (vide : déprogrammé) */
      case 'int/prog': {
        const m = findM(I, p.m); exige(m && !m.bye, 'Match introuvable.');
        const d = String(p.d || '').slice(0, 10);
        if (!d) { delete m.d; delete m.h; delete m.c; return T; }
        exige(/^\d{4}-\d{2}-\d{2}$/.test(d), 'Date illisible.');
        const h = String(p.h || '').slice(0, 5);
        exige(!h || minutes(h) != null, 'Heure illisible (hh:mm).');
        exige(!h || minutes(h) >= 7 * 60, 'Aucune partie ne peut commencer avant 7 heures (art. 14).');
        m.d = d; if (h) m.h = h; else delete m.h;
        const c = String(p.c || '').trim().slice(0, 30); if (c) m.c = c; else delete m.c;
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
    const reel = x => x && x !== 'BYE';
    // tirage des poules : chacun connaît ses adversaires de poule, en un seul message
    poulesOf(IB).forEach(po => {
      if (poulesOf(IA).some(x => x.id === po.id && x.joueurs.join() === po.joueurs.join())) return;
      po.joueurs.forEach(id => {
        const autres = po.joueurs.filter(x => x !== id).map(nm);
        out.push({ to: [id], body: `${po.nom} : tu rencontres ${autres.slice(0, -1).join(', ')}${autres.length > 1 ? ' et ' : ''}${autres.slice(-1)}. Contactez-vous pour organiser vos matchs${po.fin ? ' avant le ' + po.fin.split('-').reverse().slice(0, 2).join('/') : ''}.`, tag: 'poule-' + po.id });
      });
    });
    for (const m of allMatches(IB)) {
      const o = avantM(m.id) || {};
      // le match devient prêt : les deux joueurs connaissent leur adversaire (les matchs de poule sont annoncés en bloc)
      if (m.poule == null && reel(m.a) && reel(m.b) && !m.w && !(o.a === m.a && o.b === m.b)) {
        out.push({ to: [m.a], body: `${nomTour(IB, m)} : ton adversaire est ${nm(m.b)}. ${m.d ? 'Match programmé le ' + progNom(m) + '.' : 'Contactez-vous pour organiser le match' + fin(m) + '.'}`, tag: 'pret-' + m.id });
        out.push({ to: [m.b], body: `${nomTour(IB, m)} : ton adversaire est ${nm(m.a)}. ${m.d ? 'Match programmé le ' + progNom(m) + '.' : 'Contactez-vous pour organiser le match' + fin(m) + '.'}`, tag: 'pret-' + m.id });
        // le match d'après attend déjà un joueur : il sait que son adversaire sortira de ce match
        const nx = suivant(IB, m);
        if (nx) { const att = nx.side === 'a' ? nx.m.b : nx.m.a; if (reel(att)) out.push({ to: [att], body: `${nm(m.a)} et ${nm(m.b)} vont jouer : le gagnant sera ton adversaire (${nomTour(IB, nx.m).toLowerCase()}).`, tag: 'avant-' + nx.m.id }); }
      } else if (m.d && !m.w && (o.d !== m.d || o.h !== m.h || o.c !== m.c) && (o.a === m.a && o.b === m.b || m.poule != null)) {
        // programmé (ou reprogrammé) : les joueurs connus sont prévenus
        [m.a, m.b].filter(reel).forEach(x => { const adv = x === m.a ? m.b : m.a; out.push({ to: [x], body: `${nomTour(IB, m)} : ton match${reel(adv) ? ' contre ' + nm(adv) : ''} est programmé le ${progNom(m)}.`, tag: 'prog-' + m.id }); });
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
  /* rappels : matchs prêts dont la date limite approche (2 jours), une seule fois par match ; pas pour un match programmé */
  function aRelancer(T, auj = today()) {
    if (!isInterne(T) || !tire(T.int) || T.int.status !== 'live') return [];
    const I = T.int, lim = new Date(new Date(auj + 'T12:00').getTime() + 2 * 864e5).toISOString().slice(0, 10);
    return allMatches(I).filter(m => { const f = finDe(I, m); return etat(m) === 'ready' && !m.d && f && f <= lim && f >= auj && !(I.relances || {})[m.id]; });
  }
  return { initialState, reduce, isInterne, build, resolve, etat, allMatches, findM, suivant, avant, champion, places, nomDe, joueur, tourNom, nomTour, finDe, avis, aRelancer, seedOrder, placesTS,
    tabsOf, poulesOf, tire, tsDe, repartition, repartitionPoules, rang, clNorm, ECHELONS, FORMATS, CATEGORIES, formatNom, verifScore, norm,
    classementPoule, pouleFinie, consolables, consolante, vainqueur, final, alertes, progNom, jourFr, estTok };
});
