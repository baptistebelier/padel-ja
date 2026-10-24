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

const postId = tid => 'ja-' + String(tid).replace(/[^\w-]/g, '').slice(0, 40);
const pname = p => (p ? [String(p.first || '').trim(), String(p.last || '').trim().toUpperCase()].filter(Boolean).join(' ') : '');

function createJaClub({ store, ram, clubs, Engine, Ani, getRoom, applyServerAction }) {
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

  /* contenu de la publication : ce que les adhérents voient du tournoi */
  async function postFor(row, spaceId) {
    const T = row.state, t = T.tournament || {}, ani = Ani.isAnimation(T);
    const g = await ram.groupsOf(spaceId).catch(() => null);
    const keyOf = {};
    Object.entries((g && g.users) || {}).forEach(([k, u]) => { keyOf[u] = k; });
    // adhérents reconnus : par l'inscription faite dans l'appli, ou par la fiche joueur reliée à leur compte
    const players = new Map();
    const userOfPlayer = async pid => { if (!pid) return null; if (players.has(pid)) return players.get(pid); const pl = await store.getPlayer(pid).catch(() => null); players.set(pid, pl && pl.user_id); return pl && pl.user_id; };
    const k = async (pl, srcU) => keyOf[srcU] || keyOf[await userOfPlayer(pl && pl.playerId)] || null;
    let status, list = [], results = [], count;
    if (ani) {
      const A = T.ani;
      count = A.players.length;
      status = A.status === 'done' ? 'done' : A.rounds.length ? 'live' : 'open';
      for (const p of A.players) list.push({ n1: p.name, k1: (keyOf[p.src && p.src.u] || keyOf[await userOfPlayer(p.playerId)]) || null });
      if (status === 'done') results = Ani.standings(T).rows.slice(0, 8).map((x, i) => ({ place: i + 1, n: x.ids.map(id => (A.players.find(p => p.id === id) || {}).name).join(' & '), k: x.ids.map(id => list[A.players.findIndex(p => p.id === id)]).filter(Boolean).map(y => y.k1).filter(Boolean) }));
    } else {
      const pairs = T.pairs.filter(p => !p.withdrawn);
      count = pairs.length;
      const built = !!(T.draw && T.draw.built), started = (T.matches || []).some(m => m.status === 'live' || m.status === 'done');
      status = t.closed ? 'done' : started ? 'live' : built ? 'drawn' : 'open';
      for (const p of pairs) list.push({ id: p.id, n1: pname(p.p1), n2: pname(p.p2), k1: await k(p.p1, p.src && p.src.u), k2: await k(p.p2, p.src && p.src.pu) });
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
      title: t.name || 'Tournoi', d: t.dateStart || '', d2: t.dateEnd && t.dateStart && t.dateEnd > t.dateStart ? t.dateEnd : undefined,   // date de fin seulement si elle suit le début place: t.club || '', sport: 'Padel',
      ja: {
        tid: row.id, ani, fmt: ani ? (Ani.FORMATS[T.ani.format] || {}).name : '', cat: ani ? 'Animation' : t.category, gender: ani ? '' : t.gender,
        time: t.startTime || '', address: t.address || '', jaName: t.ja || '', jaTitle: t.jaNumber || '', deadline, max: ani ? null : +t.maxPairs || null,
        reg: reg.mode, where: reg.where, open: !closedReg && reg.mode === 'app', status, count, list, results, prize: t.prize || ''
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
  }
  function schedule(room, log) {
    clearTimeout(timers.get(room.row.id));
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

  async function register(user, tid, partner) {
    const { room, T, t, sp, me } = await context(user, tid);
    if (t.closed) throw new Error('Tournoi clôturé.');
    if (t.deadline && new Date(t.deadline).getTime() < Date.now()) throw new Error('La date limite d’inscription est passée.');
    const myPl = await fiche(user.id), club = t.club || '';
    const p1 = asPlayer(myPl, Object.assign(splitN(me.data.n), { licence: me.data.lic, rank: me.data.pad }), club);
    if (Ani.isAnimation(T)) {
      if (T.ani.rounds.length) throw new Error('L’animation a commencé : voyez le juge-arbitre sur place.');
      if (T.ani.players.some(p => p.src && p.src.u === user.id)) throw new Error('Tu es déjà inscrit.');
      applyServerAction(room, { type: 'ani/player/add', payload: { name: [p1.first, p1.last].filter(Boolean).join(' '), playerId: p1.playerId || '', sex: me.data.g === 'F' ? 'F' : me.data.g === 'H' ? 'H' : '', src: { u: user.id } } });
      return { ok: true };
    }
    if (T.draw && T.draw.built) throw new Error('Le tirage est fait : contactez le juge-arbitre pour toute inscription.');
    const mine = T.pairs.find(p => !p.withdrawn && p.src && (p.src.u === user.id || p.src.pu === user.id));
    if (mine) throw new Error('Tu es déjà inscrit à ce tournoi.');
    let p2, pu = null;
    if (partner && partner.key) {
      const m = await ram.memberByKey(sp, partner.key);
      if (!m) throw new Error('Partenaire introuvable dans le club.');
      if (m.user_id === user.id) throw new Error('Choisis un autre partenaire que toi.');
      pu = m.user_id;
      if (pu && T.pairs.some(p => !p.withdrawn && p.src && (p.src.u === pu || p.src.pu === pu))) throw new Error('Ce partenaire est déjà inscrit.');
      p2 = asPlayer(pu ? await fiche(pu) : null, Object.assign(splitN(m.data.n), { licence: m.data.lic, rank: m.data.pad }), club);
    } else {
      const last = String((partner && partner.last) || '').trim(), first = String((partner && partner.first) || '').trim();
      if (!last) throw new Error('Nom du partenaire manquant.');
      p2 = asPlayer(null, { last, first, licence: partner.licence, club: partner.club || '' });
    }
    applyServerAction(room, { type: 'pair/add', payload: { p1, p2, src: { u: user.id, pu, at: Date.now() } } });
    return { ok: true };
  }
  async function unregister(user, tid) {
    const { room, T } = await context(user, tid);
    if (Ani.isAnimation(T)) {
      const p = T.ani.players.find(x => x.src && x.src.u === user.id);
      if (!p) throw new Error('Tu n’es pas inscrit.');
      if (T.ani.rounds.length) throw new Error('L’animation a commencé : prévenez le juge-arbitre.');
      applyServerAction(room, { type: 'ani/player/remove', payload: { id: p.id } });
      return { ok: true };
    }
    const p = T.pairs.find(x => !x.withdrawn && x.src && (x.src.u === user.id || x.src.pu === user.id));
    if (!p) throw new Error('Tu n’es pas inscrit par l’appli à ce tournoi.');
    if (T.draw && T.draw.built) throw new Error('Le tirage est fait : prévenez le juge-arbitre de votre forfait.');
    applyServerAction(room, { type: 'pair/remove', payload: { id: p.id } });
    return { ok: true };
  }

  return { schedule, sync, register, unregister, postId };
}

module.exports = { createJaClub };
