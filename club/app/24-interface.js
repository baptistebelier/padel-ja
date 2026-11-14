/* /RAM Club — app/24-interface.js : nouvelle organisation de /Buvette (maquette Figma « /Buvette · Nouvelle interface »,
   validée par Baptiste le 14/11/2026). En place pour tout le monde, sans interrupteur d'essai.
   Ce fichier n'est chargé que par index.html (/Buvette) : /Dojo (coach.html) garde ses propres onglets.
   Étape 1 — navigation : 5 rubriques (Accueil, Agenda, Jouer, Messages, Club) ; « Moi » s'ouvre en touchant l'avatar
   (en bas du menu sur grand écran) ; « Groupes » devient « Messages » ; « Publier » dans l'en-tête de l'Accueil,
   à la place du bouton + flottant ; les anciennes adresses (École > Mes cours, Club > Équipes…) mènent à leur nouvelle place. */

/* ---------- le menu : 5 rubriques ; École et Moi restent des pages, sans entrée dans le menu ---------- */
const BV_MENU = [
  ['home', 'home', 'Accueil'],
  ['agenda', 'cal', 'Agenda'],
  ['jouer', 'ball', 'Jouer'],
  ['chans', 'chat', 'Messages'],
  ['club', 'flag', 'Club']
];
const BV_HORS = [
  ['ecole', 'school', 'École'],
  ['me', 'user', 'Moi']
];
TABBAR.splice(0, TABBAR.length, ...BV_MENU, ...BV_HORS);
const bvHors = k => BV_HORS.some(x => x[0] === k);
/* la rubrique du menu qui reste allumée pour une page hors menu : l'École s'ouvre depuis Club */
const BV_PARENT = { ecole: 'club' };
if (!S.jouTab) S.jouTab = 'parties';
// Équipes n'est plus le premier sous-onglet de Club (il est parti dans Jouer)
if (S.clubTab === 'teams') S.clubTab = 'club';

/* ---------- titres : le nom de la rubrique en grand, son explication au-dessus (maquette) ---------- */
Object.assign(TITLES, {
  home: () => ['Accueil', 'Le mur du club'],
  chans: () => ['Messages', club().name],
  agenda: () => ['Agenda', S.plan.scope === 'me' ? 'Tout ce où je suis inscrit' : 'Ce que le club organise'],
  jouer: () => ['Jouer', 'Parties, équipes, résultats'],
  club: () => ['Club', club().name],
  ecole: () => ['École', 'Cours et stages'],
  me: () => ['Moi', S.super ? 'Administrateur' : 'Mon profil']
});
Object.assign(SECTION, {
  chans: 'Messages',
  agenda: 'Agenda',
  jouer: 'Jouer',
  club: 'Club',
  ecole: 'École',
  me: 'Moi'
});
// l'en-tête porte le nom de la rubrique (le sous-menu dit déjà où l'on est)
ENTREE.agenda = () => '';
ENTREE.chans = () => '';
ENTREE.club = () => '';

/* ---------- les anciennes adresses mènent à leur nouvelle place (liens des notifications, anciens boutons) ---------- */
function bvPlace() {
  // École > Mes cours : les cours sont dans Mon agenda, avec la présence
  if (S.tab === 'ecole' && S.ecTab === 'mine') {
    S.tab = 'agenda';
    S.plan.scope = 'me';
    if (!['events', 'week', 'day'].includes(S.plan.mode)) S.plan.mode = 'events';
  }
  // Club > Équipes : dans Jouer
  if (S.tab === 'club' && S.clubTab === 'teams') {
    S.tab = 'jouer';
    S.jouTab = 'equipes';
    S.clubTab = 'club';
  }
}
const bvRender = render;
render = function (keep) {
  bvPlace();
  return bvRender(keep);
};
const bvTab = A.tab;
A.tab = d => {
  // Moi au téléphone : une page posée sur la rubrique en cours (avec un retour), comme dans la maquette
  if (d.t === 'me' && !sideNav()) {
    closeSheet();
    if (S.tab === 'me') S.tab = 'home';
    if (S.stack.length === 1 && S.stack[0].v === 'me') return;
    S.dir = 1;
    S.stack = [{ v: 'me' }];
    render();
    return;
  }
  if (d.t === 'ecole' && S.ecTab === 'mine') {
    S.plan.scope = 'me';
    d = { ...d, t: 'agenda' };
  }
  return bvTab(d);
};
const bvGoClub = A.goClub;
A.goClub = d => {
  if (d.t === 'teams') {
    S.jouTab = 'equipes';
    A.tab({ t: 'jouer' });
    return;
  }
  return bvGoClub(d);
};
/* Club : Équipes est parti dans Jouer */
const bvClubView = V.club;
V.club = id => {
  if (S.clubTab === 'teams') S.clubTab = 'club';
  return bvClubView(id).replace(/<button role="tab"[^>]*data-val="teams"[^>]*>[\s\S]*?<\/button>/, '');
};

