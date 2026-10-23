/* /RAM Club — ui/9-bar.js : Bar et club-house (onglet Club › Bar) : la carte, la réservation des repas,
   les commandes du jour pour le bureau.
   Les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
Object.assign(I, {
  cup: '<path d="M5 8h11v6a5 5 0 01-5 5h-1a5 5 0 01-5-5zM16 10h2a2 2 0 010 4h-2M8 3v2M11 3v2M14 3v2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>'
});
const BAR_CATS = ['Plat', 'Formule', 'Dessert', 'Boisson', 'Snack'];
const MOMENT = { midi: 'Midi', soir: 'Soir' };
/* les réservations d'un jour ferment la veille à l'heure choisie par le club (20 h par défaut) */
const barCut = () => (Number.isInteger(+CLUBINFO.barCut) ? +CLUBINFO.barCut : 20);
const barDeadline = iso => new Date(isoIn(-1, iso) + 'T' + String(barCut()).padStart(2, '0') + ':00').getTime();
/* maintenant : la vraie heure dans un vrai club ; midi du jour fictif dans la démo */
const barNow = () => {
  const d = new Date(),
    real =
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return TODAY === real ? Date.now() : new Date(TODAY + 'T12:00').getTime();
};
const barOpen = iso => barNow() < barDeadline(iso);
const barDay = iso => (iso === TODAY ? "Aujourd'hui" : iso === isoIn(1) ? 'Demain' : fmtD(iso));
const myBarKeys = () => [ME()].concat((M[ME()] && M[ME()].kids) || []);
const barItem = id => BAR.find(b => b.id === id);
/* points de participation : gagnés par le serveur (barème), dépensés en bons d'échange au bar */
const WALLET_L = {
  play: 'partie jouée',
  evt: 'événement',
  stage: 'stage',
  volu: 'coup de main bénévole',
  train: 'cours (présence confirmée)',
  team: 'rencontre d’équipe (dispo)'
};
const myWallet = () => {
  const w = (window.RAM && RAM.live && RAM.wallet) || WALLET,
    spent = REDEEMS.filter(r => r.by === ME() && r.st !== 'annule').reduce((a, r) => a + (+r.pts || 0), 0);
  return { earned: w.earned || 0, spent, balance: (w.earned || 0) - spent, rules: w.rules || WALLET.rules };
};
const barMoments = it => (Array.isArray(it.moments) && it.moments.length ? it.moments : ['midi', 'soir']);

