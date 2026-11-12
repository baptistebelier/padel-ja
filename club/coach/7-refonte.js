/* /RAM Coach — coach/7-refonte.js : refonte de l'agencement (maquette Figma « Refonte /Dojo », 11/2026).
   Navigation à deux niveaux comme /Buvette : en-tête (surtitre + grand titre + actions de la page), menu principal,
   sous-menu ; au téléphone, barre du bas à 5 entrées (Accueil, Planning, Élèves, Messages, Plus).
   Les pages gardent leurs fonctions : seul leur agencement change. */
const coWide = () => matchMedia('(min-width: 1024px)').matches;
const coEnd = (h, tag, start) => {
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
const coCut = (h, start, tag) => {
  const i = h.indexOf(start);
  if (i < 0) return ['', h];
  const e = coEnd(h, tag, i);
  return e < 0 ? ['', h] : [h.slice(i, e), h.slice(0, i) + h.slice(e)];
};

/* ---------- titres : surtitre de contexte au-dessus du grand titre ---------- */
const coTitles = {
  today: () => ['Tableau de bord', fmtD(TODAY)],
  planning: () => ['Planning', 'Mes cours'],
  eleves: () => [
    'Élèves',
    plural(coStudents().filter(k => coInClub(M[k] || coEl(k) || {})).length, 'élève actif', 'élèves actifs')
  ],
  dash: () => ['Statistiques', 'Mes statistiques'],
  asuivi: () => ['Suivi', 'À faire']
};
Object.keys(coTitles).forEach(k => {
  if (TITLES[k] || V[k]) TITLES[k] = coTitles[k];
});

/* ---------- actions de la page dans l'en-tête (grand écran) ---------- */
var coTopActions = coTopActions0;
function coTopActions0() {
  const top = $('top');
  if (!top) return;
  top.querySelectorAll('.topact').forEach(e => e.remove());
  if (!coWide() || S.stack.length) return;
  const main = $('main'),
    box = document.createElement('div');
  box.className = 'topact';
  let h = '';
  if (S.tab === 'today') h = `<button class="btn" data-a="coNewSes">${ic('plus')}Nouvelle séance</button>`;
  if (S.tab === 'eleves') h = `<button class="btn" data-a="coNewEl">${ic('plus')}Ajouter un élève</button>`;
  if (S.tab === 'clubs')
    h = `<button class="btn ghost" data-a="newPost" data-k="stage">${ic('plus')}Créer un stage</button><button class="btn" data-a="coNewGrp">${ic('plus')}Créer un groupe</button>`;
  box.innerHTML = h;
  // Planning : les vues (Jour, Semaine, Mois) et la nouvelle séance passent dans l'en-tête
  if (S.tab === 'planning') {
    const v = main.querySelector('.covue'),
      t = main.querySelector('.cotopact');
    if (v) box.append(v);
    if (t) {
      const n = t.querySelector('[data-a="coNewSes"]');
      if (n) {
        n.innerHTML = `${ic('plus')}Nouvelle séance`;
        box.append(n);
      }
    }
  }
  // Statistiques : la période dans l'en-tête
  if (S.tab === 'dash') {
    const c = main.querySelector('[data-a="coDashP"]');
    if (c && c.parentElement) box.append(c.parentElement);
  }
  if (!box.childElementCount) return;
  top.insertBefore(box, top.querySelector('.favb') || top.querySelector('[data-a="notifs"]') || null);
}

/* ---------- téléphone : barre du bas à 5 entrées, « Plus » ouvre le volet ---------- */
function coBottomBar() {
  const t = $('tabs');
  if (!t || coWide()) return;
  if (!t.querySelector('.coplus')) {
    const autres = ['dash', 'asuivi', 'clubs', 'me'],
      on = autres.includes(S.tab) && !S.stack.length;
    t.insertAdjacentHTML(
      'beforeend',
      `<button class="coplus" data-a="coDrawer" aria-label="Plus de pages" ${on ? 'aria-current="page"' : ''}>${ic('more')}Plus</button>`
    );
  }
}

/* le menu principal et l'en-tête se mettent en place à chaque affichage */
const coRailBase = ramRail;
ramRail = function (t, sub) {
  coRailBase(t, sub);
  coTopActions();
  coBottomBar();
};

/* ---------- Tableau de bord : 3 raccourcis + « Plus » ---------- */
const coTodayBase = V.today;
V.today = () => {
  let h = coTodayBase();
  const [short, rest] = coCut(h, '<div class="card cotools coshort">', 'div');
  if (!short) return h;
  h = rest.replace(/<h2 class="cohd"><span>Raccourcis<\/span><\/h2>/, '');
  const keep = [
    `<button class="btn" data-a="nvNew" data-m="cours">${ic('school')}Séance collective</button>`,
    `<button class="btn ghost" data-a="coNewGrpMsg">${ic('chat')}<span class="l">Écrire<span class="lx"> à un groupe</span></span></button>`,
    `<button class="btn ghost" data-a="coContentPick">${ic('spark')}Donner du contenu</button>`,
    `<button class="btn ghost coplusb" data-a="coShortMore">${ic('more')}Plus</button>`
  ];
  S.coShortRest = short;
  const i = h.indexOf('<div class="pad cowide">');
  return i < 0
    ? h
    : h.slice(0, i + '<div class="pad cowide">'.length) +
        `<div class="coshort3">${keep.join('')}</div>` +
        h.slice(i + '<div class="pad cowide">'.length);
};
A.coShortMore = () =>
  sheet(
    'Raccourcis',
    `<div class="body"><div class="menu">${(S.coShortRest || '')
      .replace(/^<div class="card cotools coshort">|<\/div>$/g, '')
      .replace(/class="btn ghost"/g, '')}</div></div>`
  );

/* ---------- Élèves : sous-menu, liste à gauche, aperçu de l'élève choisi à droite ---------- */
function coElPreview(k) {
  if (!k) return '';
  const lv = coLvl(k),
    gs = coGroupsOf(k),
    tel = (M[k] && M[k].tel) || (coEl(k) || {}).tel,
    mail = (M[k] && M[k].mail) || (coEl(k) || {}).mail;
  return `<div class="card coprev"><div class="row" style="gap:12px">${coAv(k, 'lg')}<span class="grow"><span class="h3">${esc(svName(k))}</span><br>${lv ? `<span class="tag ac">Niv ${esc(String(lv.n))}${lv.name ? ' · ' + esc(lv.name) : ''}</span> ` : ''}${M[k] ? '' : '<span class="tag">Sans compte</span>'}</span></div>${gs.length ? `<p class="muted small">${gs.map(g => esc(g.name)).join(' · ')}</p>` : ''}<div class="ecacts">${tel ? `<a class="btn ghost" href="tel:${esc(String(tel).replace(/[^+\d]/g, ''))}" aria-label="Appeler">${ic('phone')}</a>` : ''}${mail ? `<a class="btn ghost" href="mailto:${esc(mail)}" aria-label="Écrire un e-mail">${ic('mail')}</a>` : ''}<button class="btn grow" data-a="coOpenEl" data-id="${k}">${ic('back')}Ouvrir la fiche</button></div>${M[k] ? '' : `<button class="btn ghost full" data-a="coLink" data-id="${k}">${ic('link')}Relier à un compte /RAM</button>`}</div>`;
}
const coElevesBase = V.eleves;
V.eleves = () => {
  const all = coStudents().filter(k => coInClub(M[k] || coEl(k) || {})),
    nc = all.filter(k => !M[k]).length,
    f = S.elF,
    it = (k, i, l, n, on, x) =>
      `<button role="tab" aria-selected="${!!on}" aria-label="${l}" ${x || `data-a="coElF" data-v="${k}"`}>${ic(i)}<span class="lb">${l}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`,
    seg = `<div class="seg" role="tablist">${it('all', 'users', 'Tous les élèves', all.length, f === 'all')}${it('nc', 'user', 'Sans compte', nc, f === 'nc')}${it('', 'club', 'Groupes', 0, false, 'data-a="tab" data-t="clubs"')}${it('', 'euro', 'Formules et tarifs', 0, false, 'data-a="open" data-v="formules"')}${it('', 'ladder', 'Échelles techniques', 0, false, 'data-a="open" data-v="niveaux"')}</div>`;
  let h = coElevesBase();
  if (!coWide()) return seg + h;
  const ids = [...h.matchAll(/data-a="open" data-v="eleve" data-id="([^"]+)"/g)].map(m => m[1]),
    sel = ids.includes(S.elSel) ? S.elSel : ids[0];
  if (sel)
    h = h.replace(
      `data-a="open" data-v="eleve" data-id="${sel}"`,
      `data-a="open" data-v="eleve" data-id="${sel}" aria-current="true"`
    );
  const i = h.indexOf('<div class="pad">');
  if (i < 0) return seg + h;
  return (
    seg +
    h.slice(0, i) +
    `<div class="cobento"><div class="cobm">${h.slice(i)}</div><aside class="cobs">${coElPreview(sel)}</aside></div>`
  );
};
/* sur grand écran, toucher un élève l'affiche à droite ; « Ouvrir la fiche » ouvre sa fiche complète */
const coOpenBase = A.open;
A.open = d => {
  if (d && d.v === 'eleve' && coWide() && S.tab === 'eleves' && !S.stack.length && d.id !== S.elSel) {
    S.elSel = d.id;
    return render(true);
  }
  return coOpenBase(d);
};
A.coOpenEl = d => coOpenBase({ v: 'eleve', id: d.id });

/* Suivi : les deux colonnes (bilans, paiements) viennent déjà de coBento (2-ecrans.js) */
/* libellés courts du menu principal, comme la maquette (les titres des pages ne changent pas) */
[
  ['today', 'Accueil'],
  ['dash', 'Stats'],
  ['clubs', 'Groupes']
].forEach(([k, l]) => {
  const t = TABBAR.find(x => x[0] === k);
  if (t) t[2] = l;
});

/* ---------- Mes groupes : un club par entrée du sous-menu, groupes en cartes, historique et autre club à droite ---------- */
function coGrpCard(g) {
  const n = coStu(g).length,
    max = g.max || 0,
    pct = max ? Math.min(100, Math.round((100 * n) / max)) : 0,
    c = REGLES.cycleCourant(g, TODAY),
    E = c ? REGLES.cycleEtat(g, c, cycleSes(g), TODAY) : null,
    reste = E ? E.seances.filter(x => x.etat === 'next').length : 0,
    // état du cycle en pastille (comme /Buvette) ; le détail du cycle sous le créneau
    tag = E
      ? reste <= 1
        ? '<span class="tag hot">À renouveler</span>'
        : reste <= 3
          ? '<span class="tag ac">Fin proche</span>'
          : '<span class="tag ok">En cours</span>'
      : '',
    cyc = E ? ` · ${esc(c.nom || 'Cycle')} ${E.faites}/${E.prevues}` : '';
  return `<div class="card cogcard"><div class="row" style="gap:12px"><span class="tile">${ic('users')}</span><span class="grow"><span class="h3">${esc(g.name)}</span><br><span class="muted small">${esc(coSlot(g))} · ${esc(g.dur || '')}${cyc}</span></span>${tag}<button class="ib" data-a="open" data-v="cgroupe" data-id="${g.id}" aria-label="Ouvrir ${esc(g.name)}">${ic('back')}</button></div><div class="cogfill"><b>${n}${max ? '/' + max : ''} élève${n > 1 ? 's' : ''}</b>${max ? `<span class="gbt"><i style="width:${pct}%"></i></span>` : ''}</div></div>`;
}
function coHistoCard(id) {
  const l = coSessions(isoIn(-45), isoIn(-1), '', 1)
    .filter(x => coClubOf(x.g) === id && !isCx(x.g, x.d))
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 4);
  const todo = new Set(
    (typeof coBilansTodo === 'function' ? coBilansTodo(coDepuis('tout')) : []).map(x => x.g.id + '.' + x.d)
  );
  return `<div class="card ecs"><div class="calh">${ic('clock')}<b>Historique des séances</b></div>${
    l.length
      ? l
          .map(x => {
            const p = Object.values(REGLES.presDe(sesDu(x.g, x.d), x.g, x.d)).filter(v => v === 'P').length,
              [, m, d] = x.d.split('-');
            return `<button class="item" data-a="open" data-v="seance" data-id="${x.g.id}.${x.d}"><span class="tag">${+d}/${+m}</span><span class="grow"><span class="nm">${esc(x.g.name)}</span><br><span class="muted small">${plural(p, 'présent')} · ${todo.has(x.g.id + '.' + x.d) ? 'bilan à écrire' : 'bilan écrit'}</span></span></button>`;
          })
          .join('')
      : '<p class="muted small">Aucune séance ces dernières semaines.</p>'
  }<button class="btn ghost full" data-a="open" data-v="histo">${ic('cal')}Tout l’historique</button></div>`;
}
const coClubsBase = V.clubs;
V.clubs = () => {
  const h = coClubsBase();
  if (!coWide()) return h;
  const id = S.coClubTab,
    gs = coGroups('', true).filter(g => coClubOf(g) === id && coIsGrp(g) && !coOver(g)),
    i = h.indexOf('<div class="pad">');
  if (i < 0) return h;
  // le sous-menu : nombre de groupes par club, et « Autre club »
  let seg = h.slice(0, i);
  coClubList().forEach(c => {
    const n = coGroups('', true).filter(g => coClubOf(g) === c.id && coIsGrp(g) && !coOver(g)).length;
    if (n)
      seg = seg.replace(
        new RegExp(`(data-val="${c.id}">[\\s\\S]*?)</button>`),
        `$1<span class="cnt">${n}</span></button>`
      );
  });
  seg = seg.replace(
    /<\/div>$/,
    `<button data-a="coOtherClub" aria-label="Autre club">${ic('plus')}<span class="lb">Autre club</span></button></div>`
  );
  const main = gs.length
    ? gs.map(coGrpCard).join('')
    : none('users', 'Aucun groupe', 'Un groupe rassemble des élèves qui jouent ensemble chaque semaine.');
  const side =
    coHistoCard(id) +
    `<div class="card ecs"><div class="calh">${ic('club')}<b>Autre club</b></div><p class="muted small">J’enseigne dans un autre club : ajoute-le pour y retrouver groupes, planning et élèves.</p><button class="btn ghost" data-a="coOtherClub">${ic('plus')}Ajouter un club</button></div>`;
  return seg + `<div class="cobento"><div class="cobm cogrid2">${main}</div><aside class="cobs">${side}</aside></div>`;
};

