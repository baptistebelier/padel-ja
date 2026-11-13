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

/* =========================================================================
   École, vue enseignant (maquette Figma « Refonte /Buvette », sections 7 à 9, feu vert de Baptiste)
   ========================================================================= */
const initiales = s =>
  String(s || '')
    .replace(/<[^>]*>/g, '')
    .split(/\s+/)
    .filter(w => w && /[A-Za-zÀ-ÿ0-9]/.test(w[0]))
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || '·';
const elevesDe = g => [...(g.mem || []), ...(g.ext || [])];
const nomEl = k => (typeof svName === 'function' ? svName(k) : name(k));
const avOuInit = k => (M[k] ? av(k, 'sm') : `<span class="av sm ini">${esc(initiales(nomEl(k)))}</span>`);
const pl = (x, a, b) => (x > 1 ? b : a);

/* 7. Mes cours : présences annoncées en compteurs, appel en principal, extérieur et annulation en secondaire,
   supprimer dans le menu « … » */
var sessFootEns = sessFootEns0;
function sessFootEns0(g, iso, cx, loc, nOk, nNo) {
  const n = grpN(g),
    sr = Math.max(0, n - nOk - nNo),
    ext = (g.ext || []).length,
    more = `<button class="ib" data-a="seMenu" data-id="${g.id}" data-d="${iso}" aria-label="Autres actions">${ic('more')}</button>`;
  if (cx)
    return `<div class="ecacts"><span class="tag hot">Séance annulée</span><span class="grow"></span><button class="btn ghost" data-a="cancelCourse" data-id="${g.id}" data-d="${iso}">${ic('undo')}Rétablir</button>${more}</div>`;
  return (
    `<div class="ecpres"><span class="kicker">Présences annoncées</span><div class="ecn"><span class="ok"><b>${nOk}</b>${pl(nOk, 'présent', 'présents')}</span><span class="no"><b>${nNo}</b>${pl(nNo, 'absent', 'absents')}</span><span><b>${sr}</b>sans réponse</span></div>` +
    (ext
      ? `<p class="muted small">${ext} élève${pl(ext, '', 's')} sans compte : leur présence se note pendant l’appel.</p>`
      : '') +
    `</div><div class="ecacts"><button class="btn" data-a="appel" data-id="${g.id}" data-d="${iso}">${ic('check')}Faire l’appel</button><button class="btn ghost" data-a="loc" data-g="${g.id}" data-d="${iso}">${ic(loc === 'En salle' ? 'sun' : 'home')}${loc === 'En salle' ? 'Passer en extérieur' : 'Repasser en salle'}</button><button class="btn ghost" data-a="cancelCourse" data-id="${g.id}" data-d="${iso}">${ic('ban')}Annuler la séance</button>${more}</div>`
  );
}
/* le menu « … » d'une séance : ouvrir le groupe, supprimer (personne n'est prévenu) */
A.seMenu = d => {
  const g = grp(d.id);
  if (!g) return;
  sheet(
    esc(g.name) + ' · ' + fmtD(d.d),
    `<div class="body"><div class="menu"><button data-a="open" data-v="grp" data-id="${g.id}">${ic('users')}Ouvrir le groupe</button><button class="danger" data-a="delCourse" data-id="${g.id}" data-d="${d.d}">${ic('trash')}Supprimer la séance</button></div></div>`
  );
};