/* ---------- Jouer : parties ouvertes, équipes, résultats ---------- */
const bvPartiesOuvertes = () =>
  posts.filter(p => p.kind === 'play' && !p.arch && canSee(p) && (!p.play || !p.play.d || p.play.d >= TODAY));
V.jouer = () => {
  const tabs = [
    ['parties', 'Parties', 'ball'],
    ['equipes', 'Équipes', 'users'],
    ['resultats', 'Résultats', 'trophy']
  ];
  if (!tabs.some(t => t[0] === S.jouTab)) S.jouTab = 'parties';
  const seg = segs('jouTab', tabs).replace('class="seg ico"', 'class="seg"');
  if (S.jouTab === 'equipes') return seg + teamsBody();
  if (S.jouTab === 'resultats') return seg + bvResultats();
  const l = bvPartiesOuvertes();
  return (
    seg +
    `<div class="pad">${S.role === 'kid' ? '' : `<button class="btn full" data-a="newPost" data-k="play">${ic('plus')}Proposer une partie</button>`}<span class="kicker">Parties ouvertes · ${l.length}</span></div><div class="feed">${
      l.length
        ? l.map(postHTML).join('')
        : `<div class="pad">${empty('ball', 'Aucune partie ouverte', 'Propose la première : les adhérents de ton niveau sont prévenus.')}</div>`
    }</div>`
  );
};
/* Résultats : le palmarès et « Ajouter un résultat » (venus de Profil > Mon jeu) */
function bvResultats() {
  const me = ME(),
    trn = posts
      .filter(p => p.kind === 'event' && p.trn && !p.arch && canSee(p) && (p.d2 || p.d || TODAY) >= TODAY)
      .sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')));
  return `<div class="pad">${meTabBody('jeu', me, M[me], isMinor(me))}</div>${
    trn.length
      ? `<div class="pad"><span class="kicker">Tournois du club · ${trn.length}</span></div><div class="feed">${trn.map(postHTML).join('')}</div>`
      : ''
  }`;
}

/* ---------- après chaque affichage : menu, avatar « Moi », bouton Publier ---------- */
function bvNav() {
  const tabs = $('tabs'),
    v = view().v,
    main = !S.stack.length;
  if (tabs) {
    tabs.querySelectorAll('button[data-t]').forEach(b => {
      if (bvHors(b.dataset.t)) b.remove();
    });
    // une page hors menu allume sa rubrique (École → Club)
    const par = BV_PARENT[S.tab];
    if (par && main) {
      const b = tabs.querySelector(`button[data-t="${par}"]`);
      if (b) {
        b.setAttribute('aria-current', 'page');
        if (typeof pillTo === 'function') pillTo(b, true);
      }
    }
  }
  // grand écran : « Moi » en bas du menu, avec l'avatar
  const rb = $('rbot');
  if (rb) {
    const p = rb.querySelector('button[data-t="me"]');
    if (p) {
      const s = p.querySelector('span:last-child');
      if (s) s.textContent = 'Moi';
      p.setAttribute('aria-label', 'Moi : mon profil');
    }
  }
  // plus de bouton + flottant
  const fab = $('addfab');
  if (fab) fab.hidden = true;
  $('phone').classList.remove('fab');
  const top = $('top');
  if (!top) return;
  top.querySelectorAll('.bvme,.bvpub').forEach(e => e.remove());
  if (sideNav()) return;
  const bell = top.querySelector('[data-a="notifs"]');
  // téléphone : Publier dans l'en-tête de l'Accueil
  if (v === 'home' && main && canPublish() && !pending() && bell)
    bell.insertAdjacentHTML(
      'beforebegin',
      `<button class="ib acc bvpub" data-a="plus" aria-label="Publier">${ic('plus')}</button>`
    );
  // téléphone : l'avatar ouvre « Moi », en haut de chaque rubrique
  const me = ME();
  if (main && v !== 'me' && M[me])
    top.insertAdjacentHTML(
      'beforeend',
      `<button class="ib bvme" data-a="tab" data-t="me" aria-label="Moi : mon profil">${av(me, 'sm')}</button>`
    );
}
const bvRail = ramRail;
ramRail = function (t, sub) {
  bvRail(t, sub);
  bvNav();
};

