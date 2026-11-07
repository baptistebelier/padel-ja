/* /RAM Club — ui/1-briques.js : Briques communes : catégories, classements, avatars, petits éléments réutilisés partout.
   Morceau de l'ancien ui.js : les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* Briques d'interface et écrans */
const hue = id => [...id].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
const ini = id =>
  M[id].n
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2);
const av = (id, c = '') =>
  id === 'club'
    ? `<span class="av club ${c} ${club().logo ? 'logo' : ''}" ${club().logo ? `style="background-image:url(${club().logo})"` : ''}>${club().logo ? '' : club().short}</span>`
    : M[id].photo
      ? `<span class="av ${c}${frc(id)}" style="background-image:url(${M[id].photo})"></span>`
      : `<span class="av ${c}${frc(id)}" style="--h:${hue(id)}">${ini(id)}</span>`;
/* Jamais d'âge affiché : une catégorie à la place (U12, Senior, +45…) */
const catOf = id => {
  const a = age(id);
  if (a < 18) return 'U' + (Math.floor(a / 2) * 2 + 2);
  if (a < 35) return 'Senior';
  return '+' + (a >= 75 ? 75 : a >= 65 ? 65 : a >= 55 ? 55 : a >= 45 ? 45 : 35);
};
const seesMinors = () => isAdmin() || S.role === 'coach';
/* Les résultats d'un jeune ne sont visibles que de lui, de son groupe, de ses parents et des encadrants */
const kidOk = k =>
  ME() === k ||
  seesMinors() ||
  (M[ME()].kids || []).includes(k) ||
  GROUPS.some(g => g.type === 'train' && g.mem.includes(k) && g.mem.includes(ME()));
const RC = {
  Club: 'club',
  Enseignante: 'coach',
  Enseignant: 'coach',
  Président: 'pres',
  Gérant: 'pres',
  Capitaine: 'cap'
};
/* Un seul classement par personne, choisi selon le sport de l'écran */
const rk = (id, sport) => {
  const m = M[id],
    tn = m.r && m.r !== 'NC' ? m.r + ' Tennis' : '',
    pd = m.pl ? 'Niv ' + m.pl + ' Padel' : '';
  return sport === 'Padel' ? pd || tn : tn || pd;
};
function bd(id, sport) {
  if (id === 'club') return '<span class="bds"><span class="bd club">Club</span></span>';
  const m = M[id],
    r = rk(id, sport);
  // juge-arbitre /RAM JA : son titre (JAP2, JAT1…) en badge
  const ja = (window.RAM && RAM.jaTitles && RAM.jaTitles[id]) || [];
  return `<span class="bds">${m.role ? `<span class="bd ${RC[m.role] || ''}">${m.role}</span>` : ''}${r ? `<span class="bd rk">${r}</span>` : ''}${ja.length ? `<span class="bd ja" title="Juge-arbitre /RAM JA">JA ${ja.join(' · ')}</span>` : ''}</span>`;
}
/* avatar d'un adhérent qui ouvre son profil (comme son nom) ; le club et soi-même restent de simples images */
const avLink = (id, c = '') =>
  id === 'club' || id === ME() || !M[id]
    ? av(id, c)
    : `<button class="avlink" data-a="member" data-id="${id}" aria-label="Profil de ${name(id)}">${av(id, c)}</button>`;
const who = id =>
  id === 'club' || id === ME()
    ? `<span class="nm">${name(id)}</span>`
    : `<button class="nm" data-a="member" data-id="${id}">${name(id)}</button>`;
const view = () => (S.stack.length ? S.stack[S.stack.length - 1] : { v: S.tab });
/* onglets d'une page ; à partir de 4 onglets (avec pictogrammes), sur téléphone : tous tiennent dans la largeur,
   seul l'onglet ouvert affiche son titre à côté de son pictogramme (plus besoin de faire défiler) */