function barView() {
  const B = S.bar,
    staff = isBureau(),
    days = [0, 1, 2, 3, 4, 5, 6].map(i => isoIn(i));
  if (!days.includes(B.d)) B.d = isoIn(1);
  const chip = (k, v, l) =>
    `<button class="chip" data-a="barSet" data-k="${k}" data-val="${v}" aria-pressed="${B[k] === v}">${l}</button>`;
  const top = staff
    ? `<div class="ctl"><button class="btn grow" data-a="barEdit">${ic('plus')}Ajouter un article</button><button class="btn ghost grow" data-a="barSet" data-k="v" data-val="${B.v === 'cmd' ? 'carte' : 'cmd'}">${ic(B.v === 'cmd' ? 'cup' : 'list')}${B.v === 'cmd' ? 'La carte' : 'Commandes'}</button></div>`
    : '';
  const when = `<div class="chips">${days.map(d => chip('d', d, barDay(d))).join('')}</div>`;
  if (staff && B.v === 'cmd') return `<div class="pad">${top}${barVouchers()}${when}${barOrders(B.d)}</div>`;
  const open = barOpen(B.d),
    mine = ORDERS.filter(o => myBarKeys().includes(o.by) && o.st !== 'annule'),
    list = BAR.filter(it => staff || it.on !== false),
    wal = myWallet(),
    bons = REDEEMS.filter(r => r.by === ME() && r.st === 'ok');
  const card = it => {
    const ok = it.on !== false && it.resa && barMoments(it).includes(B.m),
      got = mine.filter(o => o.item === it.id && o.date === B.d && o.moment === B.m).reduce((a, o) => a + o.qty, 0);
    return `<div class="card bar-it${it.on === false ? ' off' : ''}">${it.img ? `<span class="ph wide" style="background-image:url(${it.img})"></span>` : ''}
 <div class="row" style="align-items:flex-start;gap:10px"><span class="grow"><span class="h3">${esc(it.name)}</span>${it.desc ? `<br><span class="muted small">${esc(it.desc)}</span>` : ''}</span>${it.price ? `<b class="bar-price">${esc(it.price)}</b>` : ''}</div>
 <div class="row" style="gap:6px;flex-wrap:wrap">${barMoments(it)
   .map(m => `<span class="tag ghost">${MOMENT[m]}</span>`)
   .join(
     ''
   )}${it.resa ? '' : '<span class="tag ghost">Au bar seulement</span>'}${it.on === false ? '<span class="tag">Indisponible</span>' : ''}${got ? `<span class="tag lime">Réservé · ${got}</span>` : ''}</div>
 <div class="ctl">${ok ? (open ? `<button class="btn grow" data-a="barBook" data-id="${it.id}">Réserver pour ${barDay(B.d).toLowerCase()} ${MOMENT[B.m].toLowerCase()}</button>` : '<span class="muted small grow">Réservations closes pour ce jour</span>') : ''}${it.on !== false && +it.pts > 0 ? `<button class="btn ${ok ? 'ghost' : ''} grow" data-a="barRedeem" data-id="${it.id}" ${wal.balance < it.pts ? 'disabled' : ''}>${ic('trophy')}${wal.balance < it.pts ? `${it.pts} pts (il t’en manque ${it.pts - wal.balance})` : `Prendre avec ${it.pts} pts`}</button>` : ''}${staff ? `<button class="btn ghost" data-a="barEdit" data-id="${it.id}">${ic('edit')}Modifier</button>` : ''}</div></div>`;
  };
  const byCat = [...BAR_CATS, ...new Set(list.map(it => it.cat).filter(c => !BAR_CATS.includes(c)))]
    .map(c => {
      const l = list.filter(it => (it.cat || 'Plat') === c);
      return l.length ? `<span class="kicker">${esc(c)}s</span>${l.map(card).join('')}` : '';
    })
    .join('');
  const next = mine.filter(o => o.date >= TODAY).sort((a, b) => (a.date + a.moment).localeCompare(b.date + b.moment));
  const wcard = `<div class="card wallet"><div class="row" style="gap:12px"><span class="medal t2">${ic('trophy')}</span><span class="grow"><span class="kicker">Mes points de participation</span><br><b class="wal-n">${wal.balance} pts</b><span class="muted small"> · ${wal.earned} gagnés${wal.spent ? `, ${wal.spent} échangés` : ''}</span></span></div>
 <details class="more"><summary>Comment gagner des points</summary><div class="in">${Object.entries(wal.rules)
   .map(([k, n]) => `<div class="price"><span>${WALLET_L[k] || k}</span><b>+${n}</b></div>`)
   .join(
     ''
   )}<p class="muted small">Échange-les au bar contre une boisson ou un verre offert : cherche le bouton « Prendre avec … pts ».</p></div></details>
 ${bons.length ? `<span class="kicker">Mes bons à utiliser</span>${bons.map(r => `<div class="item"><span class="tile">${ic('cup')}</span><span class="grow"><span class="nm">${esc(r.name)}</span><br><span class="muted small">${r.pts} pts · bon ${barCode(r)}</span></span><button class="btn sm" data-a="barVoucher" data-id="${r.id}">Montrer au bar</button></div>`).join('')}` : ''}</div>`;
  return `<div class="pad">${top}${wcard}<p class="muted small">Réserve ton repas à l'avance : le club prévoit les quantités. Réservations jusqu'à la veille, ${barCut()} h.${CLUBINFO.house ? ' Club-house : ' + esc(CLUBINFO.house) + '.' : ''}</p>
 ${when}<div class="chips">${chip('m', 'midi', 'Midi')}${chip('m', 'soir', 'Soir')}</div>
 ${open ? '' : `<div class="note">Les réservations pour ${barDay(B.d).toLowerCase()} sont closes depuis la veille, ${barCut()} h. Les articles restent en vente au bar.</div>`}
 ${byCat || empty('cup', 'La carte est vide', staff ? 'Ajoute les plats et boissons du bar.' : 'Le bureau ajoutera bientôt la carte du bar.')}
 ${
   next.length
     ? `<div><span class="kicker">Mes réservations</span>${next
         .map(o => {
           const [, m, d] = o.date.split('-').map(Number);
           return `<div class="item"><span class="dblk"><b>${d}</b>${MO[m - 1]}</span><span class="grow"><span class="nm">${o.qty} × ${esc(o.name)}</span><br><span class="muted small">${MOMENT[o.moment]}${o.price ? ' · ' + esc(o.price) : ''}${o.note ? ' · ' + esc(o.note) : ''}${o.by !== ME() && M[o.by] ? ' · pour ' + first(o.by) : ''}</span></span>${o.st === 'servi' ? '<span class="tag lime">Servi</span>' : barOpen(o.date) ? `<button class="btn sm ghost" data-a="barCancel" data-id="${o.id}">Annuler</button>` : '<span class="tag ghost">Confirmé</span>'}</div>`;
         })
         .join('')}</div>`
     : ''
 }</div>`;
}
/* code court d'un bon, à vérifier au bar */
const barCode = r =>
  String(r.id || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-4)
    .toUpperCase();
