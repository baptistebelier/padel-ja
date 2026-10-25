/* /RAM Club — ui/11-tournois.js : tournois et animations /RAM JA publiés sur le mur du club (post.kind 'jatour').
   La publication est écrite et tenue à jour par le serveur /RAM JA : inscrits, tirage, en cours, résultats.
   Les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* heure d'un match prévu : « 14 h 30 » */
const jaHour = at => {
  const d = new Date(at);
  return d.getHours() + ' h' + (d.getMinutes() ? ' ' + String(d.getMinutes()).padStart(2, '0') : '');
};
const jaNext = n =>
  n
    ? (n.live
        ? `En cours${n.court ? ' sur ' + esc(n.court) : ''}`
        : `${new Date(n.at).toDateString() === new Date().toDateString() ? '' : fmtD(new Date(n.at).toISOString().slice(0, 10)) + ' · '}${jaHour(n.at)}${n.court ? ' · ' + esc(n.court) : ''}`) +
      (n.vs ? ' · contre ' + esc(n.vs) : '')
    : '';
const JA_STATUS = { open: 'Inscriptions ouvertes', drawn: 'Tirage effectué', live: 'En cours', done: 'Terminé' };
const jaPlace = (p, lo) => (p === 1 ? '1er' : p + 'e') + (lo && lo !== p ? '–' + lo + 'e' : '');
/* moi et mes enfants : chacun peut être inscrit (un enfant, par son parent) */
const jaFamily = () => [ME(), ...((M[ME()] && M[ME()].kids) || []).filter(k => M[k])];
/* la ligne d'inscription d'une personne, et le nom de son partenaire */
function jaEntry(ja, k) {
  const x = (ja.list || []).find(y => y.k1 === k || y.k2 === k);
  return x ? { row: x, mate: x.k1 === k ? x.n2 : x.n1 } : null;
}
function jaMine(ja) {
  for (const k of jaFamily()) {
    const e = jaEntry(ja, k);
    if (e) return e;
  }
  return null;
}
const jaPostBody = postBody;
postBody = p => (p.kind === 'jatour' && p.ja ? jaBody(p) : jaPostBody(p));

/* le direct du tournoi (ou de l'animation), tenu à jour par /RAM JA : en cours, à venir, derniers résultats */
function jaDirect(ja) {
  const d = ja.direct;
  if (!d) return '';
  const row = (l, r, cls) =>
    `<div class="price${cls ? ' ' + cls : ''}"><span>${l}</span>${r != null && r !== '' ? `<span class="nb">${r}</span>` : ''}</div>`;
  const sub = t => `<span class="kicker">${t}</span>`;
  let h = '';
  if (ja.ani) {
    h +=
      sub('Manche ' + d.round) +
      (d.on || [])
        .map(m =>
          row(
            `<span class="muted small">${esc(m.c)}</span><br>${esc(m.a)} – ${esc(m.b)}`,
            m.done || m.sa != null ? esc(m.sa) + ' – ' + esc(m.sb) : 'En jeu'
          )
        )
        .join('');
    if ((d.top || []).length)
      h += sub('Classement') + d.top.map((x, i) => row(`<b>${i + 1}</b> ${esc(x.n)}`, x.pts + ' pts')).join('');
  } else {
    if ((d.on || []).length)
      h +=
        sub('En cours') +
        d.on
          .map(m =>
            row(
              `<span class="muted small">${esc(m.c)} · ${esc(m.l)}</span><br>${esc(m.a)}<br>${esc(m.b)}`,
              esc(m.s || '0-0'),
              'on'
            )
          )
          .join('');
    if ((d.up || []).length)
      h +=
        sub('À venir') +
        d.up
          .map(m =>
            row(
              `<span class="muted small">${jaHour(m.at)}${m.c ? ' · ' + esc(m.c) : ''} · ${esc(m.l)}</span><br>${esc(m.a)} – ${esc(m.b)}`
            )
          )
          .join('');
    if ((d.last || []).length)
      h +=
        sub('Derniers résultats') +
        d.last
          .map(m =>
            row(`<span class="muted small">${esc(m.l)}</span><br><b>${esc(m.w)}</b> bat ${esc(m.lo)}`, esc(m.s))
          )
          .join('');
  }
  if (!h) return '';
  const live = ja.ani ? (d.on || []).filter(m => !m.done).length : (d.on || []).length,
    tv = ja.tv
      ? `<a class="btn ghost full" href="${/^club\./.test(location.hostname) ? 'https://ja.riseandmove.fr' : ''}${esc(ja.tv)}" target="_blank" rel="noopener">Grand écran du tournoi ${ic('link')}</a>`
      : '';
  return `<details class="more ja-direct"><summary>${ic('score')}Suivre le direct${live ? ` <span class="tag hot">${live} en jeu</span>` : ''}</summary><div class="in">${h}${tv}</div></details>`;
}