/* =========================================================================
   Étape 2 — Accueil : « Pour moi » (direct, convocation, prochain cours et présence, repas réservé),
   3 raccourcis, fil filtrable, feuille « Publier » courte. Sur grand écran, « Pour moi », les raccourcis
   et les messages non lus forment la colonne de droite.
   ========================================================================= */
I.court = '<rect x="5" y="3" width="14" height="18"/><path d="M5 12h14M9 3v18M15 3v18"/>';
I.chev = '<path d="M9 5l7 7-7 7"/>';
if (!S.murF) S.murF = 'all';

/* le prochain cours de moi et de mes enfants (14 jours), le plus proche d'abord */
function bvProchainsCours(n) {
  const me = ME(),
    whos = [me].concat((M[me] && M[me].kids) || []),
    now = new Date(),
    nowMin = now.getHours() * 60 + now.getMinutes(),
    l = [];
  GROUPS.filter(g => g.type === 'train').forEach(g =>
    whos
      .filter(w => (g.mem || []).includes(w))
      .forEach(w => {
        const iso = sessions(g, 14).find(
          d => !(g.cancel || []).includes(d) && (d > TODAY || hMin(hAt(g, d)) + REGLES.durMin(durAt(g, d)) > nowMin)
        );
        if (iso) l.push({ g, iso, w });
      })
  );
  return l.sort((a, b) => a.iso.localeCompare(b.iso) || hMin(hAt(a.g, a.iso)) - hMin(hAt(b.g, b.iso))).slice(0, n);
}
/* mon prochain repas réservé au bar */
const bvRepas = () =>
  typeof ORDERS === 'undefined' || !CLUBINFO.mods.bar
    ? null
    : ORDERS.filter(o => myBarKeys().includes(o.by) && o.st !== 'annule' && o.st !== 'servi' && o.date >= TODAY).sort(
        (a, b) => (a.date + (a.moment === 'soir' ? 1 : 0)).localeCompare(b.date + (b.moment === 'soir' ? 1 : 0))
      )[0] || null;
