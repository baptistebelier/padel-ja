/* /RAM Coach — coach/4-finitions.js : ce qui se branche sur les derniers fichiers du Club (favoris, aide),
   chargé en dernier (voir coach.html). */
/* pas de favoris dans /RAM Coach (un logiciel de gestion, pas un réseau social) : pas d'étoile en haut des pages */
favHere = () => null;
/* ---------- Aide : le guide de /RAM Coach (même page que l'aide du Club, autres rubriques) ---------- */
AIDE.splice(
  0,
  AIDE.length,
  {
    id: 'debut',
    t: 'Premiers pas',
    i: 'home',
    q: [
      [
        'Entrer dans /RAM Coach',
        'Connecte-toi sur coach.riseandmove.fr avec ton compte /RAM (le même que pour /RAM Club et /RAM JA). Le bureau de chaque club où tu enseignes te donne le rôle <b>Enseignant</b> : tes groupes et tes élèves de tous tes clubs sont alors réunis, sans jamais changer de club.'
      ],
      [
        "Installer l'appli sur mon téléphone",
        "<b>iPhone</b> : dans Safari, Partager puis « Sur l'écran d'accueil ». <b>Android</b> : dans Chrome, « Installer l'application »."
      ],
      [
        'Se déplacer',
        "La barre de navigation mène au Tableau de bord (ce qu'il y a à faire aujourd'hui), aux Statistiques, au Planning, aux Élèves, aux Messages, au Suivi (bilans à écrire, paiements à régulariser) et à Mes groupes. Le Profil est en haut à droite sur téléphone, en bas du menu sur ordinateur. Toucher à nouveau l'onglet ouvert remonte en haut de la page."
      ],
      [
        'Mes premiers pas',
        "Sur Aujourd'hui, la carte « Premiers pas » te guide : ta fiche enseignant, tes groupes, les thèmes, le premier appel, le premier bilan. Elle disparaît quand tout est fait."
      ]
    ]
  },
  {
    id: 'enseignant',
    t: 'Séances et appel',
    i: 'cal',
    q: [
      [
        'Préparer le thème',
        'Dans une séance, ou pour les cinq prochaines dans la page du groupe (École, Groupes). Les élèves voient le thème dans /RAM Club.'
      ],
      [
        "Faire l'appel",
        'Touche P (présent), E (excusé) ou A (absent) pour chaque élève, ou « Tout le monde présent ». L’appel est aussi celui du club dans /RAM Club.'
      ],
      [
        'Annuler un cours, changer de lieu',
        'Dans la séance : « Cours annulé » ou « Passer en salle ». Les élèves et leurs parents sont prévenus.'
      ],
      [
        'Écrire le bilan',
        'Un texte pour tout le groupe, et si tu veux un commentaire personnel pour chaque élève. Ils le reçoivent dans /RAM Club, École, Mon espace.'
      ],
      ['Minuteur', 'Travail, repos et nombre de séries, avec des bips : depuis Aujourd’hui ou une séance.']
    ]
  },
  {
    id: 'eleves',
    t: 'Élèves et progression',
    i: 'users',
    q: [
      [
        'La fiche élève',
        'Niveau, main, côté, objectifs, note privée (vue de l’équipe pédagogique seulement), parents.'
      ],
      [
        'Progression',
        'Touche un niveau de l’échelle pour le donner : prérequis et attendus s’affichent. Dans la grille technique, chaque coup se note de 1 à 10 : la toile d’araignée dessine le profil de l’élève.'
      ],
      [
        'Un élève sans compte',
        'Élèves, « Ajouter un élève sans compte ». Le jour où il crée son compte /RAM Club, ouvre sa fiche et « Relier à un compte du club » : il retrouve tout.'
      ]
    ]
  },
  {
    id: 'suivi',
    t: 'Messages, bilans et vidéos',
    i: 'chat',
    q: [
      [
        'Écrire à un élève',
        'Messages, « Nouveau message ». Toi seul ouvres la conversation ; l’élève (ou son parent) répond ensuite dans /RAM Club.'
      ],
      [
        'Analyser une vidéo',
        'L’élève t’envoie le lien de sa vidéo avec sa question. Dans la conversation, « Répondre par une analyse ».'
      ],
      ['Envoyer un contenu', 'Dans la fiche élève, Suivi : un exercice, un conseil, un lien.'],
      ['Les groupes', 'Messages, Groupes : les discussions de tes groupes, les mêmes que dans /RAM Club.']
    ]
  },
  {
    id: 'ecole',
    t: 'Mes groupes et tableau de bord',
    i: 'club',
    q: [
      [
        'Mes groupes',
        'Un onglet par club où tu enseignes. Dans chacun : tes groupes, « Créer un groupe dans ce club » et tes élèves de ce club. Pour en ajouter un : « J’enseigne dans un autre club », avec le code donné par son bureau.'
      ],
      [
        'Filtrer par club',
        'Planning, Élèves et Statistiques mélangent tous tes clubs ; les boutons en haut n’en gardent qu’un.'
      ],
      [
        'Tableau de bord',
        'Chiffre d’affaires, heures, élèves, séances, remplissage, présence, heures de terrain et prix moyen de l’heure, au mois, sur la saison ou sur douze mois, puis l’évolution mois par mois, par club, par groupe et par sport.'
      ],
      [
        'Ma fiche enseignant',
        'Profil, « Ma fiche enseignant » : diplôme, début d’activité, coordonnées, site, lien de réservation, tarifs. Elle apparaît dans /RAM Club, École, Enseignants.'
      ]
    ]
  },
  {
    id: 'vie-privee',
    t: 'Confidentialité',
    i: 'shield',
    q: [
      [
        'Qui voit quoi',
        'Les fiches élèves restent à l’équipe pédagogique. Le suivi d’un élève n’est lu que par lui, ses parents et ses enseignants. Ta fiche enseignant est vue par les adhérents du club, et ton âge seulement si tu le montres.'
      ]
    ]
  }
);
/* ---------- plusieurs clubs, sans jamais changer de club ----------
   Un enseignant (souvent en libéral) exerce dans un ou plusieurs clubs. /RAM Coach ouvre son club principal
   (synchronisé par ram-sync.js) et charge à côté chaque autre club où il enseigne : groupes, séances, fiches,
   suivi et adhérents sont rangés dans les mêmes listes, marqués _club. Chaque modification part vers son club
   (différences envoyées après l'affichage) ; ce que les autres changent revient toutes les 25 secondes. */