/* ---------- Suivi : sous-menu Bilans à écrire / Paiements ---------- */
const coSuiviSeg = V.asuivi;
V.asuivi = () => {
  const h = coSuiviSeg(),
    b = (S.coBil || []).length,
    p = (S.coPayIds || []).length,
    k = S.suiviSec === 'pay' ? 'pay' : 'bil',
    it = (v, i, l, n) =>
      `<button role="tab" aria-selected="${k === v}" aria-label="${l}" data-a="coSuiviSec" data-v="${v}">${ic(i)}<span class="lb">${l}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
  return (
    `<div class="seg" role="tablist">${it('bil', 'doc', 'Bilans à écrire', b)}${it('pay', 'euro', 'Paiements', p)}</div>` +
    h
  );
};
A.coSuiviSec = d => {
  S.suiviSec = d.v;
  render(true);
  const t = [...document.querySelectorAll('#main .cohd span')].find(x =>
    (d.v === 'pay' ? /Paiements à régulariser/ : /Bilans à écrire/).test(x.textContent)
  );
  if (t) t.closest('.cohd').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ---------- Tableau de bord : la carte du jour (séance, thème, élèves et leur présence, appel) ---------- */
var coDayCard = coDayCard0;
function coDayCard0() {
  const l = coSessions(TODAY, TODAY, 'me', 1).filter(x => !isCx(x.g, x.d));
  if (!l.length) return '';
  const body = l
    .map(x => {
      const g = x.g,
        s = sesDu(g, x.d) || {},
        pres = REGLES.presDe(s, g, x.d),
        st = coStu(g),
        nP = st.filter(k => pres[k] === 'P').length,
        lab = { P: ['Présent', 'ok'], A: ['Absent', 'no'], E: ['Excusé', ''] },
        rows = st
          .map(k => {
            const v = pres[k],
              t = lab[v];
            return `<div class="item"><span>${coAv(k)}</span><span class="grow"><span class="nm">${esc(svName(k))}</span><br><span class="muted small">${t ? t[0] : 'À noter'}</span></span>${t ? `<span class="tag ${t[1] === 'ok' ? 'padel' : t[1] === 'no' ? 'hot' : ''}">${t[0]}</span>` : ''}</div>`;
          })
          .join(''),
        chan = typeof chans !== 'undefined' && chans.some(c => c.id === g.id);
      return `<div class="codayses"><div class="row" style="gap:14px;align-items:flex-start"><span class="codh"><b>${esc(g.h || '')}</b><small>${esc(g.dur || '')}</small></span><span class="grow"><span class="h3">${esc(g.name)}</span>${s.theme ? `<br><span class="muted">Thème : ${esc(s.theme)}</span>` : ''}${g.goal && !g.nv ? `<br><span class="evl cogoal">${ic('target')}Objectif : ${esc(g.goal)}</span>` : ''}<br>${g.sport ? `<span class="tag ${g.sport === 'Padel' ? 'padel' : 'tennis'}">${esc(g.sport)}</span> ` : ''}<span class="tag ac">${nP}/${st.length} présents</span></span></div><div class="codayl">${rows || '<p class="muted small">Aucun élève.</p>'}</div><div class="ecacts"><button class="btn grow" data-a="open" data-v="seance" data-id="${g.id}.${x.d}">${ic('check')}Faire l’appel</button>${chan ? `<button class="btn ghost grow" data-a="open" data-v="chan" data-id="${g.id}">${ic('chat')}Écrire au groupe</button>` : ''}</div></div>`;
    })
    .join('');
  return `<div class="card coday"><div class="calh">${ic('cal')}<b>Aujourd’hui · ${fmtD(TODAY)}</b></div>${body}</div>`;
}
const coTodayDay = V.today;
V.today = () => {
  const h = coTodayDay(),
    card = coDayCard();
  if (!card) return h;
  const i = h.indexOf('<section class="plc today">');
  if (i < 0) return h;
  const e = coEnd(h, 'section', i);
  return e < 0 ? h : h.slice(0, i) + card + h.slice(e);
};

/* =========================================================================
   Contrôle du designer (/Dojo, lots 1 et 2)
   ========================================================================= */
/* titre de section + sa carte = une seule carte, le titre dedans (picto + Barlow 19, actions à droite) */
function coMergeHd() {
  const main = $('main');
  if (!main) return;
  main.querySelectorAll('h2.cohd').forEach(h => {
    const n = h.nextElementSibling;
    if (!n || !n.classList.contains('card') || n.classList.contains('cohdin')) return;
    h.classList.add('cohdi');
    n.classList.add('cohdin');
    n.prepend(h);
  });
}
/* Accueil : pastille d'état à droite de chaque élève, et carte « Demain » */
const coDayBase = coDayCard;
coDayCard = function () {
  let h = coDayBase();
  h = h.replace(
    /<span class="grow"><span class="nm">([^<]*)<\/span><br><span class="muted small">À noter<\/span><\/span>/g,
    '<span class="grow"><span class="nm">$1</span><br><span class="muted small">Pas encore noté</span></span><span class="tag">À noter</span>'
  );
  return h;
};
function coTomorrowCard() {
  const d = isoIn(1),
    l = coSessions(d, d, 'me', 1).filter(x => !isCx(x.g, x.d));
  if (!l.length) return '';
  return `<div class="card coday cotom"><div class="calh">${ic('cal')}<b>Demain · ${fmtD(d)}</b></div>${l
    .map(
      x =>
        `<button class="item" data-a="open" data-v="seance" data-id="${x.g.id}.${x.d}"><span class="codh sm"><b>${esc(String(x.g.h || '').replace(' h', ''))}</b></span><span class="grow"><span class="nm">${esc(x.g.name)}</span><br><span class="muted small">${[(sesDu(x.g, x.d) || {}).theme, x.g.sport ? x.g.sport.toLowerCase() : '', plural(coStu(x.g).length, 'élève')].filter(Boolean).map(esc).join(' · ')}</span></span>${x.g.sport ? `<span class="tag ${x.g.sport === 'Padel' ? 'padel' : 'tennis'}">${esc(x.g.sport)}</span>` : ''}${ic('back')}</button>`
    )
    .join('')}</div>`;
}
const coTodayTom = V.today;
V.today = () => {
  const h = coTodayTom(),
    card = coTomorrowCard();
  if (!card) return h;
  // la section « Demain » d'origine est remplacée par la carte
  const i = h.search(/<section class="plc">\s*<h2 class="evday"><span>Demain/);
  if (i >= 0) {
    const e = coEnd(h, 'section', i);
    if (e > 0) return h.slice(0, i) + card + h.slice(e);
  }
  const j = h.indexOf('<div class="card coday">');
  if (j < 0) return h;
  const e = coEnd(h, 'div', j);
  return e < 0 ? h : h.slice(0, e) + card + h.slice(e);
};
/* Planning : la semaine et ‹ › dans l'en-tête ; Groupe, Collectif et Historique dans « … » */
const coTopPlan = coTopActions;
coTopActions = function () {
  coTopPlan();
  if (!coWide() || S.stack.length || S.tab !== 'planning') return;
  const top = $('top'),
    box = top && top.querySelector('.topact'),
    main = $('main');
  if (!box) return;
  const wk = main.querySelector('.card.coweek');
  if (wk) {
    const prev = wk.querySelector('[data-n="-1"]'),
      next = wk.querySelector('[data-n="1"]'),
      lab = wk.querySelector('b');
    const nav = document.createElement('div');
    nav.className = 'coplnav';
    if (prev) nav.append(prev);
    if (lab) {
      const s = document.createElement('span');
      s.textContent = lab.textContent;
      nav.append(s);
    }
    if (next) nav.append(next);
    box.prepend(nav);
    wk.remove();
  }
  const tools = main.querySelector('.cotopact');
  if (tools) {
    tools.remove();
    box.insertAdjacentHTML(
      'beforeend',
      `<button class="ib" data-a="coPlMore" aria-label="Autres actions">${ic('more')}</button>`
    );
  }
};
A.coPlMore = () =>
  sheet(
    'Planning',
    `<div class="body"><div class="menu"><button data-a="coNewGrp">${ic('users')}Créer un groupe</button><button data-a="nvNew" data-m="cours">${ic('school')}Ouvrir un collectif</button><button data-a="open" data-v="histo">${ic('cal')}Historique des séances</button></div></div>`
  );
/* au téléphone, le planning s'ouvre sur le jour */
if (!coWide() && !S.pl.v) S.pl.v = 'jour';
/* Statistiques : 4 périodes, les trimestres dans « Autre période » */
const coTopStats = coTopActions;
coTopActions = function () {
  coTopStats();
  if (!coWide() || S.stack.length || S.tab !== 'dash') return;
  const box = $('top') && $('top').querySelector('.topact .chips');
  if (!box) return;
  const tri = [...box.querySelectorAll('[data-a="coDashP"]')].filter(b => /^T\d/.test(b.textContent.trim()));
  if (!tri.length) return;
  const on = tri.find(b => b.getAttribute('aria-pressed') === 'true');
  tri.forEach(b => b.remove());
  box.insertAdjacentHTML(
    'beforeend',
    `<button class="chip${on ? ' on' : ''}" data-a="coDashTri" aria-pressed="${!!on}">${on ? esc(on.textContent) : 'Autre période'} ▾</button>`
  );
};
A.coDashTri = () =>
  sheet(
    'Autre période',
    `<div class="body"><div class="menu">${coQuarters()
      .map(([v, l]) => `<button data-a="coDashP" data-v="${v}" data-close="1">${l}</button>`)
      .join('')}</div></div>`
  );
const coDashPBase = A.coDashP;
A.coDashP = d => {
  if (d && d.close) closeSheet();
  return coDashPBase(d);
};
/* chaque affichage : fusion des titres de section avec leur carte */
const coRailMerge = ramRail;
ramRail = function (t, sub) {
  coRailMerge(t, sub);
  coMergeHd();
};