/* l'appel : une ligne par élève, Présent / Absent ; à droite sur grand écran, panneau du bas au téléphone */
function appelBox(g, iso) {
  const att = REGLES.presDe(sesDu(g, iso), g, iso),
    ab = (g.abs || {})[iso] || [],
    l = elevesDe(g),
    nP = l.filter(k => att[k] === 'P').length,
    nA = l.filter(k => att[k] === 'A').length;
  const ligne = k => {
    const v = att[k],
      etat = M[k] ? (ab.includes(k) ? 'Absence signalée' : 'Compte /RAM') : 'Sans compte';
    return `<div class="apl">${avOuInit(k)}<span class="grow"><span class="nm">${esc(nomEl(k))}</span><br><span class="muted small">${etat}</span></span><span class="apt"><button class="${v === 'P' ? 'on ok' : ''}" data-a="att" data-id="${g.id}" data-d="${iso}" data-u="${k}" data-s="1" aria-pressed="${v === 'P'}">Présent</button><button class="${v === 'A' ? 'on no' : ''}" data-a="att" data-id="${g.id}" data-d="${iso}" data-u="${k}" data-s="0" aria-pressed="${v === 'A'}">Absent</button></span></div>`;
  };
  return (
    `<div class="appel" data-g="${g.id}" data-d="${iso}"><div class="calh">${ic('check')}<b>Appel</b><span class="grow"></span><span class="tag ac">${esc(hAt(g, iso))}</span></div><p class="muted small">${esc(g.name)} · ${fmtD(iso)} · ${l.length} élève${pl(l.length, '', 's')}</p>` +
    (l.length ? l.map(ligne).join('') : '<p class="muted small">Aucun élève dans ce groupe.</p>') +
    `<div class="ecn"><span class="ok"><b>${nP}</b>${pl(nP, 'présent', 'présents')}</span><span class="no"><b>${nA}</b>${pl(nA, 'absent', 'absents')}</span><span><b>${l.length - nP - nA}</b>à noter</span></div><div class="ecacts"><button class="btn ghost" data-a="appelTous" data-id="${g.id}" data-d="${iso}">${ic('check')}Tous présents</button><button class="btn grow" data-a="appelOk" data-id="${g.id}" data-d="${iso}">${ic('check')}Valider l’appel</button></div></div>`
  );
}
const appelSheet = (g, d, keep) => sheet('Appel', `<div class="body">${appelBox(g, d)}</div>`, keep);
A.appel = d => {
  S.appelSel = { g: d.id, d: d.d };
  if (wideNav() && S.tab === 'ecole' && !S.stack.length) return render(true);
  const g = grp(d.id);
  if (g) appelSheet(g, d.d);
};
A.appelTous = d => {
  const g = grp(d.id);
  if (!g) return;
  elevesDe(g).forEach(k => appelNote(g, d.d, k, 'P'));
  render(true);
  if ($('sheet') && $('sheet').querySelector('.appel')) appelSheet(g, d.d, true);
};
A.appelOk = d => {
  const g = grp(d.id);
  closeSheet();
  toast(`Appel enregistré · ${g ? esc(g.name) : 'séance'} du ${fmtD(d.d)}`);
};
/* un clic Présent / Absent dans le panneau du bas : il se met à jour sans se fermer */
const attApp = A.att;
A.att = d => {
  attApp(d);
  const g = grp(d.id);
  if (g && $('sheet') && $('sheet').querySelector('.appel')) appelSheet(g, d.d, true);
};

/* 8. Mes groupes : une carte par groupe, progression du cycle en cases (12 séances au plus) ou en barre */
function cycleInfo(g) {
  const c = REGLES.cycleCourant(g, TODAY);
  return c ? REGLES.cycleEtat(g, c, cycleSes(g), TODAY) : null;
}
var grpCardEns = grpCardEns0;
function grpCardEns0(g) {
  const E = cycleInfo(g),
    n = grpN(g),
    nowS = E && E.seances.find(x => x.etat === 'now'),
    nextS = E && E.seances.find(x => x.etat === 'next'),
    fin = !!E && !nextS && E.seances.length > 0,
    proche = !!E && (fin || E.seances.filter(x => x.etat === 'next').length <= 1),
    loc = locOf(g, nowS ? nowS.d : TODAY) || '';
  let prog = '';
  if (E && E.seances.length) {
    const dated = E.seances.filter(x => x.d),
      lab = nowS
        ? nextS
          ? `Séance ${nowS.num || E.faites} aujourd’hui`
          : 'Dernière séance aujourd’hui'
        : nextS
          ? 'Prochaine : ' + fmtD(nextS.d)
          : 'Cycle terminé',
      pct = Math.round((100 * E.faites) / Math.max(1, E.prevues)),
      vis =
        E.seances.length <= 12
          ? `<div class="cocycb gcases" role="img" aria-label="${E.faites} séances faites sur ${E.prevues}">${E.seances.map(x => `<i class="${x.etat}" title="${x.d ? fmtD(x.d) : 'Date à poser'}"></i>`).join('')}</div>`
          : `<div class="cocycb gbar" role="img" aria-label="${E.faites} séances faites sur ${E.prevues}"><span class="gbt"><i style="width:${pct}%"></i>${nowS ? `<i class="gnow" style="width:${Math.max(2, Math.round(100 / Math.max(1, E.prevues)))}%"></i>` : ''}</span><span class="gbd"><small>${dated[0] ? fmtD(dated[0].d) : ''}</small><small>${dated.length ? fmtD(dated[dated.length - 1].d) : ''}</small></span></div>`;
    prog = `<div class="gprog"><div class="gpt"><b>${E.faites}</b><span>/ ${E.prevues} séance${pl(E.prevues, '', 's')} faite${pl(E.faites, '', 's')}</span><span class="grow"></span><small>${lab}</small></div>${vis}<div class="glg"><span><i class="done"></i>Faites</span>${nowS ? '<span><i class="now"></i>Aujourd’hui</span>' : ''}<span><i class="next"></i>À venir</span></div></div>`;
  } else prog = cycleBar(g);
  const pile = elevesDe(g).slice(0, 3).map(avOuInit).join(''),
    chan = typeof chans !== 'undefined' && chans.some(x => x.id === g.id),
    etat = fin ? 'Cycle terminé' : proche ? 'Fin proche' : 'En cours',
    finTxt = fin
      ? 'Le cycle est terminé.'
      : nowS
        ? 'Le cycle se termine aujourd’hui.'
        : 'Le cycle se termine à la prochaine séance.';
  return (
    `<div class="card grpc gcard"><div class="gh"><span class="tile">${esc(initiales(g.name))}</span><span class="grow"><span class="h3">${esc(g.name)}</span><br><span class="muted small">${esc([DAYS[g.day], g.h, g.dur].filter(Boolean).join(' · '))}${loc ? ' · ' + esc(loc) : ''}</span></span><span class="tag ${proche ? 'hot' : 'ac'}">${etat}</span></div>` +
    prog +
    `<div class="gel"><span class="gpile">${pile}</span><b>${n}${g.max ? ' / ' + g.max : ''} élève${pl(n, '', 's')}</b><span class="grow"></span>${grpFull(g) ? '<span class="tag hot">Complet</span>' : ''}</div>` +
    (proche
      ? `<div class="note gfin">${ic('info')}<span>${finTxt} Renouvelle-le depuis la fiche du groupe pour garder les mêmes élèves et le même créneau.</span></div>`
      : '') +
    `<div class="ecacts"><button class="btn ghost grow" data-a="open" data-v="grp" data-id="${g.id}">${ic('users')}Ouvrir le groupe</button>${chan ? `<button class="btn ghost grow" data-a="open" data-v="chan" data-id="${g.id}">${ic('chat')}Message</button>` : ''}</div></div>`
  );
}

