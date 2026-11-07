/* =========================================================================
   /RAM JA — Tournoi interne d'un club (tennis ou padel, simple ou double)
   Moteur partagé (serveur Node + navigateur), à côté des tournois FFT et des animations.
   - Le juge-arbitre crée le tournoi dans /RAM JA : règlement, participants (adhérents du club),
     têtes de série, date limite de chaque tour, tirage du tableau à élimination directe.
   - Les joueurs organisent eux-mêmes leurs matchs sur plusieurs semaines : le gagnant saisit le
     résultat dans /RAM Club, l'adversaire le confirme (ou le conteste : le juge-arbitre tranche).
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

  function initialState(opts = {}) {
    return {
      version: 1,
      kind: 'interne',
      tournament: { name: String(opts.name || 'Tournoi interne').slice(0, 80), category: 'Tournoi interne', gender: '', dateStart: today(), dateEnd: '', club: opts.club || '', closed: false, regMode: '' },
      courts: [], pairs: [], matches: [], poules: [], draw: null, order: null,
      int: { sport: opts.sport === 'Padel' ? 'Padel' : 'Tennis', simple: opts.sport !== 'Padel', regle: '', players: [], tours: [], bracket: null, status: 'setup', seed: Math.floor(Math.random() * 1e9), relances: {} }
    };
  }

  /* tirage reproductible : graine du tournoi */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* ordre des lignes du tableau : la tête de série 1 en haut, la 2 en bas, puis 3 et 4… (les exemptés face aux têtes de série) */
  function seedOrder(n) {
    let a = [1];
    while (a.length < n) { const m = a.length * 2 + 1, b = []; a.forEach(s => b.push(s, m - s)); a = b; }
    return a;
  }
  const tourNom = (r, nb) => TOURS[nb - 1 - r] || 'Tour ' + (r + 1);

  /* construire le tableau : taille en puissance de 2, têtes de série placées, les autres tirés au sort */
  function build(I) {
    const P = I.players;
    if (P.length < 2) throw new Error('Il faut au moins deux participants.');
    let size = 2; while (size < P.length) size *= 2;
    const R = rng(I.seed), seeded = P.filter(p => +p.seed > 0).sort((a, b) => a.seed - b.seed), rest = P.filter(p => !(+p.seed > 0));
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const ordre = seeded.concat(rest), lines = new Array(size).fill('BYE');
    seedOrder(size).forEach((s, line) => { if (ordre[s - 1]) lines[line] = ordre[s - 1].id; });
    const nb = Math.log2(size), rounds = [];
    for (let r = 0; r < nb; r++) {
      const n = size / Math.pow(2, r + 1), l = [];
      for (let i = 0; i < n; i++) l.push({ id: 'r' + r + 'm' + i, r, i, a: r ? null : lines[2 * i], b: r ? null : lines[2 * i + 1] });
      rounds.push(l);
    }
    I.bracket = { size, rounds };
    I.tours = Array.from({ length: nb }, (_, r) => I.tours[r] || { fin: '' });
    resolve(I);
  }
  /* faire avancer les gagnants (et les exemptés) dans le tableau */
  function resolve(I) {
    const B = I.bracket; if (!B) return;
    B.rounds.forEach((l, r) => l.forEach(m => {
      if (r) {
        const f1 = B.rounds[r - 1][2 * m.i], f2 = B.rounds[r - 1][2 * m.i + 1];
        const a = (f1.w && f1.conf && f1.w) || null, b = (f2.w && f2.conf && f2.w) || null;   // un résultat compte une fois confirmé
        if (m.a !== a || m.b !== b) { if (m.w && m.w !== a && m.w !== b) { delete m.w; delete m.sc; delete m.conf; delete m.by; delete m.wo; delete m.conteste; } m.a = a; m.b = b; }
      }
      if (m.a === 'BYE' && m.b && m.b !== 'BYE') { m.w = m.b; m.bye = true; m.conf = true; }
      else if (m.b === 'BYE' && m.a && m.a !== 'BYE') { m.w = m.a; m.bye = true; m.conf = true; }
      else if (m.a === 'BYE' && m.b === 'BYE') { m.w = 'BYE'; m.bye = true; m.conf = true; }
    }));
  }
  const etat = m => (m.w ? (m.conf ? 'done' : 'pending') : m.a && m.b ? 'ready' : 'wait');
  const allMatches = I => (I.bracket ? I.bracket.rounds.flat() : []);
  const findM = (I, id) => allMatches(I).find(m => m.id === id);
  /* le match suivant d'un match, et de quel côté son gagnant y joue */
  function suivant(I, m) {
    const B = I.bracket; if (!B || m.r >= B.rounds.length - 1) return null;
    return { m: B.rounds[m.r + 1][Math.floor(m.i / 2)], side: m.i % 2 ? 'b' : 'a' };
  }
  /* le match qui donnera l'adversaire d'un joueur déjà qualifié pour m */
  function avant(I, m, side) {
    const B = I.bracket; if (!B || !m.r) return null;
    return B.rounds[m.r - 1][2 * m.i + (side === 'a' ? 0 : 1)];
  }
  const champion = I => { const B = I.bracket; if (!B) return null; const f = B.rounds[B.rounds.length - 1][0]; return f.w && f.conf && f.w !== 'BYE' ? f.w : null; };
  const joueur = (I, id) => I.players.find(p => p.id === id) || null;
  const nomDe = (I, id) => (id === 'BYE' ? 'Exempt' : (joueur(I, id) || {}).n || '');
  /* classement final : vainqueur, finaliste, demi-finalistes… */
  function places(I) {
    const B = I.bracket; if (!B) return [];
    const out = [], nb = B.rounds.length, ch = champion(I);
    if (ch) out.push({ place: 1, id: ch });
    for (let r = nb - 1; r >= 0; r--) {
      const pl = Math.pow(2, nb - 1 - r) + 1;
      B.rounds[r].forEach(m => { if (m.w && m.conf && !m.bye) { const lo = m.w === m.a ? m.b : m.a; if (lo && lo !== 'BYE') out.push({ place: pl, lo: Math.min(pl * 2 - 2, Math.pow(2, nb)), id: lo }); } });
    }
    return out;
  }

  function reduce(T, action) {
    const I = T.int, p = action.payload || {};
    if (!I) throw new Error('Ce tournoi n’est pas un tournoi interne.');
    const tire = !!I.bracket, fini = I.status === 'done';
    const exige = (ok, msg) => { if (!ok) throw new Error(msg); };
    switch (action.type) {
      case 'int/setup': {
        if (p.name != null) T.tournament.name = String(p.name).slice(0, 80) || 'Tournoi interne';
        if (p.club != null) T.tournament.club = String(p.club).slice(0, 80);
        if (p.dateStart != null) T.tournament.dateStart = String(p.dateStart).slice(0, 10);
        if (p.dateEnd != null) T.tournament.dateEnd = String(p.dateEnd).slice(0, 10);
        if (p.regle != null) I.regle = String(p.regle).slice(0, 8000);
        if (p.regMode != null) T.tournament.regMode = ['none'].includes(p.regMode) ? p.regMode : '';
        if (p.sport != null) { exige(!tire, 'Le sport ne change plus après le tirage.'); I.sport = p.sport === 'Padel' ? 'Padel' : 'Tennis'; }
        if (p.simple != null) { exige(!tire, 'Simple ou double ne change plus après le tirage.'); I.simple = !!p.simple; }
        return T;
      }
      case 'int/player/add': {
        exige(!tire, 'Le tableau est tiré : retire le tirage pour changer les participants.');
        exige(I.players.length < 128, '128 participants au plus.');
        const n = String(p.n || '').trim().slice(0, 80); exige(n, 'Le nom du participant manque.');
        const ks = (Array.isArray(p.ks) ? p.ks : [p.k]).filter(Boolean).map(String).slice(0, 2);
        exige(!ks.some(k => I.players.some(x => (x.ks || []).includes(k))), 'Cet adhérent participe déjà.');
        I.players.push({ id: 'j' + (I.players.length ? Math.max(...I.players.map(x => +String(x.id).slice(1) || 0)) + 1 : 1), n, ks });
        return T;
      }
      case 'int/player/remove': exige(!tire, 'Le tableau est tiré.'); I.players = I.players.filter(x => x.id !== p.id); return T;
      case 'int/player/seed': {
        exige(!tire, 'Le tableau est tiré.');
        const x = joueur(I, p.id); exige(x, 'Participant introuvable.');
        const s = +p.seed || 0; if (s) I.players.forEach(y => { if (y !== x && +y.seed === s) delete y.seed; });
        if (s > 0 && s <= 32) x.seed = s; else delete x.seed;
        return T;
      }
      case 'int/tour': {
        exige(I.bracket && I.tours[p.r], 'Tour inconnu.');
        I.tours[p.r].fin = String(p.fin || '').slice(0, 10);
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
        I.bracket = null; I.status = 'setup';
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
        Object.assign(m, { w: p.w, sc: String(p.sc || '').slice(0, 60), by: p.by || 'ja', at: Date.now(), conf: ja || !!p.wo });
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
      case 'int/reopen': case 'tournament/setClosed': { if (action.type === 'tournament/setClosed' && p.closed) { I.status = 'done'; T.tournament.closed = true; return T; } I.status = I.bracket ? 'live' : 'setup'; T.tournament.closed = false; return T; }
      case 'noop': return T;
    }
    throw new Error('Action inconnue : ' + action.type);
  }

  /* ce qui doit être annoncé entre deux états : [{ to: [ids des participants], body, tag, ja? }] */
  function avis(A, B) {
    const out = [];
    if (!A || !B || !isInterne(A) || !isInterne(B) || !B.int.bracket) return out;
    const IA = A.int, IB = B.int, nm = id => nomDe(IB, id), nb = IB.bracket.rounds.length;
    const avantM = id => (IA.bracket ? findM(IA, id) : null);
    const fin = m => { const f = (IB.tours[m.r] || {}).fin; return f ? ' avant le ' + f.split('-').reverse().slice(0, 2).join('/') : ''; };
    for (const m of allMatches(IB)) {
      const o = avantM(m.id) || {};
      const reel = x => x && x !== 'BYE';
      // le match devient prêt : les deux joueurs connaissent leur adversaire
      if (reel(m.a) && reel(m.b) && !m.w && !(o.a === m.a && o.b === m.b)) {
        out.push({ to: [m.a], body: `${tourNom(m.r, nb)} : ton adversaire est ${nm(m.b)}. Contactez-vous pour organiser le match${fin(m)}.`, tag: 'pret-' + m.id });
        out.push({ to: [m.b], body: `${tourNom(m.r, nb)} : ton adversaire est ${nm(m.a)}. Contactez-vous pour organiser le match${fin(m)}.`, tag: 'pret-' + m.id });
        // le match d'après attend déjà un joueur : il sait que son adversaire sortira de ce match
        const nx = suivant(IB, m);
        if (nx) { const att = nx.side === 'a' ? nx.m.b : nx.m.a; if (reel(att)) out.push({ to: [att], body: `${nm(m.a)} et ${nm(m.b)} vont jouer : le gagnant sera ton adversaire (${tourNom(nx.m.r, nb).toLowerCase()}).`, tag: 'avant-' + nx.m.id }); }
      }
      // résultat saisi par un joueur : l'adversaire confirme
      if (m.w && !m.conf && m.by && m.by !== 'ja' && !(o.w === m.w && o.at === m.at)) {
        const adv = m.by === m.a ? m.b : m.a;
        out.push({ to: [adv], body: `${nm(m.by)} a saisi le résultat de votre match : ${m.w === m.by ? 'victoire de ' + nm(m.by) : 'ta victoire'}${m.sc ? ' (' + m.sc + ')' : ''}. Confirme-le dans l’appli.`, tag: 'conf-' + m.id });
      }
      // contestation : le juge-arbitre tranche
      if (m.conteste && !o.conteste) out.push({ to: [], ja: true, body: `Résultat contesté (${tourNom(m.r, nb).toLowerCase()}) : ${nm(m.a)} contre ${nm(m.b)}. À trancher dans /RAM JA.`, tag: 'contest-' + m.id });
    }
    // vainqueur du tournoi
    const ch = champion(IB);
    if (ch && ch !== champion(IA)) out.push({ to: IB.players.map(p => p.id), body: `${nm(ch)} remporte ${B.tournament.name || 'le tournoi interne'} !`, tag: 'champion' });
    return out;
  }
  /* rappels : matchs prêts dont la date limite approche (2 jours), une seule fois par match */
  function aRelancer(T, auj = today()) {
    if (!isInterne(T) || !T.int.bracket || T.int.status !== 'live') return [];
    const I = T.int, lim = new Date(new Date(auj + 'T12:00').getTime() + 2 * 864e5).toISOString().slice(0, 10);
    return allMatches(I).filter(m => etat(m) === 'ready' && (I.tours[m.r] || {}).fin && I.tours[m.r].fin <= lim && I.tours[m.r].fin >= auj && !(I.relances || {})[m.id]);
  }
  return { initialState, reduce, isInterne, build, resolve, etat, allMatches, findM, suivant, avant, champion, places, nomDe, joueur, tourNom, avis, aRelancer, seedOrder };
});