/* ligue des animations de la saison : points selon la place (10, 8, 6, 5, 4, 3, 2, 1) et 1 point de participation */
const LIGUE_PTS = [10, 8, 6, 5, 4, 3, 2, 1];
function jaLeague() {
  const y = parseInt(S.season, 10),
    from = y ? y + '-09-01' : '',
    to = y ? y + 1 + '-08-31' : '9';
  const T = {},
    evs = posts.filter(
      p => p.kind === 'jatour' && p.ja && p.ja.ani && p.ja.status === 'done' && (!p.d || (p.d >= from && p.d <= to))
    );
  const row = k => T[k] || (T[k] = { k, pts: 0, n: 0, wins: 0 });
  evs.forEach(p => {
    new Set((p.ja.list || []).map(x => x.k1).filter(k => k && M[k])).forEach(k => {
      row(k).pts += 1;
      row(k).n++;
    });
    (p.ja.results || []).forEach(r =>
      (r.k || []).forEach(k => {
        if (!M[k]) return;
        row(k).pts += LIGUE_PTS[r.place - 1] || 0;
        if (r.place === 1) row(k).wins++;
      })
    );
  });
  return { count: evs.length, rows: Object.values(T).sort((a, b) => b.pts - a.pts || b.wins - a.wins || b.n - a.n) };
}
function leagueRows(rows) {
  return rows
    .map(
      (x, i) =>
        `<button class="item" data-a="member" data-id="${x.k}"><span class="tile" style="font-weight:700">${i + 1}</span><span class="grow"><span class="nm">${esc(M[x.k].n)}</span><br><span class="muted small">${x.n} animation${x.n > 1 ? 's' : ''}${x.wins ? ' · ' + x.wins + ' victoire' + (x.wins > 1 ? 's' : '') : ''}</span></span><b>${x.pts} pts</b></button>`
    )
    .join('');
}
function leagueCard() {
  const L = jaLeague();
  if (!L.count) return '';
  return `<div class="card"><span class="kicker">Ligue des animations · saison ${esc(S.season)}</span>${leagueRows(L.rows.slice(0, 5))}<button class="btn ghost full" data-a="league">Toute la ligue (${L.rows.length} joueur${L.rows.length > 1 ? 's' : ''})</button></div>`;
}

