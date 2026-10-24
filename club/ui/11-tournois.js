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
/* ma ligne d'inscription (moi ou mon enfant), et le nom de mon partenaire */
function jaMine(ja) {
  const keys = [ME(), ...((M[ME()] && M[ME()].kids) || [])];
  const x = (ja.list || []).find(y => keys.includes(y.k1) || keys.includes(y.k2));
  if (!x) return null;
  return { row: x, mate: keys.includes(x.k1) ? x.n2 : x.n1 };
}
const jaPostBody = postBody;
postBody = p => (p.kind === 'jatour' && p.ja ? jaBody(p) : jaPostBody(p));

function jaBody(p) {
  const ja = p.ja,
    mine = jaMine(ja),
    dates = p.d ? (p.d2 ? `Du ${fmtD(p.d)} au ${fmtD(p.d2)}` : fmtD(p.d)) + (ja.time ? ' · ' + esc(ja.time) : '') : '';
  const kicker = ja.ani
    ? `Animation /RAM JA · ${esc(ja.fmt || '')}`
    : `Tournoi /RAM JA · ${esc(ja.cat || '')}${ja.gender ? ' · ' + esc(ja.gender) : ''}`;
  const who = ja.ani ? `${ja.count} joueur${ja.count > 1 ? 's' : ''}` : `${ja.count} paire${ja.count > 1 ? 's' : ''}`;
  const meta = `<div class="meta">${dates ? `<span>${ic('cal')}${dates}</span>` : ''}${p.place || ja.address ? `<span>${ic('pin')}${esc([p.place, ja.address].filter(Boolean).join(' · '))}</span>` : ''}${ja.jaName ? `<span>${ic('user')}JA : ${esc(ja.jaName)}${ja.jaTitle ? ' (' + esc(ja.jaTitle) + ')' : ''}</span>` : ''}</div>`;
  const status = `<div class="row" style="gap:8px;flex-wrap:wrap"><span class="tag ${ja.status === 'live' ? 'hot' : ja.status === 'open' ? 'lime' : 'ghost'}">${JA_STATUS[ja.status] || ''}</span><span class="muted small">${who} inscrit${ja.ani ? '' : 'e'}${ja.count > 1 ? 's' : ''}${ja.max && !ja.ani ? ' · ' + ja.max + ' places' : ''}${ja.deadline && ja.status === 'open' ? ' · jusqu’au ' + fmtD(ja.deadline.slice(0, 10)) : ''}</span></div>`;
  // mon prochain match (programmation du juge-arbitre)
  const next =
    mine && mine.row.next
      ? `<div class="note ok">${ic('clock')}<span>${mine.row.next.live ? 'Ton match' : 'Ton prochain match'} : ${jaNext(mine.row.next)}</span></div>`
      : '';
  let reg = '';
  if (ja.reg === 'ext')
    reg = `<div class="note">${ic('info')}Inscriptions : ${/^https?:\/\//.test(ja.where) ? `<a href="${esc(ja.where)}" target="_blank" rel="noopener">${esc(ja.where.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : esc(ja.where || 'auprès du juge-arbitre')}</div>`;
  else if (mine)
    reg = `<div class="note ok">${ic('check')}${ja.ani ? 'Tu es inscrit.' : `Tu es inscrit${mine.mate ? ' avec ' + esc(mine.mate) : ''}.`}</div>${ja.open ? `<div class="ctl"><button class="btn ghost grow" data-a="jaOut" data-id="${p.id}">Me désinscrire</button></div>` : ''}`;
  else if (ja.open)
    reg = `<div class="ctl"><button class="btn grow" data-a="jaIn" data-id="${p.id}">${ja.ani ? 'Je m’inscris' : 'Inscrire ma paire'}</button></div>`;
  else if (ja.status === 'open') reg = '<p class="muted small">Inscriptions closes.</p>';
  const list = (ja.list || []).length
    ? `<details class="more"><summary>Voir les inscrits (${ja.list.length})</summary><div class="in">${ja.list.map(x => `<div class="price"><span>${esc(x.n1)}${x.n2 ? ' / ' + esc(x.n2) : ''}</span>${x.k1 || x.k2 ? '<span class="tag ghost">Club</span>' : ''}</div>`).join('')}</div></details>`
    : '';
  const me = [ME(), ...((M[ME()] && M[ME()].kids) || [])];
  const res = (ja.results || []).length
    ? `<div class="ja-res"><span class="kicker">Résultats</span>${ja.results.map(r => `<div class="price ${(r.k || []).some(k => me.includes(k)) ? 'me' : ''}"><span><b>${jaPlace(r.place, r.lo)}</b> ${esc(r.n)}</span>${(r.k || []).length ? '<span class="tag lime">Club</span>' : ''}</div>`).join('')}</div>`
    : '';
  return `<span class="kicker">${kicker}</span><h2 class="tilt sm">${esc(p.title || 'Tournoi')}</h2><div class="ev">${meta}${status}${ja.prize ? `<p class="muted small">Dotation : ${esc(ja.prize)}</p>` : ''}${res}${next}${ja.status !== 'done' ? reg : ''}${list}</div>`;
}
