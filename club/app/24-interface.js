/* /Buvette — app/24-interface.js : nouvelle organisation de /Buvette (maquette Figma « /Buvette · Nouvelle interface »,
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
window.tabActif = () => (BV_PARENT[S.tab] && !S.stack.length ? BV_PARENT[S.tab] : S.tab);
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
    ['resultats', 'Résultats', 'trophy'],
    ['tournois', 'Tournois', 'medal']
  ];
  if (!tabs.some(t => t[0] === S.jouTab)) S.jouTab = 'parties';
  const seg = segs('jouTab', tabs).replace('class="seg ico"', 'class="seg"');
  if (S.jouTab === 'equipes') return seg + teamsBody();
  if (S.jouTab === 'resultats') return seg + bvResultats();
  if (S.jouTab === 'tournois') return seg + trJouer();
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
    // une page hors menu allume sa rubrique (École → Club) : choisi avant l'affichage par window.tabActif
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
  bvBoite();
  if (typeof agMark === 'function') agMark();
};

/* Une seule grande boîte par page à intercalaires (Agenda, Jouer, Messages) : tout le contenu de l'intercalaire choisi
   y entre, les intercalaires sont collés à son bord supérieur. Dans l'ordre : les actions, les filtres de second niveau
   (pastilles), les listes ; les textes d'aide, en petit, à la fin. Les cartes internes deviennent des lignes de la boîte. */
