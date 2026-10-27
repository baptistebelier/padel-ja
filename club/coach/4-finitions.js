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
        "La barre de navigation mène à l'Accueil (ce qu'il y a à faire aujourd'hui), au Tableau de bord, au Planning, aux Élèves, aux Messages et à Mes clubs. Le Profil est en haut à droite sur téléphone, en bas du menu sur ordinateur. Toucher à nouveau l'onglet ouvert remonte en haut de la page."
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
        'Touche un niveau de l’échelle pour le donner : prérequis et attendus s’affichent. Dans la grille technique, chaque toucher fait avancer : à découvrir, en cours, acquis, maîtrisé.'
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
    t: 'Mes clubs et tableau de bord',
    i: 'club',
    q: [
      [
        'Mes clubs',
        'Les clubs où tu enseignes. Dans chacun : tes groupes, « Créer un groupe dans ce club » et tes élèves de ce club. Pour en ajouter un : « J’enseigne dans un autre club », avec le code donné par son bureau.'
      ],
      [
        'Filtrer par club',
        'Planning, Élèves et Tableau de bord mélangent tous tes clubs ; les boutons en haut n’en gardent qu’un.'
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
  const r = await fetch('/api/ram/c/' + cid + '/sync?since=' + (c.rev || 0), { credentials: 'include' }),
    d = await r.json();
  if (!r.ok) throw new Error(d.error || 'club');
  c.key = d.me.key;
  c.role = d.me.role;
  d.items
    .sort((a, b) => (a.coll === 'member' ? -1 : 0) - (b.coll === 'member' ? -1 : 0))
    .forEach(it => coApply(cid, it));
  c.rev = d.rev;
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
  render(true);
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
  const r = coRender0.apply(this, arguments);
  clearTimeout(coPushT);
  coPushT = setTimeout(coPush, 400);
  return r;
};
setInterval(() => {
  if (!(window.RAM && RAM.live) || document.hidden || coPushing) return;
  Promise.all(Object.keys(CO_EXT).map(id => (CO_EXT[id].base ? coPull(id).catch(() => {}) : 0))).then(() =>
    render(true)
  );
}, 25000);
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
Object.assign(I, { menu: '<path d="M3 6h18M3 12h18M3 18h12"/>' });
const coMobile = () => !matchMedia('(min-width: 1024px)').matches;
function coDrawerHTML() {
  const cur = S.stack.length ? '' : S.tab,
    me = ME(),
    dk = effDark(),
    it = (a, attrs, icon, label, on) =>
      `<button class="cdr-it${on ? ' on' : ''}" data-a="${a}" ${attrs} ${on ? 'aria-current="page"' : ''}>${icon}<span>${label}</span>${a === 'coNav' && attrs.includes('"msgs"') && coUnread() ? `<span class="cnt">${coUnread()}</span>` : ''}</button>`;
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
render = function () {
  const r = coRender1.apply(this, arguments),
    top = $('top');
  if (top && !top.querySelector('.cobar')) {
    const dk = effDark(),
      bell = top.querySelector('[data-a="notifs"]');
    top.insertAdjacentHTML(
      'afterbegin',
      `<div class="cobar"><button class="cobar-btn" data-a="coDrawer" aria-label="Ouvrir le menu">${ic('menu')}</button><span class="cobar-logo"><img src="img/coach-v2-logo-${dk ? 'blanc' : 'noir'}.png" alt="/RAM Coach"></span>${bell ? bell.outerHTML.replace('class="ib', 'class="ib cobar-bell') : '<span></span>'}</div>`
    );
    if (coMobile() && typeof topPad === 'function') topPad();
  }
  if ($('codrawer') && $('phone').classList.contains('drawer-open')) $('codrawer').innerHTML = coDrawerHTML();
  return r;
};
/* téléphone : glisser depuis le bord gauche ouvre le menu (comme /RAM JA) ; le glisser vers la gauche le referme */
(function () {
  let x0 = 0,
    y0 = 0,
    from = '';
  document.addEventListener(
    'touchstart',
    e => {
      from = '';
      if (!coMobile() || e.touches.length !== 1 || $('sheet')) return;
      const t = e.touches[0],
        open = $('phone').classList.contains('drawer-open');
      if (open || t.clientX < 28) {
        from = open ? 'ouvert' : 'bord';
        x0 = t.clientX;
        y0 = t.clientY;
      }
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    e => {
      if (!from) return;
      const t = e.changedTouches[0],
        dx = t.clientX - x0,
        dy = Math.abs(t.clientY - y0);
      if (dy > Math.abs(dx)) return;
      if (from === 'bord' && dx > 50) coDrawer(true);
      if (from === 'ouvert' && dx < -50) coDrawer(false);
      from = '';
    },
    { passive: true }
  );
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
