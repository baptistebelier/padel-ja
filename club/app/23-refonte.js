/* /RAM Club — app/23-refonte.js : refonte de l'agencement (maquette Figma « Refonte /Buvette », 10/11/2026).
   Sur iPad paysage et ordinateur, certaines pages passent en deux colonnes (bento) :
   - Groupes : la liste et la discussion ouverte côte à côte ;
   - Agenda : la liste ou la grille, avec le mois et les filtres toujours visibles à droite.
   Sur téléphone, rien ne change ici : les pages gardent leur colonne unique. */
const wideNav = () => matchMedia('(min-width: 1024px)').matches;

/* ---------- Groupes : liste + discussion ---------- */
const chansListView = V.chans;
V.chans = () => {
  const h = chansListView();
  if (!wideNav()) return h;
  const list = chans.filter(c => c.g === S.chanTab && chanOk(c)),
    c = list.find(x => x.id === S.chanSel) || list[0];
  const i = h.indexOf('<div class="lis">');
  if (!c || i < 0) return h;
  S.chanSel = c.id;
  c.un = 0;
  const left = h
    .slice(i)
    .replace(
      `data-a="open" data-v="chan" data-id="${c.id}"`,
      `data-a="open" data-v="chan" data-id="${c.id}" aria-current="true"`
    );
  const ro = c.ro && !isAdmin(),
    composer = ro
      ? '<div class="muted small schro">Seul le club publie dans ce groupe.</div>'
      : `<div class="att" id="att" hidden></div><form class="composer" id="composer"><label class="attach" aria-label="Joindre une photo">${ic('image')}<input type="file" id="m-img" accept="image/*"></label><textarea id="msg-input" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="${c.ro ? 'Publier au nom du club' : 'Écrire dans ' + esc(c.name)}" aria-label="Message"></textarea><button class="send" aria-label="Envoyer">${ic('send')}</button></form>`;
  // la discussion s'ouvre sur ses derniers messages
  requestAnimationFrame(() => {
    const b = document.querySelector('.schb');
    if (b) b.scrollTop = b.scrollHeight;
  });
  return (
    h.slice(0, i) +
    `<div class="split2"><div class="splitl">${left}</div><section class="splitchat" aria-label="Discussion ${esc(c.name)}"><header class="sch"><span class="tile">${ic(c.g === 'team' ? 'users' : c.g === 'train' ? 'ball' : 'chat')}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.desc || '')}</small></span>${typeof chanCfgBtn === 'function' ? chanCfgBtn(c) : ''}</header><div class="schb">${V.chan(c.id)}</div><div class="schf">${composer}</div></section></div>`
  );
};
/* sur grand écran, toucher un groupe de la liste l'ouvre à côté, sans quitter la page */
const openSplit = A.open;
A.open = d => {
  if (d && d.v === 'chan' && wideNav() && S.tab === 'chans' && !S.stack.length) {
    closeSheet();
    S.chanSel = d.id;
    const c = chans.find(x => x.id === d.id);
    if (c) c.un = 0;
    render(true);
    const t = $('msg-input');
    if (t) t.focus();
    return;
  }
  return openSplit(d);
};

