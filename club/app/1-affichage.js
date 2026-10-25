/* /RAM Club — app/1-affichage.js : Affichage : rendu de l'écran, titres, confirmations, volets.
   Morceau de l'ancien app.js : les fichiers app/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
/* Rendu, actions, formulaires et simulation du direct */
let lastKey = '',
  lastFoot = '',
  slT,
  toastT;
function slide(c) {
  const m = $('main');
  m.classList.remove('pg-r', 'pg-l', 'sg-r', 'sg-l');
  void m.offsetWidth;
  m.classList.add(c);
  clearTimeout(slT);
  slT = setTimeout(() => m.classList.remove(c), 320);
}
const ROLE = {
  wait: 'Nouvel inscrit en attente de validation',
  admin: 'Bureau du club',
  cap: 'Capitaine',
  mem: 'Adhérent et parent',
  coach: 'Enseignante',
  kid: 'Compte jeune'
};
const TITLES = {
  home: () => ['Accueil', 'Le mur du club'],
  chans: () => ['Groupes', club().name],
  agenda: () => [
    'Agenda',
    S.plan.scope === 'me' ? 'Tout ce où je suis inscrit' : 'Cours, parties, événements, tournois'
  ],
  teamarch: () => {
    const [id, s] = view().id.split('|');
    return [teamName(grp(id)), 'Saison ' + s];
  },
  ecole: () => ['École', 'Cours et stages'],
  club: () => ['Le club', 'Saison ' + S.season],
  me: () => ['Mon profil', ROLE[S.role]],
  admin: () => [isAdmin() ? 'Gérer le club' : S.role === 'coach' ? 'Mes groupes' : 'Mon équipe', 'Édition'],
  list: () => ['Adhérents', club().name],
  reports: () => ['Signalements', 'Modération'],
  legal: () => ['Mentions', club().name],
  aide: () => ['Aide', 'Guide de l’appli'],
  post: () => ['Publication', club().name],
  art: () => ['Actus', club().name],
  partners: () => ['Partenaires', club().name],
  archive: () => ['Archives', 'Saisons précédentes'],
  join: () => ['Adhérents', 'Faire entrer le club']
};
function render(keep) {
  const v = view(),
    key = v.v + (v.id || ''),
    main = $('main'),
    y = main.scrollTop,
    atEnd = main.scrollHeight - main.clientHeight - y < 80;
  let t, sub;
  if (TITLES[v.v]) [t, sub] = TITLES[v.v]();
  else if (v.v === 'chan') {
    const c = chans.find(c => c.id === v.id);
    t = '# ' + c.name;
    sub = c.desc;
  } else if (v.v === 'rec') {
    const r = recs.find(r => r.id === v.id);
    t = teamName(grp(r.tid)) + ' – ' + r.opp;
    sub = r.comp;
  } else if (v.v === 'grp') {
    const g = grp(v.id);
    t = g.name;
    sub = g.sub;
  } else if (v.v === 'team') {
    const g = grp(v.id);
    t = teamName(g);
    sub = champOf(g).name;
  } else if (v.v === 'champ') {
    t = (CHAMPS.find(c => c.id === v.id) || OLDC.find(c => c.id === v.id) || { name: 'Championnat' }).name;
    sub = 'Championnat';
  } else if (v.v === 'comm') {
    t = COMMS.find(c => c.id === v.id).name;
    sub = club().name;
  } else {
    t = M[v.id].n;
    sub = 'Profil';
  }
  if (key !== lastKey) {
    $('top').classList.remove('hide');
    lastY = 0;
    turnY = 0;
  }
  $('top').innerHTML =
    (S.stack.length ? `<button class="ib" data-a="back" aria-label="Retour">${ic('back')}</button>` : '') +
    (clubLogo()
      ? `<img class="toplogo${S.stack.length ? ' sub' : ''}" src="${clubLogo()}" alt="${esc(club().name)}">`
      : '') +
    `<h1>${t}<span class="sub">${sub}</span></h1>${v.v === 'chan' ? muteBtn(chans.find(c => c.id === v.id)) : ''}${!S.stack.length && (isAdmin() || S.role === 'cap') && !pending() ? `<button class="ib" data-a="admin" aria-label="${isAdmin() ? 'Gérer le club' : 'Gérer mon équipe'}">${ic('gear')}</button>` : ''}${S.stack.length ? '' : `<button class="ib modebtn" data-a="ramMode" aria-label="${effDark() ? 'Passer en mode jour' : 'Passer en mode nuit'}">${ic(effDark() ? 'sun' : 'moon')}</button>`}<button class="ib" data-a="notifs" aria-label="Notifications">${ic('bell')}${!pending() && NOTIFS.some(n => n.n && nVis(n)) ? '<span class="dot"></span>' : ''}</button>`;
  const strips = '.seg,.chips,.stories',
    sx = key === lastKey ? [...main.querySelectorAll(strips)].map(e => e.scrollLeft) : [];
  const oldSeg = main.querySelector(':scope > .seg');
  main.innerHTML = pending() && !lockOk(v) ? lockView(v) : V[v.v](v.id);
  main.querySelectorAll(strips).forEach((e, i) => {
    if (sx[i]) e.scrollLeft = sx[i];
  });
  const foot = $('foot'),
    tabs = $('tabs'),
    liveRec = v.v === 'rec' && recs.find(r => r.id === v.id).st === 'live',
    fk = key + (liveRec ? 'L' : '');
  /* menu de navigation : caché dans une discussion sur téléphone (la barre de saisie prend sa place), toujours visible avec le menu latéral (ordinateur) */
  const showTabs = !(v.v === 'chan' || liveRec) || sideNav();
  if (v.v === 'chan' || liveRec) {
    foot.hidden = false;
    tabs.hidden = !showTabs;
    if (fk !== lastFoot) {
      const c = v.v === 'chan' ? chans.find(c => c.id === v.id) : null;
      S.img = null;
      S.reply = null;
      foot.innerHTML =
        c && c.ro && !isAdmin()
          ? '<div class="muted small" style="text-align:center;padding:8px">Seul le club publie dans ce groupe.</div>'
          : `<div class="att" id="att" hidden></div><form class="composer" id="composer"><label class="attach" aria-label="Joindre une photo">${ic('image')}<input type="file" id="m-img" accept="image/*"></label><textarea id="msg-input" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="${c ? (c.ro ? 'Publier au nom du club' : 'Écrire dans ' + esc(c.name)) : "Encourager l'équipe"}" aria-label="Message"></textarea><button class="send" aria-label="Envoyer">${ic('send')}</button></form>`;
    }
  } else foot.hidden = true;
  if (showTabs) {
    tabs.hidden = false;
    // pastilles : messages non lus dans les groupes ; nouveautés depuis la dernière visite des autres onglets
    const un = pending() ? 0 : chans.reduce((a, c) => a + (c.mute || !chanOk(c) ? 0 : c.un), 0),
      cnt = k => (k === 'chans' ? un : S.tab === k && !S.stack.length ? 0 : tabNews(k)),
      tb = (k, i, l) => {
        const n = cnt(k);
        return `<button data-a="tab" data-t="${k}" ${S.tab === k ? 'aria-current="page"' : ''} aria-label="${l}${n ? ` (${n} nouveauté${n > 1 ? 's' : ''})` : ''}">${ic(i)}${l}${n ? `<span class="cnt">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
      };
    tabs.innerHTML =
      tb('home', 'home', 'Accueil') +
      tb('chans', 'chat', 'Groupes') +
      tb('agenda', 'cal', 'Agenda') +
      tb('ecole', 'school', 'École') +
      tb('club', 'club', 'Club') +
      tb('me', 'user', 'Profil');
    tabs.insertAdjacentHTML('afterbegin', '<span class="pill" id="tpill" aria-hidden="true"></span>');
    pillTo(tabs.querySelector('[aria-current]'), true);
  }
  if (pending() && !lockOk(v)) foot.hidden = true;
  $('phone').classList.toggle('notabs', tabs.hidden);
  $('phone').classList.toggle('hassub', !!main.querySelector(':scope > .seg'));
  ramRail(t);
  $('phone').classList.toggle('withfoot', !foot.hidden);
  /* ordinateur : les pages ne glissent pas ; seul le sous-menu glisse, quand il apparaît ou disparaît (pas entre deux pages qui en ont un) */
  const wide = matchMedia('(min-width: 1024px)').matches,
    newSeg = main.querySelector(':scope > .seg');
  if (wide && lastKey && key !== lastKey) {
    if (newSeg && !oldSeg) newSeg.classList.add('seg-in');
    else if (oldSeg && !newSeg) {
      oldSeg.classList.remove('seg-in');
      oldSeg.classList.add('seg-out');
      main.appendChild(oldSeg);
      setTimeout(() => oldSeg.remove(), 260);
    }
  }
  /* Bouton flottant « Ajouter du contenu » : sur le mur, seulement pour ceux qui peuvent publier */
  let fab = $('addfab');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'addfab';
    fab.className = 'addfab';
    fab.dataset.a = 'plus';
    fab.title = 'Ajouter du contenu';
    fab.setAttribute('aria-label', 'Ajouter du contenu');
    fab.innerHTML = `${ic('plus')}<span>Ajouter du contenu</span>`;
    $('phone').appendChild(fab);
  }
  const showFab = v.v === 'home' && !S.stack.length && canPublish() && !pending() && !tabs.hidden;
  fab.hidden = !showFab;
  $('phone').classList.toggle('fab', showFab);
  /* discussion : si l'on était en bas, on y reste (nouveaux messages, mise à jour) */
  main.scrollTop =
    keep && key === lastKey
      ? (v.v === 'chan' || v.v === 'rec') && atEnd
        ? main.scrollHeight
        : y
      : v.v === 'chan'
        ? main.scrollHeight
        : 0;
  if (S.dir && !wide) {
    slide((key !== lastKey ? 'pg-' : 'sg-') + (S.dir > 0 ? 'r' : 'l'));
    S.dir = 0;
  }
  S.dir = 0;
  lastKey = key;
  lastFoot = fk;
}