function bvPourMoi() {
  if (pending()) return '';
  const me = ME(),
    rows = [];
  // le direct d'une rencontre du club
  recs
    .filter(r => r.st === 'live' && !r.arch)
    .slice(0, 2)
    .forEach(r =>
      rows.push(
        `<button class="bvpm-r bvpm-go" data-a="open" data-v="rec" data-id="${r.id}"><span class="live"><i></i>Direct</span><span class="grow"><b>${esc(teamName(grp(r.tid)))} – ${esc(r.opp)}</b><small>${esc(r.comp || '')}</small></span><b class="bvpm-sc" data-live="${r.id}">${teamScore(r).join('-')}</b></button>`
      )
    );
  // ma convocation (rencontre d'équipe)
  const cv = recs
    .filter(r => !r.arch && r.st === 'soon' && r.lineup && r.lineup[me])
    .sort((a, b) => String(a.d).localeCompare(String(b.d)))[0];
  if (cv) {
    const c = (cv.conv || {})[me];
    rows.push(
      `<div class="bvpm-r"><button class="bvpm-t" data-a="open" data-v="rec" data-id="${cv.id}"><span class="tag">Convoqué</span><b>${esc(teamName(grp(cv.tid)))} – ${esc(cv.opp)}</b><small>${esc(cv.when || fmtD(cv.d) + (cv.h ? ' · ' + cv.h : ''))}</small></button><div class="ctl"><button class="btn sm grow ${c === 'ok' ? '' : 'ghost'}" data-a="conv" data-r="${cv.id}" data-s="ok" aria-pressed="${c === 'ok'}">${ic('check')}Je suis dispo</button><button class="btn sm grow ${c === 'no' ? 'hot' : 'ghost'}" data-a="conv" data-r="${cv.id}" data-s="no" aria-pressed="${c === 'no'}">${ic('x')}Pas dispo</button></div></div>`
    );
  }
  // mes prochains cours (et ceux de mes enfants), avec la présence en un geste
  bvProchainsCours(2).forEach(({ g, iso, w }) => {
    const r = respOf(g, iso, w),
      k = coachDu(g, iso),
      quand = (iso === TODAY ? 'Aujourd’hui' : iso === isoIn(1) ? 'Demain' : fmtD(iso)) + ' · ' + hAt(g, iso);
    rows.push(
      `<div class="bvpm-r"><button class="bvpm-t" data-a="tab" data-t="agenda"><b>${quand} · ${esc(g.name)}</b><small>${[w !== me ? 'Pour ' + first(w) : '', k && M[k] ? 'Avec ' + first(k) : '', durAt(g, iso), locOf(g, iso).toLowerCase()].filter(Boolean).join(' · ')}</small></button><div class="ctl"><button class="btn sm grow ${r === 'ok' ? '' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${w}" data-s="ok" aria-pressed="${r === 'ok'}">${ic('check')}Présent</button><button class="btn sm grow ${r === 'no' ? 'hot' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${w}" data-s="no" aria-pressed="${r === 'no'}">${ic('x')}Absent</button></div></div>`
    );
  });
  // mon repas réservé au bar
  const o = bvRepas();
  if (o)
    rows.push(
      `<button class="bvpm-r bvpm-go" data-a="bvBar"><span class="tile">${ic('cup')}</span><span class="grow"><b>${barDay(o.date)} ${MOMENT[o.moment].toLowerCase()} : ${esc(o.name)}</b><small>Réservé au bar${o.qty > 1 ? ' · ' + o.qty + ' parts' : ''}${o.price ? ' · ' + esc(o.price) : ''}${o.by !== me && M[o.by] ? ' · pour ' + first(o.by) : ''}</small></span>${ic('chev')}</button>`
    );
  return `<section class="card bvpm" aria-label="Pour moi"><h2 class="bvh">${ic('clock')}Pour moi</h2>${
    rows.join('') ||
    '<p class="muted small">Rien de prévu pour toi ces jours-ci. Propose une partie ou regarde l’agenda du club.</p>'
  }</section>`;
}
/* les 3 raccourcis : proposer une partie, réserver un court (si le club a le lien), la carte du bar (si le bar est actif) */
function bvRaccourcis() {
  if (pending()) return '';
  const t = (i, l, a) =>
      `<button class="bvsc" ${a}><span class="tile">${ic(i)}</span><span class="nm">${l}</span></button>`,
    l = [
      S.role !== 'kid' && t('ball', 'Proposer une partie', 'data-a="newPost" data-k="play"'),
      CLUBINFO.book &&
        `<a class="bvsc" href="${esc(CLUBINFO.book)}" target="_blank" rel="noopener"><span class="tile">${ic('court')}</span><span class="nm">Réserver un court</span></a>`,
      CLUBINFO.mods.bar && t('cup', 'Menu du bar', 'data-a="bvBar"')
    ].filter(Boolean);
  return l.length ? `<div class="bvscs n${l.length}">${l.join('')}</div>` : '';
}
A.bvBar = () => A.goClub({ t: 'bar' });
/* filtres du fil : Tout, Annonces, Résultats, Parties */
const BV_MURF = {
  annonce: p => ['annonce', 'event', 'cta', 'poll', 'comm', 'journal', 'article'].includes(p.kind) && !p.trn,
  res: p => ['perf', 'match'].includes(p.kind) || !!p.trn,
  play: p => ['play', 'niveaux'].includes(p.kind)
};
const bvMurJour = murJour;
murJour = function (feed) {
  const f = BV_MURF[S.murF],
    l = f ? feed.filter(f) : feed;
  if (!l.length)
    return emptyCard(
      'home',
      'Rien dans ce fil',
      {
        annonce: 'Aucune annonce du club pour l’instant.',
        res: 'Aucun résultat publié.',
        play: 'Aucune partie proposée.'
      }[S.murF] || ''
    );
  return bvMurJour(l);
};
A.bvMurF = d => {
  S.murF = d.k;
  render(true);
};
const bvFiltres = () =>
  `<div class="bvfil"><h2 class="bvh">Fil du club</h2><div class="chips" role="group" aria-label="Filtrer le fil">${[
    ['all', 'Tout'],
    ['annonce', 'Annonces'],
    ['res', 'Résultats'],
    ['play', 'Parties']
  ]
    .map(([k, l]) => `<button class="chip" data-a="bvMurF" data-k="${k}" aria-pressed="${S.murF === k}">${l}</button>`)
    .join('')}</div></div>`;