/* ---------- Agenda : mois et filtres à droite ---------- */
const MOIS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre'
];
function calMonth() {
  const P = S.plan,
    [y, m] = P.d.split('-').map(Number),
    first = new Date(y, m - 1, 1),
    lead = (first.getDay() + 6) % 7,
    n = new Date(y, m, 0).getDate(),
    iso = d => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cmd off"></span>';
  for (let d = 1; d <= n; d++) {
    const k = iso(d),
      busy = planItems(k).length > 0;
    cells += `<button class="cmd${k === TODAY ? ' today' : ''}${k === P.d && P.mode === 'day' ? ' on' : ''}${busy ? ' busy' : ''}" data-a="planDay" data-d="${k}" aria-label="${fmtD(k)}${busy ? ', ' + planItems(k).length + ' rendez-vous' : ''}">${d}</button>`;
  }
  return `<div class="card calm"><div class="calh">${ic('cal')}<b>${MOIS[m - 1]} ${y}</b><span class="grow"></span><button class="ib" data-a="calMois" data-n="-1" aria-label="Mois précédent">${ic('back')}</button><button class="ib" data-a="calMois" data-n="1" aria-label="Mois suivant" style="rotate:180deg">${ic('back')}</button></div><div class="cmg">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="cmw">${x}</span>`).join('')}${cells}</div></div>`;
}
A.calMois = d => {
  const [y, m] = S.plan.d.split('-').map(Number),
    t = new Date(y, m - 1 + +d.n, 1);
  S.plan.d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`;
  render(true);
};
A.calReset = () => {
  Object.keys(S.plan.cat).forEach(k => (S.plan.cat[k] = 1));
  S.plan.sp = { Tennis: 1, Padel: 1 };
  S.plan.mine = false;
  render(true);
};
const agendaPageView = V.agenda;
V.agenda = () => {
  const h = agendaPageView();
  if (!wideNav()) return h;
  const i = h.indexOf('<div class="pad" id="plan">');
  if (i < 0) return h;
  // les filtres, toujours visibles à droite (sans le bouton « Voir l'agenda » du panneau)
  const filt = planFiltersBody()
    .replace(
      /<div class="ctl">[\s\S]*<\/div><\/div>$/,
      '<div class="ctl"><button class="btn ghost grow" data-a="calReset">Tout afficher</button></div></div>'
    )
    .replace('<div class="body">', '');
  return (
    h.slice(0, i) +
    `<div class="bento2"><div class="bmain">${h.slice(i)}</div><aside class="bside">${calMonth()}<div class="card calf"><div class="calh">${ic('filter')}<b>Filtres</b></div>${filt}</div></aside></div>`
  );
};

/* ---------- Profil : sous-menu à 4 entrées, en-tête compact, deux colonnes sur grand écran ---------- */
const sectionAt = (h, tag, start) => {
  // fin de la balise <tag> ouverte à « start », en tenant compte des balises imbriquées
  const re = new RegExp('<' + tag + '[ >]|</' + tag + '>', 'g');
  re.lastIndex = start;
  let d = 0,
    m;
  while ((m = re.exec(h))) {
    d += m[0][1] === '/' ? -1 : 1;
    if (!d) return m.index + m[0].length;
  }
  return -1;
};
const profilView = V.me;
V.me = () => {
  let h = profilView();
  const T = ['jeu', 'infos', 'reglages'].includes(S.meTab) ? S.meTab : 'jeu',
    it = (k, i, l) =>
      `<button role="tab" aria-selected="${T === k}" aria-label="${l}" data-a="meTab" data-k="${k}">${ic(i)}<span class="lb">${l}</span></button>`,
    seg = `<div class="seg mesub" role="tablist">${it('jeu', 'trophy', 'Mon jeu')}${it('infos', 'info', 'Mes infos')}${it('reglages', 'gear', 'Réglages')}<button role="tab" aria-selected="false" aria-label="Investissement" data-a="open" data-v="trophies" data-id="${ME()}">${ic('star')}<span class="lb">Investissement</span></button></div>`;
  // les anciens onglets internes laissent la place au sous-menu
  h = h.replace(/<div class="bar-tabs me-tabs"[\s\S]*?<\/div>/, '');
  // le bloc du club (investissement, gestion) passe dans la colonne de droite
  let club = '';
  const ic0 = h.indexOf('<section class="meclub">');
  if (ic0 >= 0) {
    const e = sectionAt(h, 'section', ic0);
    if (e > 0) {
      club = h.slice(ic0, e);
      h = h.slice(0, ic0) + h.slice(e);
    }
  }
  // en-tête compact : identité et chiffres dans la même carte
  const p0 = h.indexOf('<div class="phero">'),
    s0 = h.indexOf('<div class="stats">'),
    s1 = s0 >= 0 ? sectionAt(h, 'div', s0) : -1;
  if (p0 < 0 || s1 < 0) return seg + h;
  const head = `<div class="mehead">${h.slice(p0, s1)}</div>`,
    lo = h.indexOf('<button class="btn ghost full logout"'),
    endBody = lo >= 0 ? lo : h.lastIndexOf('</div>'),
    body = h.slice(s1, endBody),
    tail = h.slice(endBody);
  return (
    seg +
    h.slice(0, p0) +
    head +
    `<div class="bentop"><div class="bpl">${body}</div><aside class="bpr">${club}</aside></div>` +
    tail
  );
};

