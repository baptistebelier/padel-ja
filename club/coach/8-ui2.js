/* /RAM Coach — coach/8-ui2.js : nouvelle organisation de /Dojo (maquette Figma « /Dojo · Nouvelle interface », 11/2026).
   À l'essai derrière l'interrupteur ?ui=2 (coach.html) : sans lui, rien ne change.
   Étape 1 — navigation : 5 rubriques partout (Aujourd'hui, Planning, Élèves, Groupes, Messages) ;
   Statistiques devient un sous-onglet d'Aujourd'hui ; Suivi sort du menu (joignable depuis « À traiter ») ;
   Profil devient Réglages, hors du menu (bas du menu sur grand écran, roue dentée dans l'en-tête au téléphone) ;
   les doublons Groupes et Formules quittent le sous-menu Élèves. */
const UI2 = document.documentElement.dataset.ui === '2';
if (UI2) {
  /* ---------- le menu : 5 rubriques ; Statistiques, Suivi et Réglages restent des pages, sans entrée dans le menu ---------- */
  const U2_MENU = [
    ['today', 'home', 'Aujourd’hui'],
    ['planning', 'cal', 'Planning'],
    ['eleves', 'users', 'Élèves'],
    ['clubs', 'club', 'Groupes'],
    ['msgs', 'chat', 'Messages']
  ];
  const U2_HORS = [
    ['dash', 'chart', 'Statistiques'],
    ['asuivi', 'check', 'Suivi'],
    ['me', 'gear', 'Réglages']
  ];
  TABBAR.splice(0, TABBAR.length, ...U2_MENU, ...U2_HORS);
  const u2Hors = k => U2_HORS.some(x => x[0] === k);

  /* titres des pages */
  const u2Titres = {
    today: () => ['Aujourd’hui', fmtD(TODAY)],
    dash: () => ['Aujourd’hui', 'Statistiques'],
    clubs: () => ['Groupes', 'Mes groupes'],
    asuivi: () => ['Bilans et paiements', 'À suivre'],
    me: () => ['Réglages', 'Mon compte enseignant']
  };
  Object.keys(u2Titres).forEach(k => {
    if (TITLES[k] || V[k]) TITLES[k] = u2Titres[k];
  });

  /* ---------- Aujourd'hui | Statistiques : un sous-onglet dans la page (pas une colonne de sous-menu) ---------- */
  const u2Sous = on =>
    `<div class="seg haut u2sous" role="tablist" aria-label="Aujourd’hui">${[
      ['today', 'Aujourd’hui', 'home'],
      ['dash', 'Statistiques', 'chart']
    ]
      .map(
        ([k, l, i]) =>
          `<button role="tab" aria-selected="${on === k}" data-a="tab" data-t="${k}">${ic(i)}<span class="lb">${l}</span></button>`
      )
      .join('')}</div>`;
  const u2Today = V.today,
    u2Dash = V.dash;
  V.today = () => u2Sous('today') + u2Today();
  // les statistiques mesurent l'activité, sans argent (carnet C02) : plus d'intercalaire Paiements
  V.dash = () => {
    S.dashTab = 'act';
    return u2Sous('dash') + u2Dash().replace(/<div class="seg haut" role="tablist">(?:(?!<\/div>)[\s\S])*?<\/div>/, '');
  };

  /* ---------- Élèves : le sous-menu garde Tous les élèves et Sans compte ---------- */
  const u2Eleves = V.eleves;
  V.eleves = () =>
    u2Eleves().replace(
      /<button role="tab"[^>]*aria-label="(?:Groupes|Formules et tarifs|Échelles techniques)"[\s\S]*?<\/button>/g,
      ''
    );

  /* ---------- Groupes au téléphone : les mêmes cartes que sur grand écran (créneau, remplissage, état du cycle) ---------- */
  const u2Clubs = V.clubs;
  V.clubs = () => {
    const h = u2Clubs();
    if (coWide()) return h;
    const i = h.indexOf('<div class="pad">');
    if (i < 0) return h;
    const id = S.coClubTab || (coClubList()[0] || {}).id,
      gs = coGroups('', true).filter(g => coClubOf(g) === id && coIsGrp(g) && !coOver(g));
    return (
      h.slice(0, i) +
      `<div class="pad u2grp">${gs.length ? gs.map(coGrpCard).join('') : none('users', 'Aucun groupe', 'Un groupe rassemble des élèves qui jouent ensemble chaque semaine.')}<button class="btn ghost full" data-a="coNewGrp">${ic('plus')}Créer un groupe</button></div>`
    );
  };

  /* ---------- Réglages : en tête, les réglages qui quittent le sous-menu Élèves ---------- */
  const u2Me = V.me;
  V.me = id =>
    (id
      ? ''
      : `<div class="pad"><div class="card ecs u2regl"><div class="calh">${ic('gear')}<b>Réglages</b></div><div class="menu"><button data-a="open" data-v="formules">${ic('euro')}Formules et tarifs</button><button data-a="open" data-v="niveaux">${ic('ladder')}Échelles techniques</button></div></div></div>`) +
    u2Me(id);

  /* ---------- après chaque affichage : menu, Réglages, lien vers le suivi ---------- */
  function u2Nav() {
    const tabs = $('tabs');
    if (tabs) {
      tabs.querySelectorAll('button[data-t]').forEach(b => {
        if (u2Hors(b.dataset.t)) b.remove();
      });
      tabs.querySelectorAll('.coplus').forEach(b => b.remove());
      // Statistiques est un sous-onglet d'Aujourd'hui : l'entrée Aujourd'hui reste allumée
      if (S.tab === 'dash' && !S.stack.length) {
        const b = tabs.querySelector('button[data-t="today"]');
        if (b) {
          b.setAttribute('aria-current', 'page');
          if (typeof pillTo === 'function') pillTo(b, true);
        }
      }
    }
    // grand écran : Réglages en bas du menu (à la place de Profil)
    const rb = $('rbot');
    if (rb) {
      const p = rb.querySelector('button[data-t="me"]');
      if (p) p.innerHTML = `${ic('gear')}<span>Réglages</span>`;
    }
    // téléphone : la roue dentée des Réglages dans l'en-tête des pages du menu
    const top = $('top');
    if (top && !coWide() && !S.stack.length && !top.querySelector('.u2gear')) {
      const bell = top.querySelector('[data-a="notifs"]'),
        h = `<button class="ib u2gear" data-a="tab" data-t="me" aria-label="Réglages" ${S.tab === 'me' ? 'aria-current="page"' : ''}>${ic('gear')}</button>`;
      if (bell) bell.insertAdjacentHTML('beforebegin', h);
      else top.insertAdjacentHTML('beforeend', h);
    }
    // Aujourd'hui : le suivi (bilans et paiements) se rejoint depuis « À traiter »
    if (S.tab === 'today' && !S.stack.length) {
      const c = document.querySelector('#main .cobside');
      if (c && !c.querySelector('.u2suivi'))
        c.insertAdjacentHTML(
          'beforeend',
          `<button class="btn ghost full u2suivi" data-a="tab" data-t="asuivi">${ic('check')}Bilans et paiements à suivre</button>`
        );
    }
  }
  const u2Rail = ramRail;
  ramRail = function (t, sub) {
    u2Rail(t, sub);
    u2Nav();
  };
}