const segs = (k, tabs) =>
  `<div class="seg${tabs.length > 3 && tabs.every(t => t[2]) ? ' ico' : ''}" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${S[k] === t[0]}" aria-label="${t[1]}" data-a="seg" data-k="${k}" data-val="${t[0]}">${t[2] ? ic(t[2]) : ''}<span class="lb">${t[1]}</span></button>`).join('')}</div>`;
const sportTag = s => (s ? `<span class="tag ${s === 'Padel' ? 'padel' : 'tennis'}">${s}</span>` : '');
function teamTags(tid) {
  const g = grp(tid),
    c = champOf(g);
  if (!c) return '';
  return (
    sportTag(c.sport) +
    `<span class="tag ${g.gen === 'Femmes' ? 'f' : ''}">${g.gen}</span><span class="tag">${c.age}</span>`
  );
}
const stPill = r =>
  r.st === 'live'
    ? '<span class="live"><i></i>En direct</span>'
    : r.st === 'done'
      ? '<span class="bd">Terminé</span>'
      : '<span class="bd">À venir</span>';
const empty = (icn, t, s) =>
  `<div class="empty">${ic(icn)}<span class="nm" style="color:var(--fg)">${t}</span><span class="small">${s || ''}</span></div>`;
const emptyCard = (icn, t, s) => `<div class="card">${empty(icn, t, s)}</div>`;
const gallery = ph =>
  ph && ph.length
    ? `<div class="gal ${ph.length === 1 ? 'one' : ''}">${ph.map((u, i) => `<button class="ph" style="background-image:url(${u})" data-a="photo" aria-label="Photo ${i + 1} sur ${ph.length}"></button>`).join('')}</div>`
    : '';

/* carte d'événement, la même dans /RAM Club et /RAM Coach : l'heure seule (le jour est sur l'étiquette épinglée au-dessus),
   le titre, une ligne par information avec son picto, les étiquettes ; un grand picto en fond rappelle ce que c'est */
const EV_PIC = { ens: 'cCours', jeu: 'ball', ani: 'cal', tour: 'cTour', eq: 'users', repas: 'cRepas' };
/* l'heure de fin d'un créneau : « 14 h » + 90 min → « 15 h 30 » */
const hFin = (t, dur) => {
  if (!t || !(dur > 0)) return '';
  const m = hMin(t) + dur;
  return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
};
const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/* pastille de la carte : l'heure de début, et celle de fin en dessous ; avec o.dt (liste d'événements du mur) : la date en grand */
const evHead = o => {
  if (o.dt) {
    const d = new Date(o.dt + 'T12:00');
    return `<span class="evh evd"><b>${d.getDate()}</b><small>${DAYS[d.getDay()].slice(0, 3)}. ${MOIS_C[d.getMonth()]}</small><i>${o.t ? o.t + (o.t2 ? ' – ' + o.t2 : '') : 'Journée'}</i></span>`;
  }
  return `<span class="evh">${o.t || 'Journée'}${o.t && o.t2 ? `<small>à ${o.t2}</small>` : ''}</span>`;
};
const evCard = o => {
  const el = o.foot || o.fixe ? 'div' : 'button';
  return `<${el} class="card evx ${o.cat || 'ens'}${o.cx ? ' cx' : ''}" ${o.go || ''}>${evHead(o)}<span class="evb"><span class="evt">${o.title}</span>${(
    o.lines || []
  )
    .filter(Boolean)
    .map(([i, x, c]) => `<span class="evl${c ? ' ' + c : ''}">${ic(i)}<span>${x}</span></span>`)
    .join(
      ''
    )}${o.tags ? `<span class="tags evg">${o.tags}</span>` : ''}</span><span class="evpic" aria-hidden="true">${ic(o.pic || EV_PIC[o.cat] || 'cal')}</span>${o.foot ? `<div class="evf">${o.foot}</div>` : ''}</${el}>`;
};
const evLabel = iso => (iso === TODAY ? "Aujourd'hui · " : iso === isoIn(1) ? 'Demain · ' : '') + fmtD(iso);
/* un jour : son étiquette reste en haut de l'écran tant qu'on est dans ses cartes, la suivante la remplace */
const evDay = (iso, rows, c = '') =>
  `<section class="plc${c ? ' ' + c : ''}${iso === TODAY ? ' today' : ''}"><h2 class="evday"><span>${evLabel(iso)}</span></h2>${rows}</section>`;
/* une liste déjà triée, regroupée par jour */
const evDays = (l, dateOf, carte) => {
  const out = [];
  l.forEach(x => {
    const d = dateOf(x);
    if (!out.length || out[out.length - 1][0] !== d) out.push([d, []]);
    out[out.length - 1][1].push(carte(x));
  });
  return out.map(([d, c]) => evDay(d, c.join(''))).join('');
};
const evTag = t => `<span class="tag">${t}</span>`;
const evCx = t => `<span class="tag" style="background:var(--hot);color:#fff">${t}</span>`;
const evLoc = l => `<span class="tag loc">${ic(l === 'En salle' ? 'home' : 'sun')}${l}</span>`;

function recCard(r) {
  const g = grp(r.tid),
    s = teamScore(r);
  return `<button class="rec" data-a="open" data-v="rec" data-id="${r.id}"><span class="row" style="justify-content:space-between"><span class="tags">${teamTags(r.tid)}</span>${stPill(r)}</span>
 <span class="vs"><span class="t">${teamName(g)}<br><span class="muted small" style="font-weight:500">${club().name}</span></span><span class="n" data-live2="${r.id}">${r.st === 'soon' ? '–' : `<b>${s[0]}</b> · ${s[1]}`}</span><span class="t">${r.opp}</span></span>
 <span class="muted small">${r.comp} · ${r.when}</span></button>`;
}