/* Bureau : bons d'échange à remettre au bar (les plus récents d'abord) */
function barVouchers() {
  const l = REDEEMS.filter(r => r.st === 'ok').sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!l.length) return '';
  return `<section class="card" style="gap:0"><span class="kicker">Bons à remettre · ${l.length}</span>${l
    .map(
      r =>
        `<div class="item">${av(r.by, 'sm')}<span class="grow"><span class="nm">${name(r.by)}</span><br><span class="muted small">${esc(r.name)} · ${r.pts} pts · bon ${barCode(r)}</span></span><button class="btn sm" data-a="barGive" data-id="${r.id}">Remis</button></div>`
    )
    .join('')}</section>`;
}
/* Bureau : commandes d'un jour (demain par défaut), midi puis soir : total par article, puis qui a commandé quoi */
function barOrders(iso) {
  const day = ORDERS.filter(o => o.date === iso && o.st !== 'annule');
  if (!day.length)
    return empty('cup', 'Aucune réservation', `Rien de réservé pour ${barDay(iso).toLowerCase()} pour l'instant.`);
  return ['midi', 'soir']
    .map(m => {
      const l = day.filter(o => o.moment === m);
      if (!l.length) return '';
      const tot = {};
      l.forEach(o => {
        tot[o.name] = (tot[o.name] || 0) + o.qty;
      });
      const n = l.reduce((a, o) => a + o.qty, 0),
        served = l.filter(o => o.st === 'servi').length;
      return `<section class="card" style="gap:0"><span class="kicker">${MOMENT[m]} · ${n} article${n > 1 ? 's' : ''} · ${served}/${l.length} servi${l.length > 1 ? 's' : ''}</span>
 ${Object.entries(tot)
   .sort((a, b) => b[1] - a[1])
   .map(([k, q]) => `<div class="price"><span class="nm">${esc(k)}</span><b>× ${q}</b></div>`)
   .join('')}
 <div style="margin-top:10px">${l
   .map(
     o =>
       `<div class="item">${av(o.by, 'sm')}<span class="grow"><span class="nm">${name(o.by)}</span><br><span class="muted small">${o.qty} × ${esc(o.name)}${o.note ? ' · ' + esc(o.note) : ''}</span></span>${o.st === 'servi' ? `<button class="tag lime" data-a="barServe" data-id="${o.id}">Servi</button>` : `<button class="btn sm" data-a="barServe" data-id="${o.id}">Servi</button>`}</div>`
   )
   .join('')}</div></section>`;
    })
    .join('');
}
