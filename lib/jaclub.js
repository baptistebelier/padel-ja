/* =========================================================================
   /RAM — pont entre /RAM JA et /RAM Club pour les tournois et animations
   - Publication : un tournoi (ou une animation) dont le club a un espace /RAM Club y est publié
     automatiquement (mur et agenda), puis tenu à jour : inscrits, tirage, en cours, résultats.
     Le juge-arbitre choisit : publier ou non, inscriptions dans l'appli ou ailleurs (où).
   - Inscriptions depuis /RAM Club : l'adhérent choisit son partenaire (adhérent du club ou non) ;
     la paire est ajoutée au tournoi comme si le juge-arbitre l'avait saisie (marquée « src »).
   - Résultats : à la clôture, podium et place de chaque adhérent dans la publication.
   ========================================================================= */
'use strict';
const Int = require('../public/js/interne.js');

const postId = tid => 'ja-' + String(tid).replace(/[^\w-]/g, '').slice(0, 40);
const pname = p => (p ? [String(p.first || '').trim(), String(p.last || '').trim().toUpperCase()].filter(Boolean).join(' ') : '');

/* ce que le juge-arbitre reçoit quand un adhérent s'inscrit ou se retire depuis /RAM Club */
function avisInscription(tid, t, quoi, noms, n, max) {
  const body = `${noms} ${quoi === 'in' ? "s'inscrit" : 'se retire'} : ${t.name || 'tournoi'}${quoi === 'in' && max && n >= max ? ` · complet (${n}/${max})` : ''}`;
  return { title: '/RAM JA', body, url: '/t/' + tid, tag: 'ja-ins-' + tid, app: 'ja' };
}
function createJaClub({ store, ram, clubs, Engine, Ani, getRoom, applyServerAction, push }) {
  const aviser = (room, user, tid, quoi, noms) => {
    const T = room.row.state, t = T.tournament || {}, owner = room.row.owner;
    if (!push || !owner || owner === user.id) return;
    const ani = Ani.isAnimation(T), n = ani ? T.ani.players.length : T.pairs.filter(p => !p.withdrawn).length;
    Promise.resolve(push.sendMany([owner], avisInscription(tid, t, quoi, noms, n, ani ? 0 : +t.maxPairs || 0))).catch(() => {});
  };
  const timers = new Map(), lastSpace = new Map();

  /* espace /RAM Club du club du tournoi (null si le club n'en a pas) */
  async function spaceOf(T) {
    await clubs.load();
    const c = clubs.lookup((T.tournament || {}).club);
    if (!c) return null;
    const sp = (await ram.spaces()).find(s => s.club_id === c.id);
    return sp ? sp.id : null;
  }
  const regOf = t => ({ mode: t.regMode === 'ext' ? 'ext' : 'app', where: String(t.regWhere || '').slice(0, 160) });
  const published = t => t.regMode !== 'none';

  /* tournoi interne : tout le tableau, le règlement et les participants (reliés à leur fiche du club) */
  function postInterne(row) {
    const T = row.state, t = T.tournament || {}, I = T.int;
    const champ = Int.champion(I);
    return {
      by: 'club', kind: 'jaint', at: row.created_at || Date.now(),
      title: t.name || 'Tournoi interne', d: t.dateStart || '', d2: t.dateEnd && t.dateStart && t.dateEnd > t.dateStart ? t.dateEnd : undefined,
      place: t.club || '', sport: I.sport,
      ja: {
        tid: row.id, sport: I.sport, simple: I.simple, regle: I.regle || '', status: I.status, jaName: t.ja || '',
        players: I.players.map(p => ({ id: p.id, n: p.n, ks: p.ks || [], seed: p.seed || undefined })),
        tours: I.tours,
        rounds: I.bracket ? I.bracket.rounds.map(l => l.map(m => ({ id: m.id, r: m.r, i: m.i, a: m.a || null, b: m.b || null, w: m.w || null, sc: m.sc || '', conf: !!m.conf, by: m.by || null, bye: !!m.bye, wo: !!m.wo, conteste: m.conteste || null }))) : [],
        champion: champ, places: Int.places(I).slice(0, 8)
      }
    };
  }
  /* notifications du tournoi interne : aux participants (par leur compte dans le club), au juge-arbitre pour une contestation */
  const derniers = new Map();
  async function avisInterne(room, sp) {
    const T = room.row.state, prev = derniers.get(room.row.id);
    derniers.set(room.row.id, JSON.parse(JSON.stringify(T)));
    if (!prev || !push) return;
    const l = Int.avis(prev, T);
    if (!l.length) return;
    const g = await ram.groupsOf(sp).catch(() => null), users = (g && g.users) || {};
    const uidOf = pid => ((Int.joueur(T.int, pid) || {}).ks || []).map(k => users[k]).filter(Boolean);
    const titre = (T.tournament || {}).name || 'Tournoi interne';
    for (const a of l) {
      const uids = a.ja ? [room.row.owner] : [...new Set(a.to.flatMap(uidOf))];
      if (!uids.length) continue;
      const msg = a.ja
        ? { title: '/RAM JA', body: a.body, url: '/t/' + room.row.id, tag: 'jaint-' + room.row.id + '-' + a.tag, app: 'ja' }
        : { title: titre, body: a.body, url: '#/post/' + postId(room.row.id) + '?club=' + sp, tag: 'jaint-' + room.row.id + '-' + a.tag };
      Promise.resolve(push.sendMany(uids, msg)).catch(() => {});
    }
  }

  /* contenu de la publication : ce que les adhérents voient du tournoi */
  async function postFor(row, spaceId) {
    if (Int.isInterne(row.state)) return postInterne(row);
    const T = row.state, t = T.tournament || {}, ani = Ani.isAnimation(T);
    const g = await ram.groupsOf(spaceId).catch(() => null);
    const keyOf = {};
    Object.entries((g && g.users) || {}).forEach(([k, u]) => { keyOf[u] = k; });
    // adhérents reconnus : par l'inscription faite dans l'appli, ou par la fiche joueur reliée à leur compte
    const players = new Map();
    const userOfPlayer = async pid => { if (!pid) return null; if (players.has(pid)) return players.get(pid); const pl = await store.getPlayer(pid).catch(() => null); players.set(pid, pl && pl.user_id); return pl && pl.user_id; };
    const k = async (pl, srcU, srcK) => srcK || keyOf[srcU] || keyOf[await userOfPlayer(pl && pl.playerId)] || null;   // srcK : enfant inscrit par son parent
    let status, list = [], results = [], count, direct = null;
    if (ani) {
      const A = T.ani;
      count = A.players.length;
      status = A.status === 'done' ? 'done' : A.rounds.length ? 'live' : 'open';
      for (const p of A.players) list.push({ n1: p.name, k1: (p.src && p.src.k) || (keyOf[p.src && p.src.u] || keyOf[await userOfPlayer(p.playerId)]) || null });
      if (status === 'live') {
        const nm = id => (A.players.find(p => p.id === id) || {}).name || '';
        const cn = i => (T.courts[i] || {}).name || 'Terrain ' + (i + 1);
        const r = A.rounds[A.rounds.length - 1];
        direct = { round: r.n, on: r.matches.map(m => ({ c: cn(m.court), a: m.a.map(nm).join(' & '), b: m.b.map(nm).join(' & '), sa: m.sa, sb: m.sb, done: !!m.done })),
          top: Ani.standings(T).rows.slice(0, 8).map(x => ({ n: x.ids.map(nm).join(' & '), pts: x.pf, won: x.won })) };
      }
      if (status === 'done') results = Ani.standings(T).rows.slice(0, 8).map((x, i) => ({ place: i + 1, n: x.ids.map(id => (A.players.find(p => p.id === id) || {}).name).join(' & '), k: x.ids.map(id => list[A.players.findIndex(p => p.id === id)]).filter(Boolean).map(y => y.k1).filter(Boolean) }));
    } else {
      const pairs = T.pairs.filter(p => !p.withdrawn);
      count = pairs.length;
      const built = !!(T.draw && T.draw.built), started = (T.matches || []).some(m => m.status === 'live' || m.status === 'done');
      status = t.closed ? 'done' : started ? 'live' : built ? 'drawn' : 'open';
      for (const p of pairs) list.push({ id: p.id, n1: pname(p.p1), n2: pname(p.p2), k1: await k(p.p1, p.src && !p.src.k ? p.src.u : null, p.src && p.src.k), k2: await k(p.p2, p.src && p.src.pu, p.src && p.src.pk) });
      // horaires : prochain match de chaque paire du club (heure prévue arrondie à 5 min, terrain, adversaires)
      if (built && status !== 'done') {
        const R = Engine.resolve(T), tl = Engine.timeline(T, R);
        for (const x of list) {
          if (!x.k1 && !x.k2) continue;
          const ms = T.matches.filter(m => tl[m.id] && R[m.id].state !== 'done' && (R[m.id].A === x.id || R[m.id].B === x.id)).sort((a, b) => tl[a.id].start - tl[b.id].start);
          const m = ms[0]; if (!m) continue;
          const opp = T.pairs.find(y => y.id === (R[m.id].A === x.id ? R[m.id].B : R[m.id].A));
          x.next = { at: Math.round(tl[m.id].start / 300000) * 300000, court: (T.courts.find(c => c.id === tl[m.id].court) || {}).name || '', vs: opp ? pname(opp.p1) + ' / ' + pname(opp.p2) : '', live: m.status === 'live' };
        }
        // le direct du tournoi, pour tous les adhérents : en cours, à venir, derniers résultats
        const pn = id => { const y = T.pairs.find(z => z.id === id); return y ? pname(y.p1) + ' / ' + pname(y.p2) : ''; };
        const cn = m => (T.courts.find(c => c.id === ((tl[m.id] || {}).court || m.court)) || {}).name || '';
        const real = m => R[m.id] && !R[m.id].staticBye && R[m.id].A && R[m.id].B && R[m.id].A !== 'BYE' && R[m.id].B !== 'BYE';
        direct = {
          on: T.matches.filter(m => real(m) && R[m.id].state === 'live').map(m => ({ c: cn(m), l: Engine.matchLabel(m), a: pn(R[m.id].A), b: pn(R[m.id].B), s: Engine.scoreText(R[m.id]) })),
          up: T.matches.filter(m => real(m) && R[m.id].state === 'ready' && tl[m.id]).sort((a, b) => tl[a.id].start - tl[b.id].start).slice(0, 8)
            .map(m => ({ at: Math.round(tl[m.id].start / 300000) * 300000, c: cn(m), l: Engine.matchLabel(m), a: pn(R[m.id].A), b: pn(R[m.id].B) })),
          last: T.matches.filter(m => real(m) && R[m.id].state === 'done').sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).slice(0, 8)
            .map(m => ({ l: Engine.matchLabel(m), w: pn(R[m.id].winner), lo: pn(R[m.id].loser), s: Engine.winnerScoreText(R[m.id]) }))
        };
      }
      if (status === 'done') {
        const R = Engine.resolve(T);
        results = Engine.finalResults(T, R).slice(0, 8).map(r => { const x = list.find(y => y.id === r.pair) || {}; return { place: r.place, lo: r.placeLo || null, n: [x.n1, x.n2].filter(Boolean).join(' / '), k: [x.k1, x.k2].filter(Boolean) }; });
      }
    }
    const reg = regOf(t);
    const deadline = t.deadline || '', closedReg = status !== 'open' || (deadline && new Date(deadline).getTime() < Date.now());
    return {
      by: 'club', kind: 'jatour', at: row.created_at || Date.now(),
      // champs lus par l'agenda du club, comme un événement
      title: t.name || 'Tournoi', d: t.dateStart || '', d2: t.dateEnd && t.dateStart && t.dateEnd > t.dateStart ? t.dateEnd : undefined,   // date de fin seulement si elle suit le début
      place: t.club || '', sport: 'Padel',
      ja: {
        tid: row.id, ani, fmt: ani ? (Ani.FORMATS[T.ani.format] || {}).name : '', cat: ani ? 'Animation' : t.category, gender: ani ? '' : t.gender,
        time: t.startTime || '', address: t.address || '', jaName: t.ja || '', jaTitle: t.jaNumber || '', deadline, max: ani ? null : +t.maxPairs || null,
        reg: reg.mode, where: reg.where, open: !closedReg && reg.mode === 'app', status, count, list, results, prize: t.prize || '',
        direct, tv: status === 'drawn' || status === 'live' ? '/t/' + row.id + '/tv?k=' + row.key : ''   // grand écran /RAM JA, en lecture seule
      }
    };
  }

  /* republier (ou retirer) la publication d'un tournoi ; appelé à chaque enregistrement, regroupé */
  async function sync(room) {
    const T = room.row.state, t = T.tournament || {};
    if (!T || t.example || (T.pairs || []).some(p => p.demo)) return;
    const sp = published(t) ? await spaceOf(T) : null, prev = lastSpace.get(room.row.id);
    if (prev && prev !== sp) await ram.serverPut(prev, 'post', postId(room.row.id), null).catch(() => {});   // club changé ou publication retirée
    lastSpace.set(room.row.id, sp);
    if (!sp) return;
    await ram.serverPut(sp, 'post', postId(room.row.id), await postFor(room.row, sp));
    if (Int.isInterne(T)) await avisInterne(room, sp).catch(() => {});
  }
  function schedule(room, log) {
    if (timers.has(room.row.id)) return;
    timers.set(room.row.id, setTimeout(() => { timers.delete(room.row.id); sync(room).catch(e => log && log('Publication /RAM Club : ' + e.message)); }, 1500));
  }

  /* ---------- inscriptions depuis /RAM Club ---------- */
  async function context(user, tid) {
    const room = await getRoom(tid); if (!room) throw new Error('Tournoi introuvable');
    const T = room.row.state, t = T.tournament || {};
    if (!published(t) || regOf(t).mode !== 'app') throw new Error('Les inscriptions de ce tournoi ne se font pas dans l’appli.');
    const sp = await spaceOf(T); if (!sp) throw new Error('Ce tournoi n’est pas publié sur /RAM Club.');
    const me = await ram.memberInfo(sp, user.id);
    if (!me || !me.valid) throw new Error('Réservé aux adhérents validés du club.');
    return { room, T, t, sp, me };
  }
  async function fiche(userId) {
    const id = await store.getIdentity(userId).catch(() => null);
    const pl = id && id.player ? await store.getPlayer(id.player).catch(() => null) : null;
    return pl;
  }
  const asPlayer = (pl, fallback, club) => pl
    ? { last: pl.last, first: pl.first, licence: pl.licence || '', rank: pl.rank || '', club: club || '', playerId: pl.id }
    : { last: String(fallback.last || '').toUpperCase(), first: fallback.first || '', licence: String(fallback.licence || '').replace(/\s+/g, '').toUpperCase(), rank: fallback.rank || '', club: fallback.club || '' };
  const splitN = n => { const w = String(n || '').trim().split(/\s+/); return { first: w.shift() || '', last: w.join(' ') }; };

  /* qui est inscrit : un compte (« u:… ») ou un enfant sans compte, par sa clé dans le club (« k:… ») */
  const who = (u, k) => (k ? 'k:' + k : 'u:' + u);
  const sideA = src => who(src.u, src.k), sideB = src => (src.pk ? 'k:' + src.pk : src.pu ? 'u:' + src.pu : null);
  const inPair = (p, id) => !p.withdrawn && !!p.src && (sideA(p.src) === id || sideB(p.src) === id);
  /* un enfant : seulement le sien (son parent dans le club) */
  async function kidOf(sp, me, kid) {
    if (!(me.kids || []).includes(kid)) throw new Error('Tu ne peux inscrire que tes enfants.');
    const m = await ram.memberByKey(sp, kid); if (!m) throw new Error('Enfant introuvable dans le club.');
    return m;
  }

  /* s'inscrire, ou inscrire un de ses enfants (kid : sa clé dans le club) */
  async function register(user, tid, partner, kid) {
    const { room, T, t, sp, me } = await context(user, tid);
    if (t.closed) throw new Error('Tournoi clôturé.');
    if (t.deadline && new Date(t.deadline).getTime() < Date.now()) throw new Error('La date limite d’inscription est passée.');
    const club = t.club || '', k = kid ? await kidOf(sp, me, kid) : null;
    const d = k ? k.data : me.data, self = who(user.id, kid), name = String(d.n || 'Ton enfant').split(' ')[0];
    const pl = k ? (d._ja ? await store.getPlayer(d._ja).catch(() => null) : null) : await fiche(user.id);
    const p1 = asPlayer(pl, Object.assign(splitN(d.n), { licence: d.lic, rank: d.pad }), club);
    if (Ani.isAnimation(T)) {
      if (T.ani.rounds.length) throw new Error('L’animation a commencé : voyez le juge-arbitre sur place.');
      if (T.ani.players.some(p => p.src && who(p.src.u, p.src.k) === self)) throw new Error(kid ? name + ' est déjà inscrit.' : 'Tu es déjà inscrit.');
      applyServerAction(room, { type: 'ani/player/add', payload: { name: [p1.first, p1.last].filter(Boolean).join(' '), playerId: p1.playerId || '', sex: d.g === 'F' ? 'F' : d.g === 'H' ? 'H' : '', src: kid ? { u: user.id, k: kid } : { u: user.id } } });
      aviser(room, user, tid, 'in', [p1.first, p1.last].filter(Boolean).join(' '));
      return { ok: true };
    }
    if (T.draw && T.draw.built) throw new Error('Le tirage est fait : contactez le juge-arbitre pour toute inscription.');
    if (T.pairs.some(p => inPair(p, self))) throw new Error(kid ? name + ' est déjà inscrit à ce tournoi.' : 'Tu es déjà inscrit à ce tournoi.');
    let p2, pu = null, pk = null;
    if (partner && partner.key) {
      if (partner.key === (kid || me.key)) throw new Error('Choisis un autre partenaire.');
      const m = await ram.memberByKey(sp, partner.key);
      if (!m) throw new Error('Partenaire introuvable dans le club.');
      if (!kid && m.user_id === user.id) throw new Error('Choisis un autre partenaire que toi.');
      pu = m.user_id || null;
      if (!pu) pk = partner.key;   // partenaire sans compte (un enfant) : reconnu par sa clé
      if (T.pairs.some(p => inPair(p, pu ? 'u:' + pu : 'k:' + pk))) throw new Error('Ce partenaire est déjà inscrit.');
      const ppl = pu ? await fiche(pu) : m.data._ja ? await store.getPlayer(m.data._ja).catch(() => null) : null;
      p2 = asPlayer(ppl, Object.assign(splitN(m.data.n), { licence: m.data.lic, rank: m.data.pad }), club);
    } else {
      const last = String((partner && partner.last) || '').trim(), first = String((partner && partner.first) || '').trim();
      if (!last) throw new Error('Nom du partenaire manquant.');
      p2 = asPlayer(null, { last, first, licence: partner.licence, club: partner.club || '' });
    }
    const src = { u: user.id, pu, at: Date.now() };
    if (kid) src.k = kid;
    if (pk) src.pk = pk;
    applyServerAction(room, { type: 'pair/add', payload: { p1, p2, src } });
    aviser(room, user, tid, 'in', [p1, p2].map(pname).join(' / '));
    return { ok: true };
  }
  async function unregister(user, tid, kid) {
    const { room, T, sp, me } = await context(user, tid);
    if (kid) await kidOf(sp, me, kid);
    const self = who(user.id, kid);
    if (Ani.isAnimation(T)) {
      const p = T.ani.players.find(x => x.src && who(x.src.u, x.src.k) === self);
      if (!p) throw new Error(kid ? 'Ton enfant n’est pas inscrit.' : 'Tu n’es pas inscrit.');
      if (T.ani.rounds.length) throw new Error('L’animation a commencé : prévenez le juge-arbitre.');
      applyServerAction(room, { type: 'ani/player/remove', payload: { id: p.id } });
      aviser(room, user, tid, 'out', String(p.name || 'Un joueur'));
      return { ok: true };
    }
    const p = T.pairs.find(x => inPair(x, self));
    if (!p) throw new Error(kid ? 'Ton enfant n’est pas inscrit par l’appli à ce tournoi.' : 'Tu n’es pas inscrit par l’appli à ce tournoi.');
    if (T.draw && T.draw.built) throw new Error('Le tirage est fait : prévenez le juge-arbitre de votre forfait.');
    applyServerAction(room, { type: 'pair/remove', payload: { id: p.id } });
    aviser(room, user, tid, 'out', [p.p1, p.p2].map(pname).join(' / '));
    return { ok: true };
  }

  /* ---------- tournoi interne : ce que les joueurs font depuis /RAM Club ---------- */
  async function ctxInterne(user, tid, kid) {
    const room = await getRoom(tid); if (!room) throw new Error('Tournoi introuvable');
    const T = room.row.state;
    if (!Int.isInterne(T)) throw new Error('Ce n’est pas un tournoi interne.');
    const sp = await spaceOf(T); if (!sp) throw new Error('Ce tournoi n’est pas publié sur /RAM Club.');
    const me = await ram.memberInfo(sp, user.id);
    if (!me || !me.valid) throw new Error('Réservé aux adhérents validés du club.');
    if (kid) await kidOf(sp, me, kid);
    const key = kid || me.key, pj = T.int.players.find(p => (p.ks || []).includes(key));
    if (!pj) throw new Error('Tu ne participes pas à ce tournoi.');
    return { room, T, pj };
  }
  /* résultat (le vainqueur et le score), confirmation ou contestation d'un match où l'on joue */
  async function interne(user, b) {
    const { room, T, pj } = await ctxInterne(user, String(b.tid || ''), b.kid ? String(b.kid) : null);
    const m = Int.findM(T.int, String(b.m || ''));
    if (!m || (m.a !== pj.id && m.b !== pj.id)) throw new Error('Tu ne joues pas ce match.');
    if (T.int.status !== 'live') throw new Error('Le tournoi n’est pas en cours.');
    if (b.act === 'result') applyServerAction(room, { type: 'int/result', payload: { m: m.id, w: b.w === 'moi' ? pj.id : m.a === pj.id ? m.b : m.a, sc: String(b.sc || '').slice(0, 60), by: pj.id } });
    else if (b.act === 'confirm') applyServerAction(room, { type: 'int/confirm', payload: { m: m.id, by: pj.id } });
    else if (b.act === 'contest') applyServerAction(room, { type: 'int/contest', payload: { m: m.id, by: pj.id, why: String(b.why || '').slice(0, 300) } });
    else throw new Error('Action inconnue.');
    return { ok: true };
  }
  /* adhérents validés du club du tournoi (pour choisir les participants dans /RAM JA) */
  async function membres(T) {
    const sp = await spaceOf(T); if (!sp) return { club: false, membres: [] };
    const au = await ram.audience(sp); if (!au) return { club: true, membres: [] };
    const l = au.keys.filter(k => au.valid[k]).map(k => ({ k, n: String((au.get('member', k) || {}).n || '').trim() })).filter(x => x.n);
    return { club: true, membres: l.sort((a, b) => a.n.localeCompare(b.n, 'fr')) };
  }
  /* rappels avant la date limite des tours (toutes les 3 heures) */
  async function relances(listAll) {
    const l = (await listAll().catch(() => [])).filter(t => ((t.summary || {}).kind === 'interne') && !(t.summary || {}).closed);
    for (const meta of l) {
      const room = await getRoom(meta.id).catch(() => null); if (!room) continue;
      const T = room.row.state, sp = await spaceOf(T).catch(() => null); if (!sp) continue;
      const g = await ram.groupsOf(sp).catch(() => null), users = (g && g.users) || {};
      for (const m of Int.aRelancer(T)) {
        const fin = (T.int.tours[m.r] || {}).fin.split('-').reverse().slice(0, 2).join('/');
        for (const [moi, lui] of [[m.a, m.b], [m.b, m.a]]) {
          const uids = ((Int.joueur(T.int, moi) || {}).ks || []).map(k => users[k]).filter(Boolean);
          if (uids.length && push) Promise.resolve(push.sendMany(uids, { title: T.tournament.name || 'Tournoi interne', body: `Rappel : ton match contre ${Int.nomDe(T.int, lui)} doit être joué avant le ${fin}.`, url: '#/post/' + postId(room.row.id) + '?club=' + sp, tag: 'jaint-' + room.row.id + '-rappel-' + m.id })).catch(() => {});
        }
        applyServerAction(room, { type: 'int/remind', payload: { m: m.id } });
      }
    }
  }

  return { schedule, sync, register, unregister, postId, interne, membres, relances };
}

module.exports = { createJaClub, avisInscription };