const coTeach = c => c.role === 'coach' || c.role === 'bureau';
window.ramPickClub = (clubs, last) => {
  const l = clubs.filter(coTeach).length ? clubs.filter(coTeach) : clubs;
  return l.find(c => c.main) || l.find(c => c.id === last) || l[0];
};
const CO_COLL = {
  group: () => GROUPS,
  cours: () => GROUPS,
  seance: () => SEANCES,
  suivi: () => SUIVI,
  eleve: () => ELEVES,
  brouillon: () => BROUILLONS
};
const coBare = o => {
  const c = JSON.parse(JSON.stringify(o));
  delete c._club;
  return c;
};
/* après un rechargement du club principal (les listes sont vidées), les éléments des autres clubs reviennent */
function coMerge() {
  Object.values(CO_EXT).forEach(c => {
    (c.items || new Map()).forEach(({ coll, obj }) => {
      const L = CO_COLL[coll]();
      if (!L.includes(obj)) L.push(obj);
    });
    Object.entries(c.members || {}).forEach(([k, m]) => {
      if (!M[k]) M[k] = m;
    });
  });
}
/* un élément reçu d'un autre club : mis à jour sur place (les écrans gardent leurs références) */
function coApply(cid, it) {
  const c = CO_EXT[cid],
    k = it.coll + '/' + it.id;
  if (it.coll === 'member') {
    if (it.del) delete M[it.id];
    else if (!M[it.id] || M[it.id]._club === cid) {
      M[it.id] = c.members[it.id] = Object.assign({ res: [] }, it.data, { _club: cid });
      c.base.set('member/' + it.id, JSON.stringify(coBare(M[it.id])));
    }
    return;
  }
  if (!CO_COLL[it.coll] || (it.coll === 'group' && it.data && (it.data.type !== 'train' || it.data.old))) return;
  const L = CO_COLL[it.coll](),
    cur = L.find(o => o._club === cid && o.id === it.id);
  if (it.del) {
    if (cur) L.splice(L.indexOf(cur), 1);
    c.items.delete(k);
    c.base.delete(k);
    return;
  }
  const obj = cur || { _club: cid };
  Object.keys(obj).forEach(x => x !== '_club' && delete obj[x]);
  Object.assign(obj, it.coll === 'group' ? { mem: [] } : {}, JSON.parse(JSON.stringify(it.data)), {
    id: it.id,
    _club: cid
  });
  if (!cur) L.push(obj);
  c.items.set(k, { coll: it.coll, obj });
  c.base.set(k, JSON.stringify(coBare(obj)));
}
async function coPull(cid) {
  const c = CO_EXT[cid];
  const r = await fetch('/api/ram/c/' + cid + '/sync?since=' + (c.rev || 0) + (c.rev ? '' : '&fenetre=1'), {
      credentials: 'include'
    }),
    d = await r.json();
  if (!r.ok) throw new Error(d.error || 'club');
  if (d.histoAvant) c.histoAvant = d.histoAvant;
  c.key = d.me.key;
  c.role = d.me.role;
  d.items
    .sort((a, b) => (a.coll === 'member' ? -1 : 0) - (b.coll === 'member' ? -1 : 0))
    .forEach(it => coApply(cid, it));
  c.rev = d.rev;
}
/* mise à jour arrivée toute seule : jamais de redessin pendant une saisie (sinon le texte tapé disparaît) */
const coRefresh = () => (window.ramSafeRender ? ramSafeRender() : render(true));
/* ouverture allégée : l'historique des cours et des séances n'arrive que si l'écran en a besoin.
   Ces écrans-là n'en ont pas besoin ; le planning, seulement pour une semaine ancienne. */