/* 9. Stages : fiche du stage (infos en tuiles, déroulé en frise), inscriptions à droite */
var stageCardEns = stageCardEns0;
function stageCardEns0(p, staff) {
  const y = (p.yes || 0) + (p.my === 'yes' ? 1 : 0),
    tuile = (i, l, v) =>
      v ? `<div class="sti"><span class="pbi">${ic(i)}</span><span><small>${l}</small><b>${v}</b></span></div>` : '',
    ouvert = !p.done && !p.arch && !(p.close && p.close < TODAY),
    dl = Array.isArray(p.dl) && p.dl.length,
    date = p.date ? p.date.split(' · ')[0] : p.d ? fmtD(p.d) : '',
    heures = p.h1 ? p.h1 + (p.h2 ? ' – ' + p.h2 : '') : '',
    places = p.cap ? `${y} / ${p.cap} inscrits` : `${y} inscrit${pl(y, '', 's')}`,
    frise = dl
      ? `<div class="stdl"><div class="calh"><b>Déroulé du stage</b><span class="grow"></span><span class="tag">${p.dl.length} étape${pl(p.dl.length, '', 's')}</span></div><ol class="dl-f">${p.dl.map(x => `<li><span class="dl-h">${esc(x.h1 || '')}${x.h2 ? `<small>${esc(x.h2)}</small>` : ''}</span><span class="dl-t">${esc(x.t || x.txt || '')}</span></li>`).join('')}</ol></div>`
      : '';
  return (
    `<div class="card stc"><div class="row" style="gap:6px;flex-wrap:wrap"><span class="tag">Stage</span><span class="tag ${ouvert ? 'padel' : ''}">${ouvert ? 'Inscriptions ouvertes' : 'Inscriptions closes'}</span>${p.mur === false ? '<span class="tag">Hors du mur</span>' : ''}</div>` +
    `<div class="row" style="align-items:flex-start;gap:12px"><span class="grow"><span class="stt">${p.title}</span>${p.body ? `<br><span class="muted small">${p.body}</span>` : ''}</span>${staff ? `<button class="btn ghost" data-a="pedit" data-id="${p.id}">${ic('edit')}Modifier</button>` : ''}</div>` +
    `<div class="stg">${tuile('cal', 'Date', esc(date))}${tuile('clock', 'Horaires', esc(heures))}${tuile('pin', 'Lieu', esc(p.place || ''))}${tuile('euro', 'Tarif', esc(typeof prixTxt === 'function' ? prixTxt(p) : ''))}${tuile('user', 'Encadrant', esc(typeof ensTxt === 'function' ? ensTxt(p) : ''))}${tuile('users', 'Places', places)}</div>` +
    frise +
    `<div class="ecacts">${p.mur === false && (isAdmin() || p.by === ME()) ? `<button class="btn grow" data-a="promo" data-id="${p.id}">${ic('send')}Promouvoir sur le mur</button>` : ''}<button class="btn ghost" data-a="stIns" data-id="${p.id}">${ic('users')}Voir les inscrits</button><button class="ib" data-a="open" data-v="post" data-id="${p.id}" aria-label="Ouvrir la fiche du stage">${ic('more')}</button></div></div>`
  );
}
A.stIns = d => {
  const p = posts.find(x => x.id === d.id);
  if (!p) return;
  const l = (p.ins || []).filter(k => M[k]),
    y = p.yes || 0;
  sheet(
    'Inscrits · ' + String(p.title).replace(/<[^>]*>/g, ''),
    `<div class="body">${
      l.length
        ? l
            .map(
              k =>
                `<button class="item" data-a="member" data-id="${k}">${av(k, 'sm')}<span class="grow"><span class="nm">${esc(M[k].n)}</span></span></button>`
            )
            .join('')
        : `<p class="muted">${y ? y + ' inscrit' + pl(y, '', 's') + ' : la liste nominative n’est pas disponible.' : 'Aucun inscrit pour l’instant.'}</p>`
    }</div>`
  );
};

