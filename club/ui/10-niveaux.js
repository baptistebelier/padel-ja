/* /RAM Club — ui/10-niveaux.js : publications par niveaux des enseignants (parties dirigées et séances collectives).
   Une publication propose plusieurs fourchettes de niveau, chacune avec ses places. Chaque adhérent ne voit que
   la fourchette de son niveau ; l'enseignant les voit toutes. La première fourchette complète valide le créneau :
   les inscrits des autres fourchettes passent automatiquement en liste d'attente.
   L'ordre d'inscription (horodaté) suffit à tout recalculer : chaque appareil arrive au même résultat.
   Données (post.kind 'niveaux', post.nv) :
     { mode: 'partie' | 'cours', sport, theme, body, time, dur, place, fmt, dates: [iso…],
       tiers: [{ id, lo, hi, places }], ins: { 'iso|tid': [clés] }, at: { clé: { iso: horodatage } } } */
const NV_MODE = { partie: 'Partie dirigée', cours: 'Séance collective' };
/* niveau d'un adhérent : classement tennis (rang dans RANKS) ou niveau padel (1 à 10) */
const nvLevel = (k, sport) =>
  sport === 'Padel' ? (M[k] && M[k].pl != null ? +M[k].pl : null) : M[k] ? rIdx(M[k].r) : null;
const nvBound = (v, sport) => (sport === 'Padel' ? +v : rIdx(v));
const nvFits = (t, k, sport) => {
  const l = nvLevel(k, sport);
  return (
    l != null &&
    l >= Math.min(nvBound(t.lo, sport), nvBound(t.hi, sport)) &&
    l <= Math.max(nvBound(t.lo, sport), nvBound(t.hi, sport))
  );
};
const nvRange = (t, sport) => (sport === 'Padel' ? `Niveau ${t.lo} à ${t.hi}` : `${t.lo} à ${t.hi}`);
const nvMyTier = (nv, k) => nv.tiers.find(t => nvFits(t, k, nv.sport)) || null;
/* état d'une date : fourchette validée (la première complète), et pour chaque fourchette la liste dans l'ordre
   d'inscription avec le statut de chacun : 'ok' (validé), 'in' (inscrit, en attente de validation), 'wait' */
function nvState(nv, iso) {
  const at = (k, i) => (nv.at && nv.at[k] && nv.at[k][iso]) || 1e15 + i;
  const lists = {};
  let win = null,
    best = Infinity;
  nv.tiers.forEach(t => {
    const l = (nv.ins && nv.ins[iso + '|' + t.id]) || [];
    const sorted = l.map((k, i) => [k, at(k, i)]).sort((a, b) => a[1] - b[1]);
    lists[t.id] = sorted.map(x => x[0]);
    if (sorted.length >= t.places && sorted[t.places - 1][1] < best) {
      best = sorted[t.places - 1][1];
      win = t.id;
    }
  });
  const status = {};
  nv.tiers.forEach(t =>
    lists[t.id].forEach((k, i) => {
      status[t.id + '|' + k] = i >= t.places ? 'wait' : win ? (t.id === win ? 'ok' : 'wait') : 'in';
    })
  );
  return { win, lists, status };
}
/* date affichée : celle choisie dans la publication, sinon la prochaine à venir */
const nvDate = p => {
  const ds = p.nv.dates || [];
  const pick = (S.nvd || {})[p.id];
  return ds.includes(pick) ? pick : ds.find(d => d >= TODAY) || ds[ds.length - 1];
};
const nvStaff = p => p.by === ME() || isAdmin();

/* qui voit la publication : l'enseignant et le bureau ; les adhérents dont le niveau entre dans une fourchette */
const nvCanSee = canSee;
canSee = p => {
  if (p.kind !== 'niveaux') return nvCanSee(p);
  if (p.arch || S.blocked.has(p.by)) return false;
  if (nvStaff(p)) return true;
  if (S.role === 'kid') return false;
  return !!nvMyTier(p.nv, ME());
};
const nvPostBody = postBody;
postBody = p => (p.kind === 'niveaux' ? nvBody(p) : nvPostBody(p));