function jaBody(p) {
  const ja = p.ja,
    fam = jaFamily(),
    entries = fam.map(k => [k, jaEntry(ja, k)]),
    mine = jaMine(ja),
    dates = p.d ? (p.d2 ? `Du ${fmtD(p.d)} au ${fmtD(p.d2)}` : fmtD(p.d)) + (ja.time ? ' · ' + esc(ja.time) : '') : '';
  const kicker = ja.ani
    ? `Animation /RAM JA · ${esc(ja.fmt || '')}`
    : `Tournoi /RAM JA · ${esc(ja.cat || '')}${ja.gender ? ' · ' + esc(ja.gender) : ''}`;
  const who = ja.ani ? `${ja.count} joueur${ja.count > 1 ? 's' : ''}` : `${ja.count} paire${ja.count > 1 ? 's' : ''}`;
  const meta = `<div class="meta">${dates ? `<span>${ic('cal')}${dates}</span>` : ''}${p.place || ja.address ? `<span>${ic('pin')}${esc([p.place, ja.address].filter(Boolean).join(' · '))}</span>` : ''}${ja.jaName ? `<span>${ic('user')}JA : ${esc(ja.jaName)}${ja.jaTitle ? ' (' + esc(ja.jaTitle) + ')' : ''}</span>` : ''}</div>`;
  const status = `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag ${ja.status === 'live' ? 'hot' : ja.status === 'open' ? 'lime' : 'ghost'}">${JA_STATUS[ja.status] || ''}</span><span class="muted small">${who} inscrit${ja.ani ? '' : 'e'}${ja.count > 1 ? 's' : ''}${ja.max && !ja.ani ? ' · ' + ja.max + ' places' : ''}${ja.deadline && ja.status === 'open' ? ' · jusqu’au ' + fmtD(ja.deadline.slice(0, 10)) : ''}</span></div>`;
  // mon prochain match (programmation du juge-arbitre)
  const next = entries
    .filter(([, e]) => e && e.row.next)
    .map(
      ([k, e]) =>
        `<div class="note ok">${ic('clock')}<span>${k === ME() ? (e.row.next.live ? 'Ton match' : 'Ton prochain match') : (e.row.next.live ? 'Match de ' : 'Prochain match de ') + esc(first(k))} : ${jaNext(e.row.next)}</span></div>`
    )
    .join('');
  let reg = '';
  if (ja.reg === 'ext')
    reg = `<div class="note">${ic('info')}Inscriptions : ${/^https?:\/\//.test(ja.where) ? `<a href="${esc(ja.where)}" target="_blank" rel="noopener">${esc(ja.where.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : esc(ja.where || 'auprès du juge-arbitre')}</div>`;
  else {
    // une ligne par personne : moi, puis chacun de mes enfants
    reg = entries
      .map(([k, e]) => {
        const me = k === ME(),
          kd = me ? '' : ` data-k="${k}"`,
          nm = esc(first(k));
        if (e)
          return `<div class="note ok">${ic('check')}${me ? 'Tu es inscrit' : nm + ' est inscrit'}${!ja.ani && e.mate ? ' avec ' + esc(e.mate) : ''}.</div>${ja.open ? `<div class="ctl"><button class="btn ghost grow" data-a="jaOut" data-id="${p.id}"${kd}>${me ? 'Me désinscrire' : 'Désinscrire ' + nm}</button></div>` : ''}`;
        if (!ja.open) return '';
        return `<div class="ctl"><button class="btn ${me ? '' : 'ghost '}grow" data-a="jaIn" data-id="${p.id}"${kd}>${me ? (ja.ani ? 'Je m’inscris' : 'Inscrire ma paire') : 'Inscrire ' + nm}</button></div>`;
      })
      .join('');
    if (!ja.open && !mine && ja.status === 'open') reg = '<p class="muted small">Inscriptions closes.</p>';
  }
  const list = (ja.list || []).length
    ? `<details class="more"><summary>Voir les inscrits (${ja.list.length})</summary><div class="in">${ja.list.map(x => `<div class="price"><span>${esc(x.n1)}${x.n2 ? ' / ' + esc(x.n2) : ''}</span>${x.k1 || x.k2 ? '<span class="tag ghost">Club</span>' : ''}</div>`).join('')}</div></details>`
    : '';
  const me = [ME(), ...((M[ME()] && M[ME()].kids) || [])];
  const res = (ja.results || []).length
    ? `<div class="ja-res"><span class="kicker">Résultats</span>${ja.results.map(r => `<div class="price ${(r.k || []).some(k => me.includes(k)) ? 'me' : ''}"><span><b>${jaPlace(r.place, r.lo)}</b> ${esc(r.n)}</span>${(r.k || []).length ? '<span class="tag lime">Club</span>' : ''}</div>`).join('')}</div>`
    : '';
  return `<span class="kicker">${kicker}</span><h2 class="tilt sm">${esc(p.title || 'Tournoi')}</h2><div class="ev">${meta}${status}${ja.prize ? `<p class="muted small">Dotation : ${esc(ja.prize)}</p>` : ''}${res}${next}${ja.status !== 'done' ? reg : ''}${jaDirect(ja)}${list}</div>`;
}
