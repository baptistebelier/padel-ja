/* =========================================================================
   /RAM JA — Animations : americano, mexicano, americano par équipes, montée-descente
   Moteur partagé (serveur Node + navigateur), à côté du moteur des tournois FFT.
   - Americano : chaque manche, chacun change de partenaire et d'adversaires ; classement individuel.
   - Mexicano : les équipes de chaque manche suivent le classement (1 et 4 contre 2 et 3).
   - Americano par équipes : paires fixes qui se rencontrent toutes.
   - Montée-descente : terrains numérotés ; les gagnants montent, les perdants descendent.
   Les manches se jouent en points (« match en 24 points ») ou au temps (chronomètre commun).
   Tirages reproductibles (graine du tournoi) : le serveur et les écrans calculent la même chose.
   ========================================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ani = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMATS = {
    americano: { name: 'Americano', desc: 'Nouveau partenaire à chaque manche, classement individuel aux points.' },
    mexicano: { name: 'Mexicano', desc: 'Équipes formées selon le classement : 1 et 4 contre 2 et 3, des matchs serrés.' },
    equipes: { name: 'Americano par équipes', desc: 'Paires fixes qui se rencontrent toutes, classement par paire.' },
    montee: { name: 'Montée-descente', desc: 'Les gagnants montent d’un terrain, les perdants descendent. Le terrain 1 est celui du roi.' }
  };
  const POINTS = [16, 21, 24, 32];
  const MINUTES = [10, 12, 15, 20];

  /* hasard reproductible : même graine, même tirage, partout */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const shuffle = (l, r) => {
    const a = l.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const uid = p => p + Math.random().toString(36).slice(2, 9);
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function initialState(opts = {}) {
    const format = FORMATS[opts.format] ? opts.format : 'americano';
    return {
      version: 2,
      kind: 'animation',
      tournament: { name: opts.name || FORMATS[format].name, category: 'Animation', gender: FORMATS[format].name, dateStart: today(), dateEnd: today(), club: opts.club || '', startTime: '19:00', closed: false },
      courts: [{ id: 'c1', name: 'Terrain 1' }, { id: 'c2', name: 'Terrain 2' }],
      pairs: [], matches: [], poules: [], draw: null, order: null,
      ani: {
        format,
        scoring: { mode: 'points', points: 24, minutes: 15 },
        mixte: false,
        split: true,                       // montée-descente : partenaires séparés à chaque manche
        seed: Math.floor(Math.random() * 1e9),
        players: [],
        rounds: [],
        timer: { endsAt: null, minutes: 15 },
        status: 'setup'
      }
    };
  }

  /* ---------- historique : qui a joué avec / contre qui, qui s'est reposé ---------- */
  function history(A) {
    const partner = {}, opp = {}, rest = {}, played = {};
    const k = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    A.rounds.forEach(r => {
      (r.rest || []).forEach(p => { rest[p] = (rest[p] || 0) + 1; });
      r.matches.forEach(m => {
        [m.a, m.b].forEach(t => { t.forEach(p => { played[p] = (played[p] || 0) + 1; }); if (t.length === 2) partner[k(t[0], t[1])] = (partner[k(t[0], t[1])] || 0) + 1; });
        m.a.forEach(x => m.b.forEach(y => { opp[k(x, y)] = (opp[k(x, y)] || 0) + 1; }));
      });
    });
    return { pc: (a, b) => partner[k(a, b)] || 0, oc: (a, b) => opp[k(a, b)] || 0, rest: p => rest[p] || 0, played: p => played[p] || 0 };
  }
  const males = (A, ids) => ids.filter(id => (A.players.find(p => p.id === id) || {}).sex === 'H');
  const females = (A, ids) => ids.filter(id => (A.players.find(p => p.id === id) || {}).sex === 'F');

  /* qui se repose cette manche : ceux qui se sont le moins reposés (à égalité, au hasard) */
  function pickPlaying(A, ids, n, r, H) {
    if (ids.length <= n) return { play: ids.slice(), rest: [] };
    const order = shuffle(ids, r).sort((a, b) => H.rest(a) - H.rest(b));
    const rest = order.slice(0, ids.length - n);
    return { play: ids.filter(id => !rest.includes(id)), rest };
  }
  /* les trois façons de former deux équipes avec quatre joueurs */
  const SPLITS = g => [[[g[0], g[1]], [g[2], g[3]]], [[g[0], g[2]], [g[1], g[3]]], [[g[0], g[3]], [g[1], g[2]]]];
  const cost = (H, a, b) => 10 * (H.pc(a[0], a[1]) + H.pc(b[0], b[1])) + a.reduce((s, x) => s + b.reduce((t, y) => t + H.oc(x, y), 0), 0);

  /* americano : plusieurs essais de répartition, on garde celui qui répète le moins partenaires et adversaires */
  function americanoRound(A, courts, r) {
    const H = history(A), ids = A.players.filter(p => !p.out).map(p => p.id);
    const n = Math.min(courts, Math.floor(ids.length / 4)) * 4;
    if (n < 4) throw new Error('Il faut au moins 4 joueurs.');
    let pr, mixte = A.mixte;
    if (mixte) {
      const M = males(A, ids), F = females(A, ids), per = Math.min(courts, Math.floor(Math.min(M.length, F.length) / 2));
      if (per < 1) throw new Error('Americano mixte : il faut au moins 2 hommes et 2 femmes.');
      const pm = pickPlaying(A, M, per * 2, r, H), pf = pickPlaying(A, F, per * 2, r, H);
      pr = { play: pm.play.concat(pf.play), rest: pm.rest.concat(pf.rest), M: pm.play, F: pf.play };
    } else pr = pickPlaying(A, ids, n, r, H);
    let best = null;
    for (let t = 0; t < 300; t++) {
      let groups;
      if (mixte) {
        const m = shuffle(pr.M, r), f = shuffle(pr.F, r);
        groups = [];
        for (let i = 0; i < m.length / 2; i++) groups.push([m[2 * i], f[2 * i], m[2 * i + 1], f[2 * i + 1]]);
      } else {
        const s = shuffle(pr.play, r);
        groups = [];
        for (let i = 0; i < s.length; i += 4) groups.push(s.slice(i, i + 4));
      }
      let total = 0;
      const ms = groups.map(g => {
        // mixte : chaque équipe est un homme et une femme (g = h1, f1, h2, f2)
        const opts = mixte ? [[[g[0], g[1]], [g[2], g[3]]], [[g[0], g[3]], [g[2], g[1]]]] : SPLITS(g);
        let b = null;
        opts.forEach(([a, c]) => { const v = cost(H, a, c); if (!b || v < b.v) b = { a, b: c, v }; });
        total += b.v;
        return b;
      });
      if (!best || total < best.total) best = { total, ms };
      if (total === 0) break;
    }
    return { matches: best.ms.map(x => ({ a: x.a, b: x.b })), rest: pr.rest };
  }

  /* mexicano : 1re manche au hasard, ensuite par le classement (1 et 4 contre 2 et 3, puis 5 et 8 contre 6 et 7…) */
  function mexicanoRound(A, courts, r) {
    if (!A.rounds.length) return americanoRound(A, courts, r);
    const H = history(A), ids = A.players.filter(p => !p.out).map(p => p.id);
    const n = Math.min(courts, Math.floor(ids.length / 4)) * 4;
    const pr = pickPlaying(A, ids, n, r, H);
    const rank = standings({ ani: A }).rows.map(x => x.id);
    const play = pr.play.slice().sort((a, b) => rank.indexOf(a) - rank.indexOf(b)), matches = [];
    for (let i = 0; i < play.length; i += 4) { const g = play.slice(i, i + 4); matches.push({ a: [g[0], g[3]], b: [g[1], g[2]] }); }
    return { matches, rest: pr.rest };
  }

  /* americano par équipes : paires fixes (joueurs 1 et 2, 3 et 4…), toutes contre toutes (méthode du cercle) */
  function teamsOf(A) {
    const ids = A.players.filter(p => !p.out).map(p => p.id), t = [];
    for (let i = 0; i + 1 < ids.length; i += 2) t.push([ids[i], ids[i + 1]]);
    return t;
  }
  function equipesRound(A, courts) {
    const T = teamsOf(A);
    if (T.length < 2) throw new Error('Il faut au moins 2 paires (4 joueurs).');
    const list = T.length % 2 ? T.concat([null]) : T.slice(), n = list.length, rd = A.rounds.length % (n - 1);
    const rot = [list[0]].concat(list.slice(1).slice(-rd).concat(list.slice(1).slice(0, n - 1 - rd)));
    const pairs = [];
    for (let i = 0; i < n / 2; i++) { const x = rot[i], y = rot[n - 1 - i]; if (x && y) pairs.push([x, y]); }
    // plus de rencontres que de terrains : jouent d'abord les paires qui ont le moins joué
    const H = history(A);
    pairs.sort((p, q) => (H.played(p[0][0]) + H.played(p[1][0])) - (H.played(q[0][0]) + H.played(q[1][0])));
    const on = pairs.slice(0, courts), resting = [];
    pairs.slice(courts).forEach(([x, y]) => resting.push(...x, ...y));
    T.forEach(t => { if (!on.some(([x, y]) => x === t || y === t) && !resting.includes(t[0])) resting.push(...t); });
    return { matches: on.map(([x, y]) => ({ a: x, b: y })), rest: resting };
  }

  /* montée-descente : 4 joueurs par terrain ; gagnants montent, perdants descendent */
  function monteeRound(A, courts, r) {
    const ids = A.players.filter(p => !p.out).map(p => p.id), C = Math.floor(ids.length / 4);
    if (ids.length % 4 || C < 1) throw new Error('Montée-descente : il faut un nombre de joueurs multiple de 4 (4 par terrain).');
    if (C > courts) throw new Error(`Montée-descente : ${ids.length} joueurs demandent ${C} terrains.`);
    const last = A.rounds[A.rounds.length - 1];
    let byCourt;
    if (!last) {
      // 1re manche : au hasard (ou par niveau si renseigné : les meilleurs en haut)
      const lv = id => +((A.players.find(p => p.id === id) || {}).lvl || 0);
      const s = shuffle(ids, r).sort((a, b) => lv(b) - lv(a));
      byCourt = Array.from({ length: C }, (_, i) => s.slice(i * 4, i * 4 + 4));
    } else {
      const W = [], L = [];
      last.matches.forEach((m, i) => { const aw = m.sa > m.sb; W[i] = aw ? m.a : m.b; L[i] = aw ? m.b : m.a; });
      byCourt = [];
      for (let i = 0; i < C; i++) {
        if (C === 1) byCourt.push(W[0].concat(L[0]));
        else if (i === 0) byCourt.push(W[0].concat(W[1]));
        else if (i === C - 1) byCourt.push(L[C - 2].concat(L[C - 1]));
        else byCourt.push(L[i - 1].concat(W[i + 1]));
      }
    }
    const matches = byCourt.map((g, i) => {
      if (!last || !A.split) return { a: [g[0], g[1]], b: [g[2], g[3]] };
      // partenaires séparés : chacun joue avec un joueur arrivé de l'autre paire
      return { a: [g[0], g[2]], b: [g[1], g[3]] };
    });
    return { matches, rest: [] };
  }

  function nextRound(T) {
    const A = T.ani, courts = T.courts.length;
    const last = A.rounds[A.rounds.length - 1];
    if (last && last.matches.some(m => !m.done)) throw new Error('Saisissez tous les scores de la manche avant la suivante.');
    const r = rng(A.seed + A.rounds.length * 7919);
    const g = A.format === 'mexicano' ? mexicanoRound(A, courts, r) : A.format === 'equipes' ? equipesRound(A, courts) : A.format === 'montee' ? monteeRound(A, courts, r) : americanoRound(A, courts, r);
    const n = A.rounds.length + 1;
    A.rounds.push({ n, matches: g.matches.map((m, i) => ({ id: 'r' + n + 'm' + (i + 1), court: i, a: m.a, b: m.b, sa: null, sb: null, done: false })), rest: g.rest, at: Date.now() });
    A.status = 'play';
    A.timer.endsAt = null;
  }

  /* ---------- classements ---------- */
  function standings(T) {
    const A = T.ani, done = A.rounds.flatMap(r => r.matches.filter(m => m.done));
    if (A.format === 'equipes') {
      const rows = teamsOf(A).map(t => ({ id: t.join('+'), ids: t, played: 0, won: 0, drawn: 0, pf: 0, pa: 0 }));
      done.forEach(m => [[m.a, m.sa, m.sb], [m.b, m.sb, m.sa]].forEach(([t, f, a]) => {
        const row = rows.find(x => x.id === t.join('+')); if (!row) return;
        row.played++; row.pf += f; row.pa += a; if (f > a) row.won++; else if (f === a) row.drawn++;
      }));
      rows.sort((x, y) => y.pf - x.pf || y.won - x.won || (y.pf - y.pa) - (x.pf - x.pa));
      return { team: true, rows };
    }
    const rows = A.players.map(p => ({ id: p.id, ids: [p.id], played: 0, won: 0, drawn: 0, pf: 0, pa: 0, rest: 0, court: null }));
    const get = id => rows.find(x => x.id === id);
    A.rounds.forEach(r => (r.rest || []).forEach(id => { const x = get(id); if (x) x.rest++; }));
    done.forEach(m => [[m.a, m.sa, m.sb], [m.b, m.sb, m.sa]].forEach(([t, f, a]) => t.forEach(id => {
      const x = get(id); if (!x) return;
      x.played++; x.pf += f; x.pa += a; if (f > a) x.won++; else if (f === a) x.drawn++;
    })));
    if (A.format === 'montee') {
      // position : terrain de la dernière manche jouée (gagnants devant), puis manches gagnées et points
      const last = [...A.rounds].reverse().find(r => r.matches.every(m => m.done));
      if (last) last.matches.forEach(m => {
        const aw = m.sa > m.sb;
        (aw ? m.a : m.b).forEach(id => { get(id).court = m.court * 2; });
        (aw ? m.b : m.a).forEach(id => { get(id).court = m.court * 2 + 1; });
      });
      rows.sort((x, y) => (x.court == null ? 99 : x.court) - (y.court == null ? 99 : y.court) || y.won - x.won || y.pf - x.pf);
      return { montee: true, rows };
    }
    rows.sort((x, y) => y.pf - x.pf || y.won - x.won || (y.pf - y.pa) - (x.pf - x.pa));
    return { rows };
  }

  /* ---------- réducteur ---------- */
  function find(A, rid, mid) {
    const r = A.rounds.find(x => x.n === +rid) || A.rounds[A.rounds.length - 1];
    const m = r && r.matches.find(x => x.id === mid);
    if (!m) throw new Error('Match introuvable');
    return { r, m };
  }
  function reduce(T, action) {
    const A = T.ani, p = action.payload || {};
    if (!A) throw new Error('Ce tournoi n’est pas une animation.');
    const started = A.rounds.length > 0;
    switch (action.type) {
      case 'ani/setup': {
        if (p.name != null) T.tournament.name = String(p.name).slice(0, 80);
        if (p.club != null) T.tournament.club = String(p.club).slice(0, 80);
        if (p.date) T.tournament.dateStart = T.tournament.dateEnd = String(p.date).slice(0, 10);
        if (p.format && FORMATS[p.format]) { if (started) throw new Error('Le format ne change plus une fois l’animation lancée.'); A.format = p.format; T.tournament.gender = FORMATS[p.format].name; }
        if (p.scoring) {
          const s = p.scoring;
          if (s.mode === 'points' || s.mode === 'temps') A.scoring.mode = s.mode;
          if (+s.points >= 4 && +s.points <= 99) A.scoring.points = +s.points;
          if (+s.minutes >= 1 && +s.minutes <= 90) A.scoring.minutes = A.timer.minutes = +s.minutes;
        }
        if (p.mixte != null) A.mixte = !!p.mixte;
        if (p.split != null) A.split = !!p.split;
        if (p.courts != null) {
          const n = Math.max(1, Math.min(16, +p.courts || 1));
          while (T.courts.length < n) T.courts.push({ id: 'c' + (T.courts.length + 1), name: 'Terrain ' + (T.courts.length + 1) });
          T.courts.length = n;
        }
        return T;
      }
      case 'ani/player/add': {
        const name = String(p.name || '').trim().slice(0, 60);
        if (!name) throw new Error('Nom du joueur manquant');
        if (A.players.length >= 64) throw new Error('64 joueurs au plus.');
        if (A.format === 'montee' && started) throw new Error('Montée-descente : les joueurs ne changent plus une fois lancée.');
        A.players.push({ id: p.id || uid('j'), name, sex: p.sex === 'F' ? 'F' : p.sex === 'H' ? 'H' : '', lvl: p.lvl != null && p.lvl !== '' ? +p.lvl : '', playerId: p.playerId || '' });
        return T;
      }
      case 'ani/player/update': {
        const x = A.players.find(y => y.id === p.id); if (!x) throw new Error('Joueur introuvable');
        if (p.name != null) x.name = String(p.name).trim().slice(0, 60) || x.name;
        if (p.sex != null) x.sex = p.sex === 'F' ? 'F' : p.sex === 'H' ? 'H' : '';
        if (p.lvl != null) x.lvl = p.lvl === '' ? '' : +p.lvl;
        if (p.out != null) x.out = !!p.out;     // absent (ne joue plus les manches suivantes)
        return T;
      }
      case 'ani/player/remove': {
        if (started) throw new Error('Une fois l’animation lancée, marquez le joueur absent plutôt que de le retirer.');
        A.players = A.players.filter(y => y.id !== p.id);
        return T;
      }
      case 'ani/player/move': {   // ordre des joueurs (forme les paires de l'americano par équipes)
        const i = A.players.findIndex(y => y.id === p.id), j = i + (p.dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= A.players.length || started) return T;
        [A.players[i], A.players[j]] = [A.players[j], A.players[i]];
        return T;
      }
      case 'ani/round/next': nextRound(T); return T;
      case 'ani/round/cancel': {
        const r = A.rounds[A.rounds.length - 1];
        if (!r) return T;
        if (r.matches.some(m => m.done)) throw new Error('Des scores sont déjà saisis dans cette manche.');
        A.rounds.pop();
        A.status = A.rounds.length ? 'play' : 'setup';
        return T;
      }
      case 'ani/score': {
        const { m } = find(A, p.round, p.match);
        if (A.status === 'done') throw new Error('Animation terminée : rouvrez-la pour corriger un score.');
        if (p.clear) { m.sa = m.sb = null; m.done = false; return T; }
        const sa = Math.round(+p.sa), sb = Math.round(+p.sb);
        if (!(sa >= 0 && sb >= 0 && sa <= 99 && sb <= 99)) throw new Error('Score invalide');
        if (A.scoring.mode === 'points' && A.format !== 'montee' && sa + sb !== A.scoring.points) throw new Error(`Match en ${A.scoring.points} points : le total doit faire ${A.scoring.points}.`);
        if (A.format === 'montee' && sa === sb) throw new Error('Montée-descente : il faut un gagnant (pas d’égalité).');
        m.sa = sa; m.sb = sb; m.done = true;
        return T;
      }
      case 'ani/timer/start': {
        const min = +p.minutes || A.timer.minutes || A.scoring.minutes;
        A.timer.endsAt = Date.now() + min * 60000;
        A.timer.minutes = min;
        return T;
      }
      case 'ani/timer/stop': A.timer.endsAt = null; return T;
      case 'ani/finish': {
        const r = A.rounds[A.rounds.length - 1];
        if (r && !r.matches.some(m => m.done)) A.rounds.pop();   // manche lancée mais pas jouée : retirée
        else if (r && r.matches.some(m => !m.done)) throw new Error('Saisissez les scores de la dernière manche (ou annulez-la) avant de terminer.');
        A.status = 'done'; A.timer.endsAt = null;
        T.tournament.closed = true; T.tournament.closedAt = Date.now();
        return T;
      }
      case 'ani/reopen': A.status = A.rounds.length ? 'play' : 'setup'; T.tournament.closed = false; T.tournament.closedAt = null; return T;
      case 'tournament/setClosed': T.tournament.closed = !!p.closed; T.tournament.closedAt = p.closed ? Date.now() : null; A.status = p.closed ? 'done' : (A.rounds.length ? 'play' : 'setup'); return T;
      case 'noop': return T;
    }
    throw new Error('Action inconnue : ' + action.type);
  }
  const isAnimation = T => !!(T && T.kind === 'animation' && T.ani);

  return { FORMATS, POINTS, MINUTES, initialState, reduce, standings, nextRound, teamsOf, isAnimation, history };
});