/* mes favoris (choisis avec l'étoile) : une frise seulement s'il y en a */
function bvFavoris() {
  if (typeof favStrip !== 'function' || !S.favs.some(f => favMeta(f))) return '';
  const st = (a, attrs, inner, l, cls) =>
    `<button class="story" data-a="${a}" ${attrs}><span class="ring ${cls || ''}"><span>${inner}</span></span><span class="sl">${l}</span></button>`;
  const F = favStrip(st);
  return `<div class="stories bvfavs" aria-label="Mes favoris">${F.tiles + F.tail}</div>`;
}
/* les noms des favoris suivent les nouvelles rubriques */
if (typeof FAV_TABS !== 'undefined') {
  FAV_TABS.chans[0] = 'Messages';
  FAV_TABS.chans[2].club = 'Messages du club';
  FAV_TABS.club[0] = 'Club';
  FAV_TABS.me[0] = 'Moi';
  FAV_TABS.jouer = ['Jouer', 'ball', { parties: 'Parties', equipes: 'Équipes', resultats: 'Résultats' }];
  FAV_SUB.jouer = 'jouTab';
}
/* le mur : la frise de raccourcis laisse la place à « Pour moi », aux raccourcis et aux filtres */
const bvHome = V.home;
V.home = () => {
  let h = bvHome();
  const i = h.indexOf('<div class="stories">'),
    e = i >= 0 ? sectionAt(h, 'div', i) : -1,
    tete = (MUR_LARGE.matches ? '' : bvPourMoi() + bvRaccourcis()) + bvFavoris() + bvFiltres();
  if (i >= 0 && e > 0) h = h.slice(0, i) + `<div class="bvtete">${tete}</div>` + h.slice(e);
  return h;
};
/* grand écran : la colonne de droite */
murSide = function () {
  if (!MUR_LARGE.matches) return '';
  const unread = chans.filter(c => chanOk(c) && c.un && !c.mute).slice(0, 5);
  return `<aside class="murside" aria-label="Pour moi">${bvPourMoi()}${bvRaccourcis()}${
    unread.length
      ? `<section class="card msb"><h3 class="bvh">${ic('chat')}Messages non lus</h3>${unread
          .map(c => {
            const l = c.msgs.filter(m => !S.blocked.has(m.by)).slice(-1)[0];
            return `<button class="msi" data-a="open" data-v="chan" data-id="${c.id}"><span class="tile">${ic(c.g === 'team' ? 'users' : 'ball')}</span><span class="grow"><b>${esc(c.name)}</b>${l ? `<small>${esc((l.by === 'club' ? club().short : first(l.by)) + ' : ' + (l.img && !l.x ? 'Photo' : l.x || ''))}</small>` : ''}</span><span class="mscnt">${c.un}</span></button>`;
          })
          .join('')}</section>`
      : ''
  }</aside>`;
};