/* Message de confirmation en haut ; après une suppression, il propose « Annuler » pendant 5 secondes */
let undoFn = null;
/* Toutes les fenêtres venues du haut (confirmations, notifications, direct, trophées) partagent la même pile : elles s'empilent, jamais l'une sur l'autre */
function nstack() {
  let st = $('nstack');
  if (!st) {
    st = document.createElement('div');
    st.id = 'nstack';
    st.className = 'nstack';
    $('phone').appendChild(st);
  }
  return st;
}
/* Confirmations : courtes (2,6 s, 5 s avec « Annuler »), jamais plus de 2 à la fois, toujours sous l'éventuel bandeau de notification */
function toast(msg, undo) {
  const st = nstack();
  st.querySelectorAll('.tst .undo').forEach(u => u.remove());
  const d = document.createElement('div');
  d.className = 'nban tst';
  d.setAttribute('role', 'status');
  d.innerHTML = `<span class="grow">${esc(msg)}</span>${undo ? '<button class="undo" data-a="undo">Annuler</button>' : ''}`;
  const ban = st.querySelector('.nban:not(.tst)');
  if (ban) ban.after(d);
  else st.prepend(d);
  void d.offsetWidth;
  d.classList.add('on');
  undoFn = undo || null;
  d._t = setTimeout(
    () => {
      banHide(d);
      if (undoFn === undo) undoFn = null;
    },
    undo ? 5000 : 2600
  );
  [...st.querySelectorAll('.tst.on')].slice(2).forEach(x => banHide(x));
}
function sheet(title, body, quiet) {
  closeSheet();
  const d = document.createElement('div');
  d.className = 'back' + (quiet ? '' : ' anim');
  d.id = 'sheet';
  d.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><span class="grab" aria-hidden="true"></span><header><span class="h3">${title}</span><button class="ib" data-a="close" aria-label="Fermer">${ic('x')}</button></header>${body}</div>`;
  $('layer').appendChild(d);
  d.firstChild.focus({ preventScroll: true });
}
/* le volet latéral (notifications) ressort par la droite en glissant ; les autres feuilles se ferment aussitôt */
function closeSheet() {
  const s = $('sheet');
  if (!s) return;
  if (
    s.classList.contains('side') &&
    matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)').matches
  ) {
    s.id = '';
    s.classList.add('out');
    setTimeout(() => s.remove(), 230);
  } else s.remove();
}
const menuSheet = (title, items) =>
  sheet(
    title,
    `<div class="body"><div class="menu">${items
      .filter(Boolean)
      .map(i => `<button class="${i[4] ? 'danger' : ''}" data-a="${i[2]}" ${i[3] || ''}>${ic(i[0])}${i[1]}</button>`)
      .join('')}</div></div>`
  );
function commentsBody(p) {
  const ref = 'p:' + p.id,
    l = p.com.map((m, i) => msgRow(m, i, postSport(p), ref)).join('');
  return `<div class="body chat com" id="com-list">${l ? lpHelp() + l : empty('com', 'Aucun commentaire', 'Sois le premier à réagir.')}</div><div class="foot"><form class="composer" id="com-form" data-id="${p.id}"><textarea id="com-input" class="ta" rows="1" autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true" enterkeyhint="enter" placeholder="Ajouter un commentaire" aria-label="Commentaire"></textarea><button class="send" aria-label="Publier">${ic('send')}</button></form></div>`;
}