const CO_LEGER = ['today', 'dash', 'msgs', 'chan', 'clubs', 'cclub', 'me', 'niveaux', 'formules'];
function coHistoNeeded() {
  const v = view().v;
  if (v === 'planning') {
    // la vue affichée : la date la plus ancienne qu'elle montre
    const m = new Date(+TODAY.slice(0, 4), +TODAY.slice(5, 7) - 2 + (S.pl.m || 0), 20),
      de = S.pl.v === 'jour' ? S.pl.j || TODAY : S.pl.v === 'mois' ? REGLES.isoOfAt(m) : monday(S.pl.w);
    return !!(window.RAM && RAM.histoAvant) && de < RAM.histoAvant;
  }
  return !CO_LEGER.includes(v);
}
let coHistoRun = false;
async function coLoadHisto() {
  if (coHistoRun || !(window.RAM && RAM.live && RAM.loadHisto)) return;
  coHistoRun = true;
  let got = await RAM.loadHisto();
  for (const [cid, c] of Object.entries(CO_EXT)) {
    if (!c.base || !c.histoAvant || c.histoOk) continue;
    c.histoOk = true;
    try {
      const r = await fetch('/api/ram/c/' + cid + '/histo?avant=' + c.histoAvant, { credentials: 'include' }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error || 'club');
      d.items.forEach(it => coApply(cid, it));
      got = true;
    } catch (e) {
      c.histoOk = false;
    }
  }
  coHistoRun = false;
  if (got) coRefresh();
}
/* les autres clubs où j'enseigne : chargés une fois, puis tenus à jour */
async function coLoadExt() {
  const others = RAM.clubs.filter(c => c.id !== RAM.club && coTeach(c));
  Object.keys(CO_EXT).forEach(id => {
    if (!others.some(c => c.id === id)) delete CO_EXT[id];
  });
  await Promise.all(
    others.map(c => {
      if (!CO_EXT[c.id])
        CO_EXT[c.id] = { name: c.name, main: c.main, base: new Map(), items: new Map(), members: {}, rev: 0 };
      return coPull(c.id).catch(() => {});
    })
  );
  coRefresh();
}
/* mes changements dans les autres clubs : comparés à la dernière version reçue, envoyés par petites opérations */
let coPushing = false,
  coPushT;