/* colonnes de droite de l'École, vue enseignant (grand écran) */
var ecoleSideEns = ecoleSideEns0;
function ecoleSideEns0(t) {
  const me = ME(),
    mine = GROUPS.filter(g => g.type === 'train' && g.coach === me && grpLive(g));
  if (t === 'mine') {
    let sel = S.appelSel && grp(S.appelSel.g) ? { g: grp(S.appelSel.g), d: S.appelSel.d } : null;
    if (!sel) {
      const g = mine.find(x => sessions(x, 1).includes(TODAY) && !(x.cancel || []).includes(TODAY));
      if (g) sel = { g, d: TODAY };
    }
    const sem = [0, 1, 2, 3, 4, 5, 6]
      .map(i => isoIn(i))
      .map(d => {
        const l = mine.filter(g => sessions(g, 7).includes(d)),
          cx = l.filter(g => (g.cancel || []).includes(d)).length,
          txt = l.length
            ? l.length + ' séance' + pl(l.length, '', 's') + (cx ? ' · ' + cx + ' annulée' + pl(cx, '', 's') : '')
            : 'Pas de séance';
        return `<div class="item"><span class="grow"><span class="nm">${fmtD(d)}</span><br><span class="muted small">${txt}</span></span>${cx ? '<span class="tag hot">Annulée</span>' : ''}</div>`;
      });
    return (
      (sel ? `<div class="card ecs">${appelBox(sel.g, sel.d)}</div>` : '') +
      `<div class="card ecs"><div class="calh">${ic('cal')}<b>Cette semaine</b></div>${sem.join('')}</div>`
    );
  }
  if (t === 'manage') {
    const el = new Set(mine.flatMap(elevesDe)),
      // séances faites depuis la rentrée (1er septembre) : celles du cycle, ou à défaut celles du créneau
      rentree = (TODAY.slice(5) >= '09-01' ? TODAY.slice(0, 4) : String(+TODAY.slice(0, 4) - 1)) + '-09-01',
      faitesDe = g => {
        let n = 0;
        for (let d = g.from && g.from > rentree ? g.from : rentree; d <= TODAY; d = isoIn(1, d))
          if (trainOn(g, d) && !(g.cancel || []).includes(d)) n++;
        return n;
      },
      faites = mine.reduce((a, g) => a + (cycleInfo(g) ? cycleInfo(g).faites : faitesDe(g)), 0),
      fin = mine.filter(g => {
        const E = cycleInfo(g);
        return E && E.seances.filter(x => x.etat === 'next').length <= 1;
      }),
      ext = mine.reduce((a, g) => a + (g.ext || []).length, 0),
      todo = [
        ...fin.map(
          g =>
            `<button class="item" data-a="open" data-v="grp" data-id="${g.id}"><span class="grow"><span class="nm">Renouveler le cycle</span><br><span class="muted small">${esc(g.name)}</span></span></button>`
        ),
        ...mine
          .filter(g => sessions(g, 1).includes(TODAY) && !(g.cancel || []).includes(TODAY))
          .map(
            g =>
              `<button class="item" data-a="appel" data-id="${g.id}" data-d="${TODAY}"><span class="grow"><span class="nm">Faire l’appel</span><br><span class="muted small">${esc(g.name)} · ${esc(hAt(g, TODAY))}</span></span></button>`
          ),
        ...(ext
          ? [
              `<div class="item"><span class="grow"><span class="nm">Inviter ${ext} élève${pl(ext, '', 's')} sans compte</span><br><span class="muted small">Ils pourront annoncer leur présence</span></span></div>`
            ]
          : [])
      ];
    return (
      `<div class="card ecs"><div class="calh">${ic('school')}<b>Ma saison</b></div><div class="ecn"><span><b>${mine.length}</b>groupe${pl(mine.length, '', 's')}</span><span><b>${el.size}</b>élève${pl(el.size, '', 's')}</span><span class="ac"><b>${faites}</b>séance${pl(faites, '', 's')} faite${pl(faites, '', 's')}</span></div></div>` +
      (todo.length
        ? `<div class="card ecs"><div class="calh">${ic('bell')}<b>À faire</b><span class="grow"></span><span class="tag ac">${todo.length}</span></div>${todo.join('')}</div>`
        : '')
    );
  }
  if (t === 'stages') {
    const st = posts.filter(p => p.stage && !p.arch),
      p = st[0];
    if (!p) return '';
    const y = (p.yes || 0) + (p.my === 'yes' ? 1 : 0),
      m = (p.maybe || 0) + (p.my === 'maybe' ? 1 : 0),
      cap = p.cap || 0,
      autres = st
        .slice(1)
        .map(
          x =>
            `<button class="item" data-a="open" data-v="post" data-id="${x.id}"><span class="grow"><span class="nm">${x.title}</span><br><span class="muted small">${esc(x.date || '')}</span></span></button>`
        );
    return (
      `<div class="card ecs"><div class="calh">${ic('users')}<b>Inscriptions</b>${p.close ? `<span class="grow"></span><span class="tag">Clôture ${fmtD(p.close)}</span>` : ''}</div><div class="gpt"><b>${y}</b><span>${cap ? '/ ' + cap + ' places' : 'inscrit' + pl(y, '', 's')}</span></div>${cap ? `<span class="gbt"><i style="width:${Math.min(100, Math.round((100 * y) / cap))}%"></i></span>` : ''}<div class="ecn"><span><b>${y}</b>inscrit${pl(y, '', 's')}</span><span><b>${m}</b>peut-être</span>${cap ? `<span><b>${Math.max(0, cap - y)}</b>libre${pl(cap - y, '', 's')}</span>` : ''}</div></div>` +
      (autres.length
        ? `<div class="card ecs"><div class="calh">${ic('star')}<b>Autres stages</b></div>${autres.join('')}</div>`
        : '')
    );
  }
  return '';
}
/* l'École sur grand écran : colonne de droite selon l'onglet pour l'enseignant ; l'adhérent garde la sienne */
const ecoleEnsView = V.ecole;
V.ecole = () => {
  const prof = S.role === 'coach' || !!S.super || isAdmin(),
    t = S.ecTab;
  if (!wideNav() || !prof || !['mine', 'manage', 'stages'].includes(t)) return ecoleEnsView();
  // l'enseignant : sa colonne remplace celle de l'adhérent
  const h = ecolePageView(),
    side = ecoleSideEns(t),
    i = h.indexOf('<div class="pad">');
  if (!side || i < 0) return ecoleEnsView();
  return (
    h.slice(0, i) +
    `<div class="bento2"><div class="bmain">${h.slice(i)}</div><aside class="bside">${side}</aside></div>`
  );
};