function bvBoite() {
  const main = $('main');
  if (!main || S.stack.length || !['agenda', 'jouer', 'chans'].includes(S.tab)) return;
  const seg = main.querySelector(':scope > .seg');
  if (!seg || main.querySelector(':scope > .bvbox, :scope > .bvag')) return;
  const box = document.createElement('div');
  box.className = 'card bvbox';
  const suite = [];
  for (let n = seg.nextElementSibling; n; n = n.nextElementSibling)
    if (!n.classList.contains('seg-out') && !n.classList.contains('agcol')) suite.push(n);
  if (!suite.length) return;
  suite[0].before(box);
  box.append(...suite);
  if (box.querySelector('#plan')) box.classList.add('bvagb');
  // Agenda, grand écran : la carte de l'événement choisi vit hors de la boîte, dans une troisième colonne
  const col = main.querySelector(':scope > .agcol');
  if (col) {
    const rang = document.createElement('div');
    rang.className = 'bvag';
    box.before(rang);
    rang.append(box, col);
  }
  // Messages : « Créer un groupe de discussion » passe en tête (les actions d'abord)
  box.querySelectorAll(':scope > .pad > .btn.full').forEach(b => box.prepend(b));
  // textes d'aide : petit texte en bas de la boîte
  box.querySelectorAll('.note, .swipehint, .lphelp').forEach(n => {
    n.classList.add('bvaide');
    box.append(n);
  });
}

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
    tete = (MUR_LARGE.matches ? '' : bvPourMoi()) + bvFavoris() + bvFiltres(); // plus de grandes tuiles (partie, bar) : les favoris juste sous « Pour moi »
  if (i >= 0 && e > 0) h = h.slice(0, i) + `<div class="bvtete">${tete}</div>` + h.slice(e);
  return h;
};
/* grand écran : la colonne de droite */
murSide = function () {
  if (!MUR_LARGE.matches) return '';
  const unread = chans.filter(c => chanOk(c) && c.un && !c.mute).slice(0, 5);
  return `<aside class="murside" aria-label="Pour moi">${bvPourMoi()}${
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

/* =========================================================================
   Étape 4 — Jouer : les parties ouvertes (proposées par les adhérents, à venir, filtrables par sport et
   par niveau) avec « Proposer une partie » ; les parties dirigées et collectifs créés dans /Dojo ;
   les Équipes (venues de Club) ; les Résultats (palmarès, « Ajouter un résultat », tournois du club).
   ========================================================================= */
if (!S.jouF) S.jouF = 'all';
/* est-ce que cette partie est à mon niveau ? (tennis : classement dans la fourchette ; padel : niveau) */
function bvMonNiveau(y) {
  const m = M[ME()] || {};
  if (y.sport === 'Padel') return !!m.pl && m.pl >= +y.lo && m.pl <= +y.hi;
  const i = rIdx(m.r),
    a = rIdx(y.lo),
    b = rIdx(y.hi);
  return i >= Math.min(a, b) && i <= Math.max(a, b);
}
const bvPartieOk = p => {
  const y = p.play;
  if (!y) return false;
  if (S.jouF === 'Tennis' || S.jouF === 'Padel') return y.sport === S.jouF;
  if (S.jouF === 'niv') return bvMonNiveau(y);
  return true;
};
/* une partie ouverte, en carte courte : sport, format, niveau, quand, places, qui la propose, « Je viens » */
function bvPartieCard(p) {
  const y = p.play,
    me = ME(),
    inn = y.in.includes(me),
    full = y.in.length >= y.places,
    wt = y.wait.includes(me),
    reste = Math.max(0, y.places - y.in.length),
    niv = y.sport === 'Padel' ? 'Niveau ' + y.lo + ' à ' + y.hi : y.lo + ' à ' + y.hi,
    quand = (y.d ? fmtD(y.d) : y.date) + ' · ' + y.time + (y.dur ? ' · ' + y.dur : ''),
    act =
      p.by === me
        ? `<button class="btn ghost" data-a="open" data-v="post" data-id="${p.id}">Ma partie</button>`
        : inn
          ? `<button class="btn on" data-a="play" data-id="${p.id}" data-r="in">Je ne peux plus</button>`
          : full
            ? `<button class="btn ${wt ? 'on' : 'ghost'}" data-a="play" data-id="${p.id}" data-r="wait" aria-pressed="${wt}">${wt ? 'Quitter l’attente' : 'Liste d’attente'}</button>`
            : `<button class="btn" data-a="play" data-id="${p.id}" data-r="in">Je viens</button>`;
  return `<article class="card bvpar"><div class="bvpar-tags">${sportTag(y.sport)}<span class="tag">${esc(y.fmt || '')}</span>${bvMonNiveau(y) ? '<span class="tag lime">Mon niveau</span>' : ''}</div><button class="bvpar-t" data-a="open" data-v="post" data-id="${p.id}"><span class="h3">${esc(niv)}</span><span class="bvpar-q">${ic('cal')}${esc(quand)}</span></button><div class="bvpar-f"><span class="dots" aria-hidden="true">${Array.from({ length: y.places }, (_, i) => `<i class="${i < y.in.length ? 'on' : ''}"></i>`).join('')}</span><span class="grow muted small">${pLien(p.by, esc(first(p.by)))} · ${full ? 'complet' + (y.wait.length ? ', ' + y.wait.length + ' en attente' : '') : reste + ' place' + (reste > 1 ? 's' : '')}</span>${act}</div></article>`;
}
/* parties dirigées et séances collectives à venir (créées dans /Dojo), celles de mon niveau */
const bvCollectifs = () => {
  const prem = p => (p.nv.dates || []).find(d => d >= TODAY);
  return posts
    .filter(p => p.kind === 'niveaux' && p.nv && canSee(p) && prem(p))
    .sort((x, y) => prem(x).localeCompare(prem(y)));
};
V.jouer = () => {
  const tabs = [
    ['parties', 'Parties', 'ball'],
    ['equipes', 'Équipes', 'users'],
    ['resultats', 'Résultats', 'trophy'],
    ['tournois', 'Tournois', 'medal']
  ];
  if (!tabs.some(t => t[0] === S.jouTab)) S.jouTab = 'parties';
  const seg = segs('jouTab', tabs).replace('class="seg ico"', 'class="seg"');
  if (S.jouTab === 'equipes') return seg + teamsBody();
  if (S.jouTab === 'resultats') return seg + bvResultats();
  if (S.jouTab === 'tournois') return seg + trJouer();
  const l = bvPartiesOuvertes().filter(bvPartieOk),
    coll = bvCollectifs(),
    chip = (k, lb) =>
      `<button class="chip" data-a="bvJouF" data-k="${k}" aria-pressed="${S.jouF === k}">${lb}</button>`;
  return (
    seg +
    `<div class="pad bvjouer">${S.role === 'kid' ? '' : `<button class="btn full bvprop" data-a="newPost" data-k="play">${ic('plus')}Proposer une partie</button>`}<div class="chips bvfch" role="group" aria-label="Filtrer les parties">${chip('all', 'Tout')}${chip('Tennis', 'Tennis')}${chip('Padel', 'Padel')}${chip('niv', 'Mon niveau')}</div><span class="kicker">Parties ouvertes · ${l.length}</span>${
      l.length
        ? l.map(bvPartieCard).join('')
        : empty(
            'ball',
            S.jouF === 'all' ? 'Aucune partie ouverte' : 'Aucune partie avec ce filtre',
            'Propose la première : les adhérents de ton niveau sont prévenus.'
          )
    }${coll.length ? `<span class="kicker">Parties dirigées et collectifs · ${coll.length}</span>` : ''}</div>${coll.length ? `<div class="feed">${coll.map(postHTML).join('')}</div>` : ''}`
  );
};
A.bvJouF = d => {
  S.jouF = d.k;
  render(true);
};

/* =========================================================================
   Étape 5 — Club : une grille de tuiles (selon les modules du club) ; chaque tuile ouvre sa page
   (Bar et repas, École, Adhérents, Actus, Formulaires, Tarifs et horaires, Partenaires, Archives…)
   ou le lien du club (Réserver un court, Boutique). Le Bar a sa page, points et réservation en haut.
   ========================================================================= */
Object.assign(TITLES, {
  bvbar: () => ['Bar et repas', 'Club'],
  bvinfos: () => ['Tarifs et horaires', 'Club'],
  ecole: () => ['École', S.stack.length ? 'Club' : 'Cours et stages'],
  list: () => ['Adhérents', 'Club'],
  forms: () => ['Formulaires', 'Club'],
  actusl: () => ['Actus', 'Club'],
  partners: () => ['Partenaires', 'Club'],
  comml: () => ['Commissions', 'Club']
});
/* les anciens sous-onglets de Club (Adhérents, Bar) deviennent des pages */
const bvPlace4 = bvPlace;
bvPlace = function () {
  bvPlace4();
  if (S.tab === 'club' && (S.clubTab === 'adh' || S.clubTab === 'bar')) {
    S.stack = [{ v: S.clubTab === 'adh' ? 'list' : 'bvbar' }];
    S.clubTab = 'club';
  }
};
A.bvBar = () => {
  closeSheet();
  S.dir = 1;
  S.stack = [{ v: 'bvbar' }];
  render();
};
/* l'École : une page de Club (Enseignants, Stages, Collectifs, Gestion) */
A.bvEcole = () => {
  if (S.ecTab === 'mine') S.ecTab = 'profs';
  A.open({ v: 'ecole' });
};
/* la carte des points et de la prochaine réservation, en haut de la page du bar */
function bvBarTete() {
  const w = myWallet(),
    o = bvRepas();
  return `<section class="card bvpm bvbart"><button class="bvpm-r bvpm-go" data-a="bvPoints"><span class="tile">${ic('star')}</span><span class="grow"><b class="bvbig">${w.balance} point${w.balance > 1 ? 's' : ''}</b><small>à dépenser au bar${w.earned ? ' · ' + w.earned + ' gagnés cette saison' : ''}</small></span></button>${
    o
      ? `<div class="bvpm-r bvpm-go"><span class="tile">${ic('cup')}</span><span class="grow"><b>${barDay(o.date)} ${MOMENT[o.moment].toLowerCase()} : ${esc(o.name)}</b><small>Réservé · à payer au bar${o.price ? ' · ' + esc(o.price) : ''}</small></span></div>`
      : ''
  }</section>`;
}
A.bvPoints = () => sheet('Points du bar', `<div class="body">${barRules(myWallet())}</div>`);
V.bvbar = () => {
  if (!CLUBINFO.mods.bar) return `<div class="pad">${empty('cup', 'Pas de bar dans l’appli', '')}</div>`;
  let h = barView();
  const bons = REDEEMS.some(r => r.by === ME() && r.st === 'ok');
  // le solde est dans la carte du haut : la carte « Mes points bar » ne reste que pour montrer les bons
  if (!bons) {
    const i = h.indexOf('<section class="card wallet">'),
      e = i >= 0 ? sectionAt(h, 'section', i) : -1;
    if (e > 0) h = h.slice(0, i) + h.slice(e);
  }
  const p = h.indexOf('<div class="pad">');
  return p >= 0 ? h.slice(0, p + 17) + bvBarTete() + h.slice(p + 17) : bvBarTete() + h;
};
/* Tarifs et horaires : formules, horaires, adresse, équipe du club, liens (l'ancienne page « Le club ») */
V.bvinfos = () => {
  const keep = S.clubTab;
  S.clubTab = 'club';
  let h;
  try {
    h = bvClubView();
  } finally {
    S.clubTab = keep;
  }
  const cut = (start, tag) => {
    const i = h.indexOf(start),
      e = i >= 0 ? sectionAt(h, tag, i) : -1;
    if (e > 0) h = h.slice(0, i) + h.slice(e);
  };
  // le sous-menu, l'affiche et les accès sont déjà des tuiles de Club
  cut('<div class="seg', 'div');
  cut('<div class="poster">', 'div');
  cut('<div class="cacc">', 'div');
  // les chiffres et l'invitation sont déjà en tête de Club
  cut('<div class="stats">', 'div');
  cut('<div class="note">', 'div');
  return h;
};
/* la grille de Club */
V.club = () => {
  const I2 = CLUBINFO,
    kid = S.role === 'kid',
    nTeams = GROUPS.filter(g => g.type === 'team').length,
    resa =
      typeof ORDERS !== 'undefined'
        ? ORDERS.filter(o => myBarKeys().includes(o.by) && o.st !== 'annule' && o.st !== 'servi' && o.date >= TODAY)
            .length
        : 0,
    nArts = typeof tabNews === 'function' ? arts.filter(a => !a.arch && (a.at || 0) > (SEEN.at.club || 0)).length : 0,
    t = (i, l, s, a) =>
      `<button class="bvtile" ${a}><span class="tile">${ic(i)}</span><span class="nm">${l}</span>${s ? `<small>${s}</small>` : ''}</button>`,
    lk = (i, l, s, u) =>
      u
        ? `<a class="bvtile" href="${esc(/^https?:/i.test(u) ? u : 'https://' + u)}" target="_blank" rel="noopener"><span class="tile">${ic(i)}</span><span class="nm">${l}</span><small>${s}</small></a>`
        : '',
    tiles = [
      lk('court', 'Réserver un court', 'Lien du club', I2.book),
      I2.mods.bar &&
        t(
          'cup',
          'Bar et repas',
          resa ? `${resa} repas réservé${resa > 1 ? 's' : ''}` : 'Carte et réservations',
          'data-a="bvBar"'
        ),
      t('school', 'École', 'Enseignants, stages', 'data-a="bvEcole"'),
      t('medal', 'Tournois', trResume(), 'data-a="open" data-v="tournois"'),
      !kid && t('users', 'Adhérents', 'Annuaire', 'data-a="open" data-v="list"'),
      I2.mods.actus &&
        t(
          'news',
          'Actus',
          nArts ? `${nArts} nouvelle${nArts > 1 ? 's' : ''}` : 'Récits du club',
          'data-a="open" data-v="actusl"'
        ),
      t('poll', 'Formulaires', 'Inscriptions, sondages', 'data-a="open" data-v="forms"'),
      t('info', 'Tarifs et horaires', 'Formules, adresse', 'data-a="open" data-v="bvinfos"'),
      lk('euro', 'Payer ma cotisation', 'Lien du club', I2.pay),
      lk('bag', 'Boutique', 'Lien du club', I2.shop),
      I2.mods.comm && t('flag', 'Commissions', 'Les bénévoles', 'data-a="open" data-v="comml"'),
      t('heart', 'Partenaires', 'Ils soutiennent le club', 'data-a="open" data-v="partners"'),
      t('trophy', 'Classement des clubs', 'Les clubs les plus actifs', 'data-a="ranks"'),
      t('folder', 'Archives', 'Saisons précédentes', 'data-a="open" data-v="archive"')
    ].filter(Boolean);
  const chiffres = [
    I2.courts && `${I2.courts} court${I2.courts > 1 ? 's' : ''}`,
    I2.pistes && `${I2.pistes} piste${I2.pistes > 1 ? 's' : ''}`,
    I2.members && `${I2.members} adhérents`,
    nTeams && `${nTeams} équipe${nTeams > 1 ? 's' : ''}`
  ]
    .filter(Boolean)
    .join(' · ');
  return `<div class="pad"><div class="bvclubh">${clubLogo() ? `<img class="bvclogo" src="${clubLogo()}" alt="">` : `<span class="tile bvclogo">${esc(club().short || '')}</span>`}<span class="grow"><b>Tennis · Padel · saison ${S.season}</b><span>${chiffres}</span>${I2.house ? `<span>Club-house : ${esc(I2.house)}</span>` : ''}</span></div>${isAdmin() && I2.joined < I2.members ? `<button class="note" data-a="open" data-v="join" style="width:100%;text-align:left">${I2.joined} adhérents sur ${I2.members} ont rejoint l'appli. <b style="color:var(--accent)">Inviter les autres</b></button>` : ''}<div class="bvtiles">${tiles.join('')}</div></div>`;
};
I.bag = '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2"/>';

/* =========================================================================
   Étape 6 — Moi : l'en-tête une seule fois (compact), la carte Adhésion, les Points du bar et les Trophées
   (deux compteurs séparés, décision du 14/11), puis une liste de pages : Mon jeu, Mon suivi (bilans, vidéos,
   historique : ce que l'enseignant publie dans /Dojo), Ma famille, Mes infos, Mes trophées, Réglages.
   « Investissement » devient « Trophées ».
   ========================================================================= */
const BV_MOI = {
  jeu: ['Mon jeu', 'score', 'Résultats, classement, palmarès'],
  suivi: ['Mon suivi', 'video', 'Bilans, vidéos, historique'],
  famille: ['Ma famille', 'users', ''],
  infos: ['Mes infos', 'user', 'Ce que les adhérents voient'],
  reglages: ['Réglages', 'gear', 'Affichage, notifications, compte']
};
TITLES.moi = () => [(BV_MOI[view().id] || ['Moi'])[0], 'Moi'];
/* le corps d'un onglet de l'ancien profil (avec ce qu'y ajoute la synchro : fiche /Pista, code du club…) */
function bvProfilCorps(t) {
  const keep = S.meTab;
  S.meTab = t;
  let h;
  try {
    h = profile(ME());
  } finally {
    S.meTab = keep;
  }
  const a = h.indexOf('<div class="bar-tabs me-tabs"'),
    e = a >= 0 ? sectionAt(h, 'div', a) : -1,
    lo = h.indexOf('<button class="btn ghost full logout"'),
    fin = lo >= 0 ? lo : h.lastIndexOf('</div>');
  return e > 0 ? h.slice(e, fin) : '';
}
/* mes enfants : leur fiche et ce que le parent règle pour eux */
function bvFamille() {
  const me = ME(),
    m = M[me];
  return `<div class="card"><span class="kicker">Ma famille</span>${
    (m.kids || [])
      .map(
        k =>
          `<button class="item" data-a="member" data-id="${k}">${av(k, 'sm')}<span class="grow"><span class="nm">${esc(M[k].n)}</span> ${bd(k)}<br><span class="muted small">${catOf(k)} · ${esc(M[k].team || '')}</span></span></button>`
      )
      .join('') || '<p class="muted small">Aucun enfant rattaché à ton compte.</p>'
  }<button class="btn sm ghost" data-a="addKid">${ic('plus')}Ajouter un enfant</button></div>`;
}
V.moi = id => {
  if (id === 'suivi') return `<div class="pad">${typeof resaMine === 'function' ? resaMine() : ''}${persoBody()}</div>`;
  if (id === 'famille') return `<div class="pad">${bvFamille()}</div>`;
  let h = bvProfilCorps(id === 'jeu' || id === 'reglages' ? id : 'infos');
  // Mes infos : la famille a sa page
  if (id === 'infos') {
    const i = h.indexOf('<div class="card"><span class="kicker">Ma famille</span>'),
      e = i >= 0 ? sectionAt(h, 'div', i) : -1;
    if (e > 0) h = h.slice(0, i) + h.slice(e);
  }
  return `<div class="pad">${h}</div>`;
};
A.bvMoi = d => A.open({ v: 'moi', id: d.k });
/* la page Moi */
V.me = id => {
  if (id && id !== ME()) return profile(id);
  const me = ME(),
    m = M[me],
    kid = isMinor(me),
    w = m.res.filter(r => r.w).length,
    pf = m.res.filter(r => r.perf).length,
    pl = (n, a, b) => n + ' ' + (n > 1 ? b : a),
    chiffres = [
      pl(w, 'victoire', 'victoires'),
      pl(m.res.length - w, 'défaite', 'défaites'),
      pl(pf, 'perf', 'perfs'),
      kid ? '' : pl(m.fol || 0, 'abonné', 'abonnés')
    ]
      .filter(Boolean)
      .join(' · '),
    tags = [
      m.role ? `<span class="bd ${RC[m.role] || ''}">${esc(m.role)}</span>` : '',
      m.r && m.r !== 'NC' ? `<span class="bd rk">${esc(m.r)} tennis</span>` : '',
      m.pl ? `<span class="bd padel">Niv ${m.pl} padel</span>` : '',
      m.pad ? `<span class="bd">N° ${m.pad} padel</span>` : ''
    ].join('');
  // l'adhésion de la saison : validée par le club ou en attente ; le lien de paiement du club s'il existe
  const ok = VALID[me] === S.season || isAdmin(),
    adh = `<section class="card bvadh"><div class="row" style="gap:10px"><span class="bvh grow">${ic('euro')}Adhésion ${S.season}</span><span class="tag ${ok ? 'lime' : 'hot'}">${ok ? 'Validée' : 'En attente'}</span></div><p class="muted small">${ok ? 'Le club a validé ton adhésion pour cette saison.' : 'Le club doit encore valider ton adhésion pour cette saison.'}${m.team ? ' · ' + esc(m.team) : ''}</p>${CLUBINFO.pay ? `<a class="btn ghost full" href="${esc(/^https?:/i.test(CLUBINFO.pay) ? CLUBINFO.pay : 'https://' + CLUBINFO.pay)}" target="_blank" rel="noopener">${ic('euro')}Payer ma cotisation</a>` : ''}</section>`;
  // les deux compteurs : points du bar, trophées (score et cadre)
  const wal = CLUBINFO.mods.bar ? myWallet() : null,
    L = lvlOf(me),
    nx = nextFrame(me),
    pts = `<section class="card bvpts"><div class="bvcpt">${wal ? `<button class="bvc" data-a="bvBar"><b>${wal.balance}</b><span>Points · bar</span></button>` : ''}<button class="bvc" data-a="open" data-v="trophies" data-id="${me}"><b>${esc(FRAMES[L].n)}</b><span>Trophées · ${score(me)} pts</span></button></div>${nx ? `<span class="bar" aria-hidden="true"><i style="width:${nx.pc}%"></i></span><p class="muted small">Encore ${nx.need} pts pour le cadre ${esc(nx.n.toLowerCase())}</p>` : ''}</section>`;
  const nSuivi = typeof svUnread === 'function' ? svMine().reduce((a, k) => a + (svUnread(k) || 0), 0) : 0,
    row = (k, extra) => {
      const [l, i, s0] = BV_MOI[k],
        s = k === 'famille' ? (m.kids || []).map(first).join(', ') || 'Rattacher un enfant' : s0;
      return `<button class="bvmrow" data-a="bvMoi" data-k="${k}"><span class="tile">${ic(i)}</span><span class="grow"><b>${l}</b><small>${esc(s)}</small></span>${extra || ''}${ic('chev')}</button>`;
    },
    clubs = (window.RAM && RAM.live && RAM.clubs) || [],
    plusieurs = clubs.length > 1,
    gere = (isAdmin() || S.role === 'cap') && !pending(),
    gereL = isAdmin() && S.role !== 'coach' ? 'Gérer le club' : S.role === 'coach' ? 'Mes groupes' : 'Gérer mon équipe',
    lien = (a, i, l, s) =>
      `<button class="bvmrow" ${a}><span class="tile">${ic(i)}</span><span class="grow"><b>${l}</b>${s ? `<small>${s}</small>` : ''}</span>${ic('chev')}</button>`;
  const menu = [
    row('jeu'),
    row('suivi', nSuivi ? `<span class="cnt">${nSuivi}</span>` : ''),
    kid ? '' : row('famille'),
    row('infos'),
    lien(`data-a="open" data-v="trophies" data-id="${me}"`, 'trophy', 'Mes trophées', 'Cadres, trophées, classement'),
    S.favs && S.favs.length
      ? lien('data-a="favEdit"', 'star', 'Mes favoris', S.favs.length + ' page' + (S.favs.length > 1 ? 's' : ''))
      : '',
    row('reglages')
  ].join('');
  // le club ouvert : son nom, club principal ou non, la gestion et le changement de club en pictogrammes
  const ici = clubs.find(c => window.RAM && c.id === RAM.club),
    clubC =
      gere || plusieurs
        ? `<section class="card bvclubm"><div class="bvclubmh"><span class="bvh grow">${ic('flag')}<span class="bvcn">${esc(club().name)}</span></span>${ici && ici.main ? '<span class="tag lime">Club principal</span>' : ''}${gere ? `<button class="ib" data-a="admin" aria-label="${gereL}" title="${gereL}">${ic('gear')}</button>` : ''}${plusieurs ? `<button class="ib" data-a="ramClubs" aria-label="Changer de club" title="Changer de club">${ic('swap')}</button>` : ''}</div>${plusieurs && ici && !ici.main ? `<button class="btn sm ghost" data-a="ramMain" data-id="${ici.id}">${ic('star')}Faire de ce club mon club principal</button>` : ''}</section>`
        : '';
  return `<div class="pad bvmoi">${pending() ? lockCard() : ''}<section class="card bvmoih"><label class="avedit" aria-label="Changer ma photo de profil">${av(me)}<span class="cam">${ic('image')}</span><input type="file" id="me-photo" accept="image/*"></label><span class="grow"><h2 class="bvnom${legN(me)}">${esc(m.n)}</h2><span class="bds wrap">${tags}</span></span><p class="muted small bvchif"><button class="nm" data-a="bvMoi" data-k="jeu">${chiffres}</button></p></section>${pending() ? '' : adh}${pts}${clubC}<nav class="card bvmenu" aria-label="Mes pages">${menu}</nav>${window.RAM && RAM.user ? `<button class="btn ghost full logout" data-a="logout">${ic('logout')}Se déconnecter de /Buvette</button>` : ''}</div>`;
};
TITLES.me = () => ['Moi', S.super ? 'Administrateur' : 'Mon profil'];
/* les anciens sous-onglets du profil mènent à leur page */
const bvMeTab = A.meTab;
A.meTab = d => (BV_MOI[d.k] ? A.open({ v: 'moi', id: d.k }) : bvMeTab(d));
const bvPalmGo = A.palmGo;
A.palmGo = () => {
  if (view().v === 'me') return A.open({ v: 'moi', id: 'jeu' });
  return bvPalmGo();
};
/* « Investissement » devient « Trophées » */
const bvTrophyTitle = TITLES.trophies;
if (bvTrophyTitle)
  TITLES.trophies = () => {
    const [t, s] = bvTrophyTitle();
    return [t, s === 'Mon investissement' ? 'Moi' : s];
  };
const bvTrophyCard = trophyCard;
trophyCard = id => bvTrophyCard(id).replace('Investissement au club', 'Trophées au club');
/* École > Mon espace : devenu « Mon suivi », dans Moi */
const bvPlace5 = bvPlace;
bvPlace = function () {
  // l'ancien sous-onglet du profil demandé (Mon jeu, Mes infos, Réglages) : sa page dans Moi
  if (S.tab === 'me' && !S.stack.length && BV_MOI[S.meTab]) {
    S.stack = [{ v: 'moi', id: S.meTab }];
    S.meTab = '';
  }
  if (S.tab === 'ecole' && S.ecTab === 'perso') {
    S.ecTab = 'profs';
    S.tab = sideNav() ? 'me' : 'home';
    S.stack = [{ v: 'moi', id: 'suivi' }];
  }
  bvPlace5();
};
const bvEcole6 = V.ecole;
V.ecole = () => {
  if (S.ecTab === 'perso') S.ecTab = 'profs';
  return bvEcole6().replace(/<button role="tab"[^>]*data-val="perso"[^>]*>[\s\S]*?<\/button>/, '');
};

/* =========================================================================
   Étape 7 — finitions : la démo recalée (les dates affichées suivent les vraies dates des données),
   tutoiement partout, l'aide avec les nouveaux noms.
   ========================================================================= */
(() => {
  // la démo seulement (sans compte) : les dates écrites en toutes lettres suivaient l'ancienne semaine de démo
  if (window.RAM_KEY) return;
  const jour = iso => fmtD(iso),
    plage = (a, b) => {
      const [, ma, da] = a.split('-').map(Number),
        [, mb, db] = b.split('-').map(Number);
      return ma === mb ? `Du ${da} au ${db} ${MO[mb - 1]}` : `Du ${da} ${MO[ma - 1]} au ${db} ${MO[mb - 1]}`;
    };
  posts.forEach(p => {
    if (p.arch) return;
    if (p.kind === 'event' && p.d && p.date)
      p.date =
        (p.d2 && p.d2 !== p.d ? plage(p.d, p.d2) : jour(p.d)) +
        (p.h1 ? ' · ' + p.h1 + (p.h2 && !p.d2 ? ' – ' + p.h2 : '') : '');
    if (p.id === 'p1' && p.trn && p.trn.dl) {
      const [, m, d] = p.trn.dl.split('-').map(Number),
        [, m2, d2] = (p.d2 || p.trn.dl).split('-').map(Number);
      p.body = `Inscriptions ouvertes jusqu'au ${d} ${MO[m - 1]}. Simples et doubles, tous classements. Finales le ${d2} ${MO[m2 - 1]}, suivies du repas du club.`;
    }
  });
  // les parties proposées : une vraie date, dans les jours qui viennent
  const ecart = { p7: 4, p9: 6, p10: 7, p8: 5 };
  posts.forEach(p => {
    if (p.kind !== 'play' || !p.play || p.play.d || ecart[p.id] == null) return;
    p.play.d = isoIn(ecart[p.id]);
    p.play.date = jour(p.play.d);
  });
  // les rencontres : la phrase « quand » suit la date de la rencontre
  recs.forEach(r => {
    if (r.arch || !r.d || !r.when) return;
    const lieu = (r.when.split(' · ')[2] || '').trim();
    r.when = jour(r.d) + (r.h ? ' · ' + r.h : '') + (lieu ? ' · ' + lieu : '');
  });
})();