async function coPush() {
  if (coPushing) return (coPushT = setTimeout(coPush, 600));
  coPushing = true;
  try {
    for (const [cid, c] of Object.entries(CO_EXT)) {
      if (!c.base) continue; // démonstration
      const ops = [],
        seen = new Set();
      Object.keys(CO_COLL).forEach(coll =>
        CO_COLL[coll]().forEach(o => {
          if (o._club !== cid) return;
          // GROUPS mêle groupes et cours particuliers : chacun part dans sa collection
          if (coll === 'group' ? !!o.once : coll === 'cours' ? !o.once : false) return;
          const k = coll + '/' + o.id,
            cur = coBare(o),
            j = JSON.stringify(cur),
            b = c.base.get(k);
          seen.add(k);
          c.items.set(k, { coll, obj: o });
          if (b === j) return;
          if (!b) ops.push({ coll, id: o.id, op: 'put', data: cur, _j: j });
          else {
            const patch = window.ramDiff(JSON.parse(b), cur);
            if (patch.length) ops.push({ coll, id: o.id, op: 'patch', patch, _j: j });
            else c.base.set(k, j);
          }
        })
      );
      // fiche /RAM Club d'un adhérent de ce club (niveau padel ou tennis donné dans /RAM Coach)
      Object.keys(c.members || {}).forEach(k => {
        const m = M[k],
          b = c.base.get('member/' + k);
        if (!m || m._club !== cid || !b) return;
        const patch = window.ramDiff(JSON.parse(b), coBare(m)).filter(op => ['pl', 'tn'].includes(op.p[0]));
        if (patch.length) ops.push({ coll: 'member', id: k, op: 'patch', patch, _j: JSON.stringify(coBare(m)) });
      });
      // un commentaire personnel effacé dans un bilan : supprimé aussi dans son club
      c.base.forEach((v, k) => {
        if (k.startsWith('suivi/') && !seen.has(k) && JSON.parse(v).by === c.key)
          ops.push({ coll: 'suivi', id: k.slice(6), op: 'del', _j: null });
      });
      if (!ops.length) continue;
      const r = await fetch('/api/ram/c/' + cid + '/ops', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ops: ops.map(o => ({ coll: o.coll, id: o.id, op: o.op, data: o.data, patch: o.patch }))
          })
        }),
        res = await r.json().catch(() => ({}));
      const bad = new Set((res.rejected || []).map(x => x.coll + '/' + x.id));
      ops.forEach(o => {
        const k = o.coll + '/' + o.id;
        if (bad.has(k)) return;
        if (o._j == null) {
          c.base.delete(k);
          c.items.delete(k);
        } else c.base.set(k, o._j);
      });
      if (bad.size) toast('Une modification n’a pas été enregistrée dans ' + c.name);
    }
  } catch (e) {
  } finally {
    coPushing = false;
  }
}
const coRender0 = render;
render = function () {
  coMerge();
  if (typeof coCyclesAuto === 'function') coCyclesAuto();
  const r = coRender0.apply(this, arguments);
  if (coHistoNeeded()) coLoadHisto();
  clearTimeout(coPushT);
  coPushT = setTimeout(coPush, 400);
  return r;
};
/* un autre club où j'enseigne a changé (connexion en direct de ram-sync.js) : ses nouveautés arrivent aussitôt */
window.ramOtherClub = (cid, rev) => {
  const c = CO_EXT[cid];
  if (!c) return false;
  if (c.base && rev > (c.rev || 0) && !coPushing)
    coPull(cid)
      .then(coRefresh)
      .catch(() => {});
  return true;
};
/* filet de sécurité (connexion coupée, appli en arrière-plan) : relecture de tous mes autres clubs toutes les 2 minutes */
setInterval(() => {
  if (!(window.RAM && RAM.live) || document.hidden || coPushing) return;
  Promise.all(Object.keys(CO_EXT).map(id => (CO_EXT[id].base ? coPull(id).catch(() => {}) : 0))).then(coRefresh);
}, 120000);
/* démonstration : l'enseignante a aussi un groupe dans un deuxième club, avec ses élèves */
if (
  !(/^(club|coach)\./.test(location.hostname) || location.pathname.startsWith('/club')) ||
  /\/demo\/?$/.test(location.pathname)
) {
  const names = ['Lucas Moreau', 'Chloé Girard', 'Karim Haddad', 'Julie Lambert', 'Romain Mercier', 'Nadia Blanc'],
    keys = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  CO_EXT.arena = { name: 'Padel Arena Brive', key: 'sarah', role: 'coach', members: {}, items: new Map() };
  keys.forEach(
    (k, i) => (M[k] = CO_EXT.arena.members[k] = { n: names[i], r: 'NC', pl: 4 + (i % 3), res: [], _club: 'arena' })
  );
  GROUPS.push({
    id: 'pab',
    _club: 'arena',
    type: 'train',
    name: 'Padel compétition',
    day: 6,
    h: '10 h',
    dur: '2 h',
    sport: 'Padel',
    coach: 'sarah',
    defLoc: 'En salle',
    mem: keys,
    max: 8,
    tarif: { mode: 'seance', prix: 90 }
  });
  ['2026-10-03', '2026-10-10'].forEach(d =>
    SEANCES.push({
      id: 'pab.' + d,
      _club: 'arena',
      g: 'pab',
      d,
      theme: 'Smash par 3',
      pres: { a1: 'P', a2: 'P', a3: 'P', a4: 'A', a5: 'P', a6: 'P' }
    })
  );
  SEANCES.push({
    id: 'pab.2026-10-17',
    _club: 'arena',
    g: 'pab',
    d: '2026-10-17',
    theme: 'Bandeja : préparation et placement'
  });
  keys.forEach((k, i) =>
    ELEVES.push({ id: k, _club: 'arena', n: names[i], sport: 'Padel', lvl: 4 + (i % 3), parents: [] })
  );
}
/* ---------- téléphone : la navigation de /RAM JA ----------
   un bandeau en haut (menu à gauche, logo /RAM COACH au centre, notifications à droite), toujours visible,
   et un volet qui glisse depuis la gauche : les pages, puis en bas le profil, le mode jour / nuit et la sortie.
   La barre d'onglets du bas n'existe plus sur téléphone ; l'ordinateur garde son menu latéral. */