/* ---------- École, Mes cours : à droite, mon enseignant, mon dernier bilan, l'analyse vidéo ---------- */
function ecoleSide() {
  const me = ME(),
    g = GROUPS.find(x => x.type === 'train' && (x.mem || []).includes(me)),
    k = g && g.coach && M[g.coach] ? g.coach : null;
  let h = '';
  if (k) {
    const p = M[k].pro || {},
      info = [p.dip, p.since ? new Date().getFullYear() - +p.since + ' ans d’enseignement' : '', p.sports]
        .filter(Boolean)
        .join(' · ');
    h += `<div class="card ecs"><div class="calh">${ic('user')}<b>${M[k].g === 'F' ? 'Mon enseignante' : 'Mon enseignant'}</b></div><div class="row" style="gap:12px">${av(k)}<span class="grow"><span class="nm">${esc(M[k].n)}</span>${info ? `<br><span class="muted small">${esc(info)}</span>` : ''}</span></div><div class="ctl">${typeof dmStudent === 'function' && dmStudent(me) ? `<button class="btn ghost grow" data-a="open" data-v="dm" data-id="${me}">${ic('chat')}Écrire</button>` : ''}<button class="btn ghost grow" data-a="member" data-id="${k}">${ic('user')}Sa fiche</button></div></div>`;
  }
  const b =
    typeof svOf === 'function'
      ? svOf(me)
          .filter(x => x.k === 'bilan')
          .pop()
      : null;
  if (b)
    h += `<div class="card ecs"><div class="calh">${ic('news')}<b>Dernier bilan</b></div><p class="ecb">${esc(b.txt || '')}</p><button class="btn ghost full" data-a="seg" data-k="ecTab" data-val="perso">Voir mon espace</button></div>`;
  if (typeof dmStudent === 'function' && dmStudent(me) && typeof dmCanWrite === 'function' && dmCanWrite(me))
    h += `<div class="card ecs"><div class="calh">${ic('video')}<b>Analyse vidéo</b></div><p class="muted small">Envoie une vidéo de ton match : ton enseignant te répond avec ses remarques.</p><button class="btn ghost" data-a="svVideo" data-id="${me}">${ic('video')}Envoyer une vidéo</button></div>`;
  return h;
}
const ecolePageView = V.ecole;
V.ecole = () => {
  const h = ecolePageView();
  if (!wideNav() || S.ecTab !== 'mine') return h;
  const side = ecoleSide(),
    i = h.indexOf('<div class="pad">');
  if (!side || i < 0) return h;
  return (
    h.slice(0, i) +
    `<div class="bento2"><div class="bmain">${h.slice(i)}</div><aside class="bside">${side}</aside></div>`
  );
};

/* ---------- Club, Bar : à droite, mes points et mes réservations ---------- */
const barPageView = barView;
barView = function () {
  let h = barPageView();
  if (!wideNav()) return h;
  const cut = (start, tag) => {
    const i = h.indexOf(start);
    if (i < 0) return '';
    const e = sectionAt(h, tag, i);
    if (e < 0) return '';
    const s = h.slice(i, e);
    h = h.slice(0, i) + h.slice(e);
    return s;
  };
  const wal = cut('<section class="card wallet">', 'section'),
    resa = cut('<div><span class="kicker">Mes réservations</span>', 'div');
  if (!wal && !resa) return h;
  const p = h.indexOf('<div class="pad">'),
    e = p >= 0 ? sectionAt(h, 'div', p) : -1;
  if (p < 0 || e < 0) return h;
  return (
    h.slice(0, p) +
    `<div class="bento2"><div class="bmain">${h.slice(p, e)}</div><aside class="bside">${wal}${resa ? `<div class="card ecs">${resa}</div>` : ''}</aside></div>` +
    h.slice(e)
  );
};