/* ---------- Publier : une feuille courte (3 choix ; « Pour le club » pour le bureau et les enseignants) ---------- */
const bvPlusTout = A.plus;
A.plus = () => {
  if (pending()) {
    toast('Tu pourras publier dès que le club aura validé ton accès');
    return;
  }
  const st = isAdmin() || isAnim(),
    coach = S.role === 'coach' || !!S.super,
    kid = S.role === 'kid',
    row = (i, t, s, a) =>
      `<button class="bvpubr" ${a}><span class="tile">${ic(i)}</span><span class="grow"><b>${t}</b><small>${s}</small></span>${ic('chev')}</button>`,
    chip = (l, a) => `<button class="chip" ${a}>${l}</button>`,
    clubL = [
      st && chip('Annonce', 'data-a="newPost" data-k="annonce"'),
      st && chip('Événement', 'data-a="newPost" data-k="event"'),
      st && chip('Tournoi', 'data-a="newPost" data-k="tournoi"'),
      st && chip('Sondage', 'data-a="newPost" data-k="poll"'),
      st && CLUBINFO.mods.actus && chip('Actu', 'data-a="newPost" data-k="article"'),
      coach && chip('Stage', 'data-a="newPost" data-k="stage"'),
      st && chip('Partie dirigée', 'data-a="nvNew" data-m="partie"'),
      st && chip('Séance collective', 'data-a="nvNew" data-m="cours"')
    ].filter(Boolean),
    // ce qui reste de l'ancienne liste (lien, partenaires, commissions, groupe d'entraînement)
    autres = st || coach || myComms().length;
  sheet(
    'Publier',
    `<div class="body bvpub-b">${kid ? '' : row('ball', 'Proposer une partie', 'Sport, jour, niveau, places', 'data-a="newPost" data-k="play"')}${row('score', 'Ajouter un résultat', 'Il rejoint mon palmarès', 'data-a="result"')}${kid ? '' : row('image', 'Partager une photo ou un message', 'Dans le fil du club', 'data-a="newPost" data-k="msg"')}${
      clubL.length
        ? `<span class="kicker nsec">Pour le club · bureau et enseignants</span><div class="chips wrap">${clubL.join('')}</div>`
        : ''
    }${autres ? `<button class="btn ghost full" data-a="bvPlusTout">${ic('more')}Tous les choix</button>` : ''}</div>`
  );
};
A.bvPlusTout = () => bvPlusTout();
/* un message ou une photo d'adhérent dans le fil */
const bvForms = forms;
forms = function (k, cid) {
  if (k === 'msg')
    return [
      'Partager une photo ou un message',
      T('a-body', 'Message', 'Une photo du tournoi, un merci, une info pour le club').replace(' required', '') +
        IMG.replace('Photo de couverture (facultative)', 'Photo (facultative)'),
      'Publier dans le fil'
    ];
  return bvForms(k, cid);
};
document.addEventListener(
  'submit',
  e => {
    const f = e.target;
    if (!f || f.id !== 'adm-form' || f.dataset.k !== 'msg') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const body = (($('a-body') || {}).value || '').trim(),
      img = S.img;
    if (!body && !img) {
      toast('Écris un message ou ajoute une photo');
      return;
    }
    posts.unshift({
      id: 'p' + Date.now(),
      by: ME(),
      t: "À l'instant",
      at: Date.now(),
      kind: 'annonce',
      title: '',
      body: esc(body).replace(/\n/g, '<br>'),
      img: img || undefined,
      likes: 0,
      com: []
    });
    S.img = null;
    closeSheet();
    S.murF = 'all';
    S.stack = [];
    S.tab = 'home';
    S.toTop = true;
    render();
    toast('Publié dans le fil du club');
  },
  true
);

/* =========================================================================
   Étape 3 — Agenda : la présence aux cours se donne dans l'agenda (pour soi et pour son enfant),
   avec la même action qu'avant (« cresp » : l'enseignant la voit dans son appel, dans /Dojo).
   École > Mes cours disparaît : les cours, les repas réservés, les rencontres sont dans « Mon agenda ».
   ========================================================================= */
const bvPresence = (g, iso, w) => {
  const r = respOf(g, iso, w),
    moi = w === ME();
  return `<div class="ctl bvpres">${moi ? '' : `<span class="bvpres-qui">Pour ${esc(first(w))}</span>`}<button class="btn sm grow ${r === 'ok' ? '' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${w}" data-s="ok" aria-pressed="${r === 'ok'}" aria-label="${moi ? 'Je serai présent' : first(w) + ' sera présent'}">${ic('check')}Présent</button><button class="btn sm grow ${r === 'no' ? 'hot' : 'ghost'}" data-a="cresp" data-g="${g.id}" data-d="${iso}" data-u="${w}" data-s="no" aria-pressed="${r === 'no'}" aria-label="${moi ? 'Je serai absent' : first(w) + ' sera absent'}">${ic('x')}Absent</button></div>`;
};
const bvPlanItems = planItems;
planItems = function (iso) {
  const l = bvPlanItems(iso);
  if (S.plan.scope !== 'me' || iso < TODAY) return l;
  const me = ME(),
    whos = [me].concat((M[me] && M[me].kids) || []);
  l.forEach(i => {
    if (i.cat !== 'ens' || i.cx || i.foot) return;
    const g = grp(i.id);
    if (!g) return;
    const ws = whos.filter(w => (g.mem || []).includes(w));
    if (ws.length) i.foot = ws.map(w => bvPresence(g, iso, w)).join('');
  });
  return l;
};
/* École : Mes cours est parti dans l'Agenda */
const bvEcole = V.ecole;
V.ecole = () => {
  if (S.ecTab === 'mine') S.ecTab = 'profs';
  return bvEcole().replace(/<button role="tab"[^>]*data-val="mine"[^>]*>[\s\S]*?<\/button>/, '');
};