/* =========================================================================
   Contrôle du designer contre Figma (10/11/2026) : corrections
   ========================================================================= */
/* le sous-menu porte la section, l'en-tête porte l'entrée active (avec un surtitre de contexte) */
const SECTION = { chans: 'Groupes', agenda: 'Agenda', ecole: 'École', club: 'Le club', me: 'Profil' };
const ENTREE = {
  chans: () => ({ club: 'Groupes du club', train: 'Entraînements', team: 'Équipes' })[S.chanTab],
  agenda: () => (S.plan.scope === 'me' ? 'Mon agenda' : 'Agenda du club'),
  ecole: () =>
    ({
      mine: 'Mes cours',
      perso: 'Mon espace',
      profs: 'Enseignants',
      stages: 'Stages',
      coll: 'Collectifs',
      manage: 'Mes groupes'
    })[S.ecTab],
  club: () => ({ teams: 'Équipes', adh: 'Adhérents', bar: 'Le bar', club: 'Le club' })[S.clubTab]
};
Object.keys(ENTREE).forEach(k => {
  const base = TITLES[k];
  if (!base) return;
  TITLES[k] = () => {
    const [t, s] = base(),
      e = ENTREE[k]();
    return [e || t, s];
  };
});
/* le sous-menu (grand écran) : la section en titre, le club en surtitre ; et les actions de la page dans l'en-tête */
const railBase = ramRail;
ramRail = function (t, sub) {
  railBase(SECTION[S.tab] && !S.stack.length ? SECTION[S.tab] : t, esc(club().short || club().name));
  topActions();
};
var topActions = topActions0;
function topActions0() {
  const top = $('top');
  if (!top) return;
  // Accueil (grand écran) : le bandeau de démonstration en tête de la colonne principale
  const mc = $('main').querySelector('.murc'),
    lone = $('main').querySelector(':scope > .pad:first-child');
  if (wideNav() && mc && lone && lone.nextElementSibling && lone.nextElementSibling.classList.contains('murg')) {
    lone.classList.add('murtop');
    mc.prepend(lone);
  }
  top.querySelectorAll('.topact').forEach(e => e.remove());
  if (!wideNav() || S.stack.length) return;
  const v = view().v,
    prof = S.role === 'coach' || !!S.super || isAdmin();
  let h = '';
  if (v === 'home' && canPublish() && !pending()) h = `<button class="btn" data-a="plus">${ic('plus')}Publier</button>`;
  if (v === 'chans' && isAdmin())
    h = `<button class="btn" data-a="newPost" data-k="chan">${ic('plus')}Créer un groupe</button>`;
  if (v === 'ecole' && S.ecTab === 'mine' && !prof)
    h = `<button class="btn" data-a="seg" data-k="ecTab" data-val="profs">${ic('plus')}Réserver un cours</button>`;
  if (v === 'ecole' && S.ecTab === 'manage' && (S.role === 'coach' || S.super))
    h = `<button class="btn" data-a="newPost" data-k="train">${ic('plus')}Créer un groupe</button>`;
  if (v === 'ecole' && S.ecTab === 'stages' && isAdmin())
    h = `<button class="btn" data-a="newPost" data-k="stage">${ic('plus')}Créer un stage</button>`;
  if (v === 'club' && S.clubTab === 'bar')
    h = `<button class="btn ghost" data-a="barMine">${ic('cal')}Mes réservations</button>`;
  const box = document.createElement('div');
  box.className = 'topact';
  box.innerHTML = h;
  // Agenda : les vues (Événements, Semaine, Jour) passent dans l'en-tête
  if (v === 'agenda') {
    const m = $('main').querySelector('.plan-modes');
    if (m) box.prepend(m);
  }
  if (!box.childElementCount) return;
  const bell = top.querySelector('[data-a="notifs"]');
  top.insertBefore(box, top.querySelector('.favb') || bell || null);
}
A.barMine = () => {
  const e = document.querySelector('.bside .ecs .kicker, .bside [data-resa]');
  if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/* Accueil : le bandeau de démonstration en tête de la colonne principale */
const homeView = V.home;
V.home = () => {
  let h = homeView();
  if (!wideNav() || !h.startsWith('<div class="pad">')) return h;
  const e = sectionAt(h, 'div', 0),
    m = h.indexOf('<div class="murc">', e);
  if (e < 0 || m < 0) return h;
  const inner = h.slice('<div class="pad">'.length, e - '</div>'.length);
  return (
    h.slice(e, m + '<div class="murc">'.length) +
    `<div class="murtop">${inner}</div>` +
    h.slice(m + '<div class="murc">'.length)
  );
};

/* Groupes : sourdine et suppression dans un menu « … » ; pastille de non-lus sur chaque entrée du sous-menu */
const chansRowView = V.chans;
V.chans = () => {
  let h = chansRowView();
  chans.forEach(c => {
    const a = muteBtn(c),
      b = typeof chanDelBtn === 'function' ? chanDelBtn(c) : '';
    if (!h.includes(a)) return;
    h = h.replace(
      a + b,
      `<button class="ib" data-a="chMenu" data-id="${c.id}" aria-label="Options de ${esc(c.name)}">${ic('more')}</button>`
    );
  });
  ['club', 'train', 'team'].forEach(k => {
    const n = chans.filter(c => c.g === k && chanOk(c) && !c.mute).reduce((a, c) => a + (c.un || 0), 0);
    if (n)
      h = h.replace(new RegExp(`(data-val="${k}">[\\s\\S]*?)</button>`), `$1<span class="cnt">${n}</span></button>`);
  });
  return h;
};
A.chMenu = d => {
  const c = chans.find(x => x.id === d.id);
  if (!c) return;
  const del = typeof chanDelBtn === 'function' && chanDelBtn(c);
  sheet(
    esc(c.name),
    `<div class="body"><div class="menu"><button data-a="mute" data-id="${c.id}" data-close="1">${ic(c.mute ? 'sound' : 'mute')}${c.mute ? 'Réactiver les notifications' : 'Mettre en sourdine'}</button>${del ? `<button class="danger" data-a="chanDel" data-id="${c.id}">${ic('trash')}Supprimer le groupe</button>` : ''}</div></div>`
  );
};
const muteApp = A.mute;
A.mute = (d, el) => {
  if (d && d.close) closeSheet();
  return muteApp(d, el);
};

/* Bar : le texte d'explication se replie */
const barTexte = barView;
barView = function () {
  let h = barTexte();
  const i = h.indexOf('<p class="muted small">Réserve ton repas');
  if (i >= 0) {
    const j = h.indexOf('</p>', i) + 4;
    h =
      h.slice(0, i) +
      `<details class="more barhow"><summary>${ic('info')}Comment réserver</summary><div class="in">${h.slice(i, j)}</div></details>` +
      h.slice(j);
  }
  return h;
};

/* Profil : le nom sur une seule ligne */
const profilNom = V.me;
V.me = () => profilNom().replace(/(<div class="mehead">[\s\S]*?<h2 class="tilt">[^<]*)<br>/, '$1 ');

/* =========================================================================
   Contrôle 2 du designer (10/11/2026)
   ========================================================================= */
/* enseignant = celui qui a des groupes à lui (le bureau de la démo voit l'École comme un adhérent) */
const enseigne = () => GROUPS.some(g => g.type === 'train' && g.coach === ME() && grpLive(g));
/* École : la vue enseignant seulement pour qui enseigne ; l'adhérent retrouve sa colonne (enseignant, bilan, vidéo) */
V.ecole = () => {
  const t = S.ecTab,
    prof = enseigne() || ((S.role === 'coach' || !!S.super) && t !== 'mine');
  let h = prof ? ecolePageView() : ecoleEnsView();
  // l'introduction « Tes cours des trois prochaines semaines… » ne s'adresse qu'aux élèves
  if (enseigne() && t === 'mine')
    h = h.replace(/<p class="muted small">Tes cours des trois prochaines semaines[\s\S]*?<\/p>/, '');
  if (!wideNav() || !prof || !['mine', 'manage', 'stages'].includes(t)) return h;
  const side = ecoleSideEns(t),
    i = h.indexOf('<div class="pad">');
  if (!side || i < 0) return h;
  return (
    h.slice(0, i) +
    `<div class="bento2"><div class="bmain">${h.slice(i)}</div><aside class="bside">${side}</aside></div>`
  );
};
/* en-tête : « Ajouter une séance » (enseignant) et « Réserver un cours » (adhérent) sur Mes cours */
const topBase = topActions;
topActions = function () {
  topBase();
  const top = $('top');
  if (
    !top ||
    !wideNav() ||
    S.stack.length ||
    view().v !== 'ecole' ||
    S.ecTab !== 'mine' ||
    top.querySelector('.topact')
  )
    return;
  const box = document.createElement('div');
  box.className = 'topact';
  box.innerHTML = enseigne()
    ? `<button class="btn" data-a="nvNew" data-m="cours">${ic('plus')}Ajouter une séance</button>`
    : `<button class="btn" data-a="seg" data-k="ecTab" data-val="profs">${ic('plus')}Réserver un cours</button>`;
  top.insertBefore(box, top.querySelector('.favb') || top.querySelector('[data-a="notifs"]') || null);
};
/* Groupes : l'aide ne parle plus du haut-parleur */
const chansAide = V.chans;
V.chans = () =>
  chansAide().replace(
    "Le haut-parleur coupe les notifications d'un groupe.",
    'Le menu « … » d’un groupe le met en sourdine.'
  );
/* Bar : plus d'étiquettes Midi / Soir sur chaque plat (le choix Midi / Soir est en haut de la carte) */
const barTags = barView;
barView = function () {
  return barTags().replace(/<span class="tag ghost">(Midi|Soir)<\/span>/g, '');
};
/* Mes groupes : groupes sans cycle, la même jauge (fenêtre des dernières et prochaines séances) */
const grpCardBase = grpCardEns;
grpCardEns = function (g) {
  if (cycleInfo(g)) return grpCardBase(g);
  const all = [],
    end = g.to || isoIn(180);
  for (let d = g.from || isoIn(-365); d <= end; d = isoIn(1, d)) if (trainOn(g, d)) all.push(d);
  const l = g.to
    ? all
    : all
        .filter(d => d < TODAY)
        .slice(-8)
        .concat(all.filter(d => d >= TODAY).slice(0, 9));
  if (!l.length) return grpCardBase(g);
  const st = d => ((g.cancel || []).includes(d) ? 'cx' : d === TODAY ? 'now' : d < TODAY ? 'done' : 'next'),
    faites = l.filter(d => ['done', 'now'].includes(st(d))).length,
    total = l.filter(d => st(d) !== 'cx').length,
    next = l.find(d => d > TODAY && st(d) !== 'cx'),
    now = l.includes(TODAY),
    lab = now ? 'Séance aujourd’hui' : next ? 'Prochaine : ' + fmtD(next) : '',
    vis =
      l.length <= 12
        ? `<div class="cocycb gcases" role="img" aria-label="${faites} séances faites sur ${total}">${l.map(d => `<i class="${st(d)}" title="${fmtD(d)}"></i>`).join('')}</div>`
        : `<div class="cocycb gbar" role="img" aria-label="${faites} séances faites sur ${total}"><span class="gbt"><i style="width:${Math.round((100 * (faites - (now ? 1 : 0))) / Math.max(1, total))}%"></i>${now ? `<i class="gnow" style="width:${Math.max(2, Math.round(100 / Math.max(1, total)))}%"></i>` : ''}</span><span class="gbd"><small>${fmtD(l[0])}</small><small>${fmtD(l[l.length - 1])}</small></span></div>`,
    prog = `<div class="gprog"><div class="gpt"><b>${faites}</b><span>/ ${total} séance${pl(total, '', 's')} faite${pl(faites, '', 's')}</span><span class="grow"></span><small>${lab}</small></div>${vis}<div class="glg"><span><i class="done"></i>Faites</span>${now ? '<span><i class="now"></i>Aujourd’hui</span>' : ''}<span><i class="next"></i>À venir</span></div></div>`;
  const h = grpCardBase(g),
    a = h.indexOf('<div class="cocycle">'),
    e = a >= 0 ? sectionAt(h, 'div', a) : -1;
  return e > 0 ? h.slice(0, a) + prog + h.slice(e) : h;
};
/* Stages : déroulé vide → « Ajouter le déroulé » ; carte « Autres stages » toujours présente */
const stageBase = stageCardEns;
stageCardEns = function (p, staff) {
  let h = stageBase(p, staff);
  if (!(Array.isArray(p.dl) && p.dl.length) && staff)
    h = h.replace(
      '<div class="ecacts">',
      `<div class="stdl stvide"><div class="calh"><b>Déroulé du stage</b></div><p class="muted small">Aucune étape pour l’instant : les adhérents verront le programme de la journée.</p><button class="btn ghost" data-a="pedit" data-id="${p.id}">${ic('plus')}Ajouter le déroulé</button></div><div class="ecacts">`
    );
  return h;
};
const sideBase = ecoleSideEns;
ecoleSideEns = function (t) {
  let h = sideBase(t);
  if (t === 'stages' && h && !h.includes('Autres stages'))
    h += `<div class="card ecs"><div class="calh">${ic('star')}<b>Autres stages</b></div><p class="muted small">Aucun autre stage prévu.</p>${isAdmin() ? `<button class="btn ghost full" data-a="newPost" data-k="stage">${ic('plus')}Créer un stage</button>` : ''}</div>`;
  return h;
};
/* présences annoncées : une case n'est colorée que si elle compte quelqu'un */
const footBase = sessFootEns;
sessFootEns = function (g, iso, cx, loc, nOk, nNo) {
  let h = footBase(g, iso, cx, loc, nOk, nNo);
  if (!nOk) h = h.replace('<span class="ok"><b>0</b>', '<span><b>0</b>');
  if (!nNo) h = h.replace('<span class="no"><b>0</b>', '<span><b>0</b>');
  return h;
};
