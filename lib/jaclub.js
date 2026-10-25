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
    const k = async (pl, srcU, srcK) => srcK || keyOf[srcU] || keyOf[await userOfPlayer(pl && pl.playerId)] || null;   // srcK : enfant inscrit par son parent
    let status, list = [], results = [], count;
    if (ani) {
      const A = T.ani;
      count = A.players.length;
      status = A.status === 'done' ? 'done' : A.rounds.length ? 'live' : 'open';
      for (const p of A.players) list.push({ n1: p.name, k1: (p.src && p.src.k) || (keyOf[p.src && p.src.u] || keyOf[await userOfPlayer(p.playerId)]) || null });
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
      return { ok: true };
    }
    const p = T.pairs.find(x => inPair(x, self));
    if (!p) throw new Error(kid ? 'Ton enfant n’est pas inscrit par l’appli à ce tournoi.' : 'Tu n’es pas inscrit par l’appli à ce tournoi.');
    if (T.draw && T.draw.built) throw new Error('Le tirage est fait : prévenez le juge-arbitre de votre forfait.');
    applyServerAction(room, { type: 'pair/remove', payload: { id: p.id } });
    return { ok: true };
  }

  return { schedule, sync, register, unregister, postId };
}

module.exports = { createJaClub };