Object.assign(I, { menu: '<path d="M3 6h18M3 12h18M3 18h12"/>', actif: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>' });
const coMobile = () => !matchMedia('(min-width: 1024px)').matches;
function coDrawerHTML() {
  const cur = S.stack.length ? '' : S.tab,
    me = ME(),
    dk = effDark(),
    it = (a, attrs, icon, label, on) =>
      `<button class="cdr-it${on ? ' on' : ''}" data-a="${a}" ${attrs} ${on ? 'aria-current="page"' : ''}>${icon}<span>${label}</span>${a === 'coNav' && attrs.includes('"msgs"') && coUnread() ? `<span class="cnt">${coUnread()}</span>` : ''}${a === 'coNav' && attrs.includes('"asuivi"') && coSuiviN() ? `<span class="cnt">${coSuiviN()}</span>` : ''}</button>`;
  return `<div class="cdr-logo"><img src="img/coach-v2-logo-blanc.png" alt="/RAM Coach"></div><nav class="cdr-group" aria-label="Pages">${TABBAR.filter(
    t => t[0] !== 'me'
  )
    .map(t => it('coNav', `data-t="${t[0]}"`, ic(t[1]), t[2], cur === t[0]))
    .join(
      ''
    )}</nav><div class="cdr-bottom"><i class="cdr-sep"></i>${it('coMode', '', ic('moon'), 'Mode jour / nuit')}${it('coNav', 'data-t="me"', M[me] ? av(me, 'sm') : ic('user'), M[me] ? esc(M[me].n) : 'Profil', cur === 'me')}${it('coOut', '', ic('logout'), 'Se déconnecter')}</div>`;
}
function coDrawer(open) {
  let d = $('codrawer');
  if (!d) {
    $('phone').insertAdjacentHTML(
      'beforeend',
      '<div class="cdr-veil" id="codveil" data-a="coDrawer"></div><aside class="cdr" id="codrawer" aria-label="Menu" aria-hidden="true"></aside>'
    );
    d = $('codrawer');
  }
  d.innerHTML = coDrawerHTML();
  $('phone').classList.toggle('drawer-open', !!open);
  d.setAttribute('aria-hidden', String(!open));
  if (open) {
    const f = d.querySelector('[aria-current]') || d.querySelector('button');
    if (f) f.focus({ preventScroll: true });
  }
}
Object.assign(A, {
  coDrawer() {
    coDrawer(!$('phone').classList.contains('drawer-open'));
  },
  coNav(d) {
    coDrawer(false);
    S.stack = [];
    A.tab({ t: d.t });
  },
  coMode() {
    A.ramMode();
    coDrawer(true);
  },
  coOut() {
    coDrawer(false);
    A.logout();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('phone').classList.contains('drawer-open')) coDrawer(false);
});
const coRender1 = render;
/* grand écran : un tableau de bord en bento. Les sections (un titre et ce qui le suit, ou une carte seule) se rangent sur
   deux colonnes, chacune sous la plus courte ; chiffres, raccourcis et calendriers gardent toute la largeur */
const CO_BENTO = window.matchMedia('(min-width: 1000px)');
const CO_PLEIN = '.cotiles,.coshort,.cotopact,.covue,.cobento,.cosearchbar';
function coBento() {
  const main = $('main'),
    pad = CO_BENTO.matches && main.querySelector(':scope > .pad');
  if (!pad || pad.matches('.covues,.covuej,.covuem') || ['chan', 'dm', 'post', 'art', 'aide'].includes(view().v))
    return;
  const groupes = [];
  [...pad.children].forEach(el => {
    const der = groupes[groupes.length - 1];
    if (el.matches('.cohd')) groupes.push({ els: [el], plein: false, titre: true });
    else if (der && der.titre && (der.els.length < 2 || !el.matches(CO_PLEIN))) {
      der.els.push(el);
      der.plein = der.plein || el.matches(CO_PLEIN);
    } else groupes.push({ els: [el], plein: el.matches(CO_PLEIN) || el.matches('.card:has(> .chips)') });
  });
  if (groupes.filter(g => !g.plein).length < 2) return;
  const y = main.scrollTop;
  let cols = null;
  // chaque section reprend sa place dans l'ordre, à la suite ; les hauteurs se mesurent au fur et à mesure
  groupes.forEach(g => {
    const sec = document.createElement('section');
    sec.className = 'cosec';
    sec.append(...g.els);
    if (g.plein) {
      cols = null;
      return pad.append(sec);
    }
    if (!cols) {
      const b = document.createElement('div');
      b.className = 'cobent';
      b.innerHTML = '<div class="cocol"></div><div class="cocol"></div>';
      cols = [...b.children];
      pad.append(b);
    }
    (cols[1].offsetHeight < cols[0].offsetHeight ? cols[1] : cols[0]).append(sec);
  });
  main.scrollTop = y;
}
CO_BENTO.addEventListener('change', () => render(true));
render = function () {
  const r = coRender1.apply(this, arguments),
    top = $('top');
  coBento();
  if (top && !top.querySelector('.cobar')) {
    const dk = effDark(),
      bell = top.querySelector('[data-a="notifs"]');
    top.insertAdjacentHTML(
      'afterbegin',
      `<div class="cobar"><button class="cobar-btn" data-a="coDrawer" aria-label="Ouvrir le menu">${ic('menu')}</button><span class="cobar-logo"><img src="img/coach-v2-logo-${dk ? 'blanc' : 'noir'}.png" alt="/RAM Coach"></span>${bell ? bell.outerHTML.replace('class="ib', 'class="ib cobar-bell') : '<span></span>'}</div>`
    );
    if (coMobile() && typeof topPad === 'function') topPad();
  }
  if (
    top &&
    ['planning', 'eleves', 'dash', 'histo'].includes(S.tab) &&
    !S.stack.length &&
    top.querySelector('h1') &&
    !top.querySelector('.cotopclub')
  )
    top.querySelector('h1').insertAdjacentHTML('afterend', coTopClub());
  if ($('codrawer') && $('phone').classList.contains('drawer-open')) $('codrawer').innerHTML = coDrawerHTML();
  return r;
};
document.addEventListener('change', e => {
  if (e.target.id !== 'co-topclub') return;
  S.coClub = e.target.value;
  render(true);
});
/* la courbe du mois : le chiffre du jour sous le curseur ou le doigt */
(function () {
  const montre = e => {
    const w = e.target.closest && e.target.closest('.cocurvew');
    if (!w) return;
    const svg = w.querySelector('svg'),
      r = svg.getBoundingClientRect(),
      [W, H, L, R, T, B] = w.dataset.g.split(',').map(Number),
      nD = +w.dataset.n,
      max = +w.dataset.max,
      cur = w.dataset.c.split(',').map(Number),
      prev = w.dataset.p.split(',').map(Number),
      px = ((e.clientX - r.left) * W) / r.width,
      j = Math.max(1, Math.min(nD, Math.round(((px - L) * (nD - 1)) / (W - L - R)) + 1)),
      X = +(L + ((j - 1) * (W - L - R)) / (nD - 1)).toFixed(1),
      Y = v => +(H - B - (v * (H - T - B)) / max).toFixed(1),
      g = svg.querySelector('.coscrub'),
      tip = w.querySelector('.cotip'),
      vu = v => (v === undefined ? '–' : v),
      a = cur[j - 1],
      b = prev[j - 1];
    g.removeAttribute('hidden');
    g.querySelector('line').setAttribute('x1', X);
    g.querySelector('line').setAttribute('x2', X);
    [
      ['.cocur', a],
      ['.coprev', b]
    ].forEach(([c, v]) => {
      const o = g.querySelector(c);
      o.style.display = v === undefined ? 'none' : '';
      if (v !== undefined) {
        o.setAttribute('cx', X);
        o.setAttribute('cy', Y(v));
      }
    });
    tip.hidden = false;
    tip.innerHTML = `<b>Le ${j}</b><span><i class="cocur"></i>Ce mois : ${vu(a)}</span><span><i class="coprev"></i>Mois dernier : ${vu(b)}</span>`;
    const lt = (X / W) * r.width,
      tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(r.width - tw, lt - tw / 2)) + 'px';
  };
  const cache = w => {
    w.querySelector('.coscrub').setAttribute('hidden', '');
    w.querySelector('.cotip').hidden = true;
  };
  document.addEventListener('pointerdown', montre);
  document.addEventListener('pointermove', montre);
  document.addEventListener('pointerout', e => {
    const w = e.target.closest && e.target.closest('.cocurvew');
    if (w && !(e.relatedTarget && w.contains(e.relatedTarget))) cache(w);
  });
  document.addEventListener('pointercancel', e => {
    const w = e.target.closest && e.target.closest('.cocurvew');
    if (w) cache(w);
  });
})();
/* planning : glisser le doigt passe au jour, à la semaine ou au mois suivant (le bord gauche reste au menu) */
(function () {
  let g = null;
  document.addEventListener(
    'touchstart',
    e => {
      g = null;
      if (
        S.tab !== 'planning' ||
        S.stack.length ||
        e.touches.length !== 1 ||
        $('sheet') ||
        $('phone').classList.contains('drawer-open')
      )
        return;
      const t = e.touches[0];
      if (t.clientX < 24 || !e.target.closest('#main') || e.target.closest('input,select,textarea,.chips')) return;
      g = { x: t.clientX, y: t.clientY, at: Date.now() };
    },
    { passive: true }
  );
  document.addEventListener('touchend', e => {
    if (!g) return;
    const t = e.changedTouches[0],
      dx = t.clientX - g.x,
      dy = t.clientY - g.y,
      vite = Date.now() - g.at < 800;
    g = null;
    if (!vite || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const n = dx < 0 ? 1 : -1;
    if (S.pl.v === 'jour') A.coJour({ n });
    else if (S.pl.v === 'mois') A.coMois({ n });
    else A.coWeek({ n });
  });
  document.addEventListener('touchcancel', () => (g = null));
})();
/* téléphone : le même geste que /RAM JA (public/js/rail.js). Glisser du bord gauche vers la droite ouvre le volet,
   vers la gauche le ferme ; le volet suit le doigt, puis s'ouvre ou se referme au relâcher.
   Le geste du bord gauche ouvre uniquement le menu : on bloque le « retour à la page précédente » du navigateur (iPhone). */
(function () {
  let sx = null,
    sy = 0,
    dx = 0,
    mode = '';
  const panel = () => $('codrawer');
  const stop = () => {
    const d = panel();
    if (d) {
      d.style.transition = '';
      d.style.transform = '';
    }
    sx = null;
    mode = '';
  };
  document.addEventListener(
    'touchstart',
    e => {
      if (!coMobile() || e.touches.length !== 1 || $('sheet')) return;
      const t = e.touches[0],
        isOpen = $('phone').classList.contains('drawer-open');
      if (!isOpen && t.clientX < 24) {
        mode = 'open';
        // le volet doit être prêt avant que le doigt bouge ; le bouton du menu garde son toucher
        coDrawer(false);
        if (e.cancelable && !e.target.closest('[data-a="coDrawer"]')) e.preventDefault();
      } else if (isOpen) mode = 'close';
      else return;
      sx = t.clientX;
      sy = t.clientY;
      dx = 0;
    },
    { passive: false }
  );
  document.addEventListener(
    'touchmove',
    e => {
      if (sx == null) return;
      const t = e.touches[0];
      dx = t.clientX - sx;
      if (Math.abs(t.clientY - sy) > Math.abs(dx) && Math.abs(dx) < 12) return;
      const d = panel(),
        w = d.offsetWidth,
        x = mode === 'open' ? Math.min(0, -w + Math.max(0, dx)) : Math.min(0, dx);
      d.style.transition = 'none';
      d.style.transform = `translateX(${x}px)`;
    },
    { passive: true }
  );
  document.addEventListener('touchend', () => {
    if (sx == null) return;
    const m = mode,
      moved = dx;
    stop();
    if (m === 'open' && moved > 60) coDrawer(true);
    else if (m === 'close' && moved < -60) coDrawer(false);
  });
  document.addEventListener('touchcancel', () => sx != null && stop());
})();

/* échelles de niveaux : celles du compte /RAM de l'enseignant (les mêmes dans tous ses clubs) */
addEventListener('load', () =>
  (window.ramReady || Promise.resolve()).then(() => {
    if (!(window.RAM && RAM.user)) return;
    fetch('/api/coach/echelles', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.echelles) return;
        Object.keys(d.echelles).forEach(sp => (SCALES[sp] = d.echelles[sp]));
        render(true);
      })
      .catch(() => {});
  })
);

/* ---------- notifications : seulement celles de l'enseignement ----------
   /RAM Coach est un logiciel de gestion : réservations, messages et vidéos des élèves, discussions de mes groupes.
   Le reste (publications, parties, trophées, tournois, bar) reste dans /RAM Club. */
(() => {
  const KEEP = { suivi: 1, resa: 1, chan: 1 },
    base = notify,
    seen = nVis;
  notify = function (type, by, txt, go, quiet) {
    if (!KEEP[type]) return;
    if (
      type === 'chan' &&
      !(go && GROUPS.some(g => g.id === go.id && g.type === 'train' && !g.once && coIsMe(g.coach)))
    )
      return;
    const top = NOTIFS[0];
    base(type, by, txt, go, quiet);
    if (NOTIFS[0] !== top) NOTIFS[0].coach = 1;
  };
  nVis = n => !!n.coach && seen(n);
  for (let i = NOTIFS.length - 1; i >= 0; i--) if (!NOTIFS[i].coach) NOTIFS.splice(i, 1);
})();
