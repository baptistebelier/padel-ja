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