function nvBody(p) {
  const nv = p.nv,
    iso = nvDate(p),
    st = nvState(nv, iso),
    me = ME(),
    staff = nvStaff(p),
    dates = nv.dates || [];
  // partie dirigée : « Partie dirigée avec Prénom Nom » (l'enseignant qui la propose), sport et format au-dessus
  const head =
    nv.mode === 'partie'
      ? `<span class="kicker">${esc(nv.sport)}${nv.fmt ? ' · ' + esc(nv.fmt) : ''}</span><h2 class="tilt sm">Partie dirigée <em>avec ${esc(M[p.by] ? name(p.by) : 'l’enseignant')}</em></h2>${nv.body ? `<p>${esc(nv.body)}</p>` : ''}`
      : `<span class="kicker">${NV_MODE[nv.mode] || 'Créneau'} · ${esc(nv.sport)}</span><h2 class="tilt sm">${esc(nv.theme || 'Séance')}</h2>${nv.body ? `<p>${esc(nv.body)}</p>` : ''}`;
  const meta = `<div class="meta"><span>${ic('cal')}${dates.length > 1 ? 'Chaque ' + DAYS[new Date(dates[0] + 'T12:00').getDay()].toLowerCase() + ' · ' + nv.time : fmtD(iso) + ' · ' + nv.time}</span><span>${ic('clock')}${esc(nv.dur || '')}</span>${nv.price ? `<span class="nv-price">${esc(nv.price)}</span>` : ''}${nv.place ? `<span>${ic('pin')}${esc(nv.place)}</span>` : ''}</div>`;
  const pick =
    dates.length > 1
      ? `<div class="chips nv-dates">${dates.map(d => `<button class="chip" data-a="nvDay" data-id="${p.id}" data-d="${d}" aria-pressed="${d === iso}">${fmtD(d)}${nvState(nv, d).win ? ' ✓' : ''}</button>`).join('')}</div>`
      : '';
  const dots = (n, places) =>
    `<span class="dots" aria-hidden="true">${Array.from({ length: places }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const past = iso < TODAY;
  let body;
  if (staff) {
    // l'enseignant voit toutes les fourchettes, leurs inscrits et celle qui est validée
    body = nv.tiers
      .map(t => {
        const l = st.lists[t.id],
          ok = l.filter(k => st.status[t.id + '|' + k] !== 'wait').length,
          tag =
            st.win === t.id
              ? '<span class="tag lime">Validée</span>'
              : st.win
                ? '<span class="tag ghost">En attente</span>'
                : '';
        return `<div class="nv-tier${st.win === t.id ? ' win' : ''}"><div class="row" style="gap:8px;flex-wrap:wrap"><b class="grow">${nvRange(t, nv.sport)}</b>${tag}</div><div class="row">${dots(Math.min(ok, t.places), t.places)}<span class="muted small">${Math.min(l.length, t.places)} / ${t.places}${l.length > t.places || (st.win && st.win !== t.id && l.length) ? ' · ' + l.filter(k => st.status[t.id + '|' + k] === 'wait').length + ' en attente' : ''}</span></div>${l.length ? `<div class="row" style="flex-wrap:wrap;gap:6px 12px">${l.map(k => `<span class="row nv-who ${st.status[t.id + '|' + k]}" style="gap:6px">${av(k, 'sm')}${name(k)}</span>`).join('')}</div>` : ''}</div>`;
      })
      .join('');
    body += `<span class="muted small">Chaque adhérent ne voit que la fourchette de son niveau. La première fourchette complète valide ${nv.mode === 'cours' ? 'la séance' : 'la partie'} ; les autres passent en liste d'attente.</span>`;
  } else {
    const t = nvMyTier(nv, me),
      l = t ? st.lists[t.id] : [],
      s = t && st.status[t.id + '|' + me],
      n = l.length;
    const msg =
      s === 'ok'
        ? `<div class="note ok">${ic('check')}${nv.mode === 'cours' ? 'Séance validée' : 'Partie validée'} : tu es inscrit.</div>`
        : s === 'wait'
          ? `<div class="note">${st.win && st.win !== t.id ? 'Une autre fourchette de niveau est complète : tu es en liste d’attente. L’enseignant te préviendra si une place se libère.' : 'Ta fourchette est complète : tu es en liste d’attente.'}</div>`
          : s === 'in'
            ? `<div class="note">Tu es inscrit. Dès que ta fourchette est complète, ${nv.mode === 'cours' ? 'la séance' : 'la partie'} est validée.</div>`
            : st.win && st.win !== t.id
              ? `<div class="note">Une autre fourchette est déjà complète : tu peux t’inscrire sur la liste d’attente.</div>`
              : '';
    body = t
      ? `<div class="row"><b class="grow">${nvRange(t, nv.sport)}</b>${dots(Math.min(n, t.places), t.places)}<span class="muted small">${Math.min(n, t.places)} / ${t.places}</span></div>${msg}${past ? '' : `<div class="ctl">${s ? `<button class="btn on grow" data-a="nvJoin" data-id="${p.id}" data-t="${t.id}" data-d="${iso}">${s === 'wait' ? 'Quitter la liste d’attente' : 'Je ne peux plus'}</button>` : `<button class="btn grow" data-a="nvJoin" data-id="${p.id}" data-t="${t.id}" data-d="${iso}">${(st.win && st.win !== t.id) || n >= t.places ? 'Liste d’attente' : nv.mode === 'cours' ? 'Je m’inscris' : 'Compte sur moi'}</button>`}</div>`}`
      : '';
  }
  return head + `<div class="ev">${meta}${pick}${body}</div>`;
}
