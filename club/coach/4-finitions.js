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
        "Connecte-toi sur coach.riseandmove.fr avec ton compte /RAM (le même que pour /RAM Club et /RAM JA). Le bureau de ton club doit t'avoir donné le rôle <b>Enseignant</b> : tes groupes et tes élèves sont alors déjà là."
      ],
      [
        "Installer l'appli sur mon téléphone",
        "<b>iPhone</b> : dans Safari, Partager puis « Sur l'écran d'accueil ». <b>Android</b> : dans Chrome, « Installer l'application »."
      ],
      [
        'Se déplacer',
        "La barre du bas mène à Aujourd'hui, Planning, Élèves, Messages, École et Profil. Toucher à nouveau l'onglet ouvert remonte en haut de la page. L'étoile en haut d'une page l'ajoute à tes raccourcis, sur Aujourd'hui."
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
    t: 'École et statistiques',
    i: 'school',
    q: [
      [
        'Groupes et équipe',
        'École, Groupes : créer un groupe, ses places, son tarif. Le bureau choisit l’enseignant de chaque groupe ; Équipe montre qui encadre quoi.'
      ],
      [
        'Statistiques',
        'Heures données, revenus (selon le tarif de chaque groupe), remplissage et présence, à la semaine, au mois ou sur la saison.'
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
/* ---------- plusieurs clubs : un enseignant peut avoir des groupes dans plusieurs clubs ----------
   Au démarrage, /RAM Coach ouvre le club principal (celui de /RAM Club) parmi les clubs où j'enseigne.
   Les autres sont lus à part (lecture seule) : leurs séances s'ajoutent à Aujourd'hui, Planning et Statistiques,
   avec le nom de leur club ; toucher l'une d'elles ouvre ce club. */
const coTeach = c => c.role === 'coach' || c.role === 'bureau';
window.ramPickClub = (clubs, last) => {
  const l = clubs.filter(coTeach).length ? clubs.filter(coTeach) : clubs;
  return l.find(c => c.main) || l.find(c => c.id === last) || l[0];
};
async function coLoadExt() {
  const others = RAM.clubs.filter(c => c.id !== RAM.club && coTeach(c)),
    next = {};
  await Promise.all(
    others.map(async c => {
      try {
        const r = await fetch('/api/ram/c/' + c.id + '/sync?since=0', { credentials: 'include' }),
          d = await r.json(),
          get = coll => d.items.filter(i => i.coll === coll && !i.del && i.data);
        next[c.id] = {
          name: c.name,
          key: d.me.key,
          role: d.me.role,
          groups: get('group')
            .filter(i => i.data.type === 'train' && !i.data.old)
            .map(i => Object.assign({ mem: [] }, i.data, { id: i.id, _club: c.id })),
          seances: get('seance').map(i => Object.assign({}, i.data, { id: i.id }))
        };
      } catch (e) {}
    })
  );
  Object.keys(CO_EXT).forEach(k => delete CO_EXT[k]);
  Object.assign(CO_EXT, next);
  render(true);
}
setInterval(() => {
  if (window.RAM && RAM.live && !document.hidden) coLoadExt();
}, 180000);
/* séance d'un autre club : ce club s'ouvre, puis la séance */
A.coExt = d => {
  if (!(window.RAM && RAM.live))
    return toast('Démonstration : la séance s’ouvrirait dans son club, ' + CO_EXT[d.c].name);
  ramOpen(d.c).then(() => A.open({ v: 'seance', id: d.id }));
};
/* changer de club ouvert (élèves, messages, groupes) */
A.coClubs = () => {
  const l =
    window.RAM && RAM.live
      ? RAM.clubs.filter(coTeach)
      : [{ id: '', name: club().name }].concat(Object.keys(CO_EXT).map(id => ({ id, name: CO_EXT[id].name })));
  sheet(
    'Mes clubs',
    `<div class="body"><div class="menu">${l
      .map(
        c =>
          `<button data-a="coSwitch" data-id="${c.id}">${ic(!c.id || (window.RAM && c.id === RAM.club) ? 'check' : 'club')}${esc(c.name)}${c.main ? ' · principal' : ''}</button>`
      )
      .join(
        ''
      )}</div><p class="muted small">Ton planning rassemble tous tes clubs. Les élèves, les messages et les groupes sont ceux du club ouvert. Le club principal se choisit dans /RAM Club (Profil, Mes clubs).</p></div>`
  );
};
A.coSwitch = d => {
  closeSheet();
  if (!(window.RAM && RAM.live)) return d.id && toast('Démonstration : ' + CO_EXT[d.id].name + ' s’ouvrirait ici');
  if (d.id !== RAM.club) ramOpen(d.id).then(() => render());
};
/* démonstration : l'enseignante a aussi un groupe dans un deuxième club */
if (
  !(/^(club|coach)\./.test(location.hostname) || location.pathname.startsWith('/club')) ||
  /\/demo\/?$/.test(location.pathname)
)
  CO_EXT.arena = {
    name: 'Padel Arena Brive',
    key: 'sarah',
    role: 'coach',
    groups: [
      {
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
        mem: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'],
        max: 8,
        tarif: { mode: 'seance', prix: 90 }
      }
    ],
    seances: [
      {
        id: 'pab.2026-10-17',
        g: 'pab',
        d: '2026-10-17',
        theme: 'Smash par 3',
        pres: { a1: 'P', a2: 'P', a3: 'P', a4: 'A', a5: 'P', a6: 'P' }
      }
    ]
  };
