/* /RAM Coach — coach/1-donnees.js : l'appli des enseignants, bâtie sur le code de /RAM Club.
   Mêmes comptes, mêmes clubs, mêmes groupes d'entraînement, mêmes discussions : seules les pages changent.
   Données propres à l'enseignant (dans le club, collections du serveur) :
     ELEVES  fiches élèves (équipe pédagogique seulement) : { id, n, sport, lvl, hand, side, goals, note, parents, tech, lvlH }
             id = clé de l'adhérent ; « e… » pour un élève qui n'a pas encore de compte (relié plus tard)
     SEANCES une séance d'un groupe à une date : { id: 'groupe.aaaa-mm-jj', g, d, theme, pres: { clé: P | E | A }, recap }
     SUIVI   envois à un élève (ui/13-suivi.js) : messages, bilans personnels, analyses vidéo, contenus
   Ce fichier se charge juste après data.js (voir coach.html). */
TABBAR.splice(
  0,
  TABBAR.length,
  ['today', 'home', 'Accueil'],
  ['dash', 'chart', 'Tableau de bord'],
  ['planning', 'cal', 'Planning'],
  ['eleves', 'users', 'Élèves'],
  ['msgs', 'chat', 'Messages'],
  ['clubs', 'club', 'Mes clubs'],
  ['me', 'user', 'Profil']
);
S.tab = 'today';
S.role = 'coach'; // démo : Sarah Benali, enseignante du club fictif (le vrai rôle vient du club)
Object.assign(S, {
  pl: { w: 0 },
  plScope: 'me',
  coClub: 'all',
  dashP: 'saison',
  elQ: '',
  elF: 'all',
  elTab: 'fiche',
  msTab: 'eleves',
  coTab: 'groupes',
  stP: 'mois',
  stWho: 'me'
});
Object.assign(I, {
  // actions d'une séance : annuler, rétablir, reporter, changer la date
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  forward: '<path d="M4 6l7 6-7 6"/><path d="M12 6l7 6-7 6"/>',
  calmove:
    '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M3 10h13M7 3v4M12 3v4"/><path d="M18 12h4M20 10l2 2-2 2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  ladder: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  euro: '<path d="M18 6a7 7 0 100 12M4 10h10M4 14h10"/>'
});

/* ---------- échelles de niveaux : prérequis pour y entrer, attendus pour le valider ---------- */
const SCALES = {
  Padel: {
    name: 'Échelle padel',
    levels: [
      {
        n: 1,
        t: 'Découverte',
        pre: ['Aucun'],
        att: ['Tenir la raquette (prise continentale)', 'Échanger en coup droit à mi-court', 'Connaître le score']
      },
      {
        n: 2,
        t: 'Initiation',
        pre: ['Échanger en coup droit et revers à mi-court'],
        att: [
          'Servir à la cuillère dans le bon carré',
          'Jouer après la vitre de fond (coup droit)',
          'Volée de coup droit en bloc'
        ]
      },
      {
        n: 3,
        t: 'Débutant',
        pre: ['Servir dans le carré 7 fois sur 10'],
        att: [
          'Sortie de vitre de fond en coup droit et revers',
          'Lob défensif depuis le fond',
          'Se placer à deux : côte à côte'
        ]
      },
      {
        n: 4,
        t: 'Débutant confirmé',
        pre: ['Sortie de vitre de fond simple', 'Tenir un échange de 6 coups'],
        att: ['Bandeja de placement', 'Volées croisées en bloc', 'Retour de service croisé']
      },
      {
        n: 5,
        t: 'Intermédiaire',
        pre: ['Bandeja de placement', 'Monter au filet après un lob'],
        att: ['Sortie de double vitre', 'Víbora de placement', 'Transitions fond-filet à deux']
      },
      {
        n: 6,
        t: 'Intermédiaire confirmé',
        pre: ['Víbora de placement', 'Sortie de double vitre'],
        att: ['Smash par 3 (sortie de piste)', 'Chiquita', 'Varier le rythme au fond']
      },
      {
        n: 7,
        t: 'Avancé',
        pre: ['Tournois P25 / P100'],
        att: ['Smash par 4', 'Contre-vitre', 'Construire le point selon l’adversaire']
      },
      {
        n: 8,
        t: 'Compétition',
        pre: ['Victoires en P100'],
        att: ['Plan de jeu tenu sur un match', 'Variations de service', 'Gestion des points importants']
      }
    ]
  },
  Tennis: {
    name: 'Échelle tennis',
    levels: [
      {
        n: 1,
        t: 'Blanc',
        pre: ['Aucun'],
        att: ['Renvoyer la balle en mousse', 'Lancer et rattraper', 'Se déplacer en pas chassés']
      },
      {
        n: 2,
        t: 'Violet',
        pre: ['Échanger 5 balles sur terrain rouge'],
        att: ['Coup droit et revers en échange', 'Service par le bas', 'Compter les points']
      },
      {
        n: 3,
        t: 'Rouge',
        pre: ['Échanger 10 balles sur terrain rouge'],
        att: ['Service par le haut', 'Volée de coup droit', 'Matchs sur terrain rouge']
      },
      {
        n: 4,
        t: 'Orange',
        pre: ['Matchs gagnés sur terrain rouge'],
        att: ['Coups liftés', 'Montée au filet', 'Matchs sur terrain orange']
      },
      {
        n: 5,
        t: 'Vert',
        pre: ['Matchs gagnés sur terrain orange'],
        att: ['Service régulier', 'Construire le point', 'Premiers tournois en balle verte']
      },
      {
        n: 6,
        t: 'Adulte',
        pre: ['Balle jaune, terrain complet'],
        att: ['Classement 30/5 à 30/1', 'Jeu de double', 'Tactique de base']
      },
      {
        n: 7,
        t: 'Compétition',
        pre: ['Classé 30'],
        att: ['Classement 15/5 à 15/1', 'Plan de jeu', 'Gestion des points importants']
      }
    ]
  }
};
/* grilles de progression technique : 1 à découvrir · 2 en cours · 3 acquis · 4 maîtrisé */
const TECH = {
  Padel: [
    'Coup droit',
    'Revers',
    'Volée coup droit',
    'Volée revers',
    'Bandeja',
    'Víbora',
    'Smash',
    'Lob',
    'Sortie de vitre',
    'Service / retour',
    'Placement à deux'
  ],
  Tennis: ['Coup droit', 'Revers', 'Service', 'Retour', 'Volée', 'Smash', 'Jeu de jambes', 'Tactique']
};
const STEPS = ['', 'À découvrir', 'En cours', 'Acquis', 'Maîtrisé'];
const THEMES = {
  Padel: [
    'Sortie de vitre de fond',
    'Bandeja : préparation et placement',
    'Volée de revers bloquée',
    'Jeu au filet à deux',
    'Lob défensif',
    'Víbora de placement',
    'Retour de service croisé',
    'Transitions fond-filet',
    'Smash par 3',
    'Sortie de double vitre'
  ],
  Tennis: [
    'Coup droit lifté',
    'Service : lancer de balle',
    'Revers à deux mains',
    'Volée et montée au filet',
    'Jeu de jambes',
    'Retour de service',
    'Construire le point',
    'Smash',
    'Matchs à thème'
  ]
};
/* ce que rapporte chaque séance (réglé par groupe) : par séance, à l'heure, ou par élève présent */
const TARIF_MODES = { seance: 'par séance', heure: 'de l’heure', eleve: 'par élève présent' };
const tarifOf = g => g.tarif || { mode: 'seance', prix: 0 };
const durMin = d => {
  const m = String(d || '').match(/(\d+) h(?: (\d+))?|(\d+) min/);
  return m ? (m[3] ? +m[3] : +m[1] * 60 + (+m[2] || 0)) : 60;
};

/* ---------- démo : l'enseignante du club fictif, ses groupes, ses élèves et ses séances passées ---------- */
(() => {
  const h = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  GROUPS.push({
    id: 'padl',
    type: 'train',
    defLoc: 'En salle',
    day: 1,
    h: '19 h',
    dur: '1 h 30',
    sport: 'Padel',
    coach: 'sarah',
    name: 'Padel loisirs',
    sub: 'Lundi 19 h · 1 h 30 · Sarah',
    mem: ['ines', 'thomas', 'paul', 'emma'],
    ext: ['e1'],
    tarif: { mode: 'seance', prix: 60 },
    max: 8
  });
  ensureGroupChans();
  GROUPS.forEach(g => {
    if (g.type !== 'train' || g.tarif) return;
    g.tarif = g.id === 'u12' ? { mode: 'seance', prix: 45 } : { mode: 'seance', prix: 70 };
    g.max = g.sport === 'Padel' ? 8 : 6;
  });
  ELEVES.push({
    id: 'e1',
    n: 'Jules Perrin',
    sport: 'Padel',
    lvl: 2,
    hand: 'D',
    side: 'D',
    goals: 'Découvrir le padel et jouer avec des collègues',
    note: 'Essai en septembre, pas encore inscrit dans l’appli.',
    mail: 'jules.perrin@exemple.fr',
    parents: []
  });
  const mine = GROUPS.filter(g => g.type === 'train' && g.coach === 'sarah');
  const keys = [...new Set(mine.flatMap(g => g.mem))].filter(k => M[k]);
  const GOALS = [
    'Jouer mon premier tournoi',
    'Être plus régulier au fond',
    'Oser monter au filet',
    'Passer au niveau supérieur'
  ];
  keys.forEach(k => {
    const sp = mine.find(g => g.mem.includes(k)).sport,
      lv = 2 + (h(k) % 4),
      tech = {};
    TECH[sp].forEach((t, i) => (tech[t] = 1 + ((h(k + t) + i) % 4)));
    ELEVES.push({
      id: k,
      n: M[k].n,
      sport: sp,
      lvl: lv,
      hand: h(k) % 5 ? 'D' : 'G',
      side: sp === 'Padel' ? (h(k) % 2 ? 'D' : 'G') : '',
      goals: GOALS[h(k) % GOALS.length],
      note: k === 'thomas' ? 'Douleur à l’épaule en septembre : éviter les smashs répétés.' : '',
      parents: M[k].bd && M[k].bd > '2008' ? [{ n: 'Camille Roux', tel: '06 12 34 56 78' }] : [],
      tech,
      lvlH: [
        { d: '2026-09-08', lvl: lv - 1 },
        { d: '2026-10-05', lvl: lv }
      ]
    });
  });
  // séances passées depuis la rentrée : thème, appel, quelques bilans
  mine.forEach(g => {
    for (let i = 42; i >= -14; i--) {
      const d = isoIn(-i);
      const [y, m, dd] = d.split('-').map(Number);
      if (new Date(y, m - 1, dd).getDay() !== g.day || SEANCES.some(s => s.id === g.id + '.' + d)) continue;
      const th = THEMES[g.sport][h(g.id + d) % THEMES[g.sport].length];
      if (d > TODAY) {
        if (i > -8) SEANCES.push({ id: g.id + '.' + d, g: g.id, d, theme: th });
        continue;
      }
      const pres = {};
      g.mem.concat(g.ext || []).forEach(k => (pres[k] = h(k + d) % 9 === 0 ? 'A' : h(k + d) % 7 === 0 ? 'E' : 'P'));
      SEANCES.push({
        id: g.id + '.' + d,
        g: g.id,
        d,
        theme: th,
        pres,
        recap:
          d < TODAY && h(d + g.id) % 3
            ? 'Séance « ' + th.toLowerCase() + ' » : bon investissement du groupe, on consolide la semaine prochaine.'
            : ''
      });
    }
  });
  const at = (d, hh) => +new Date(d + 'T' + String(hh).padStart(2, '0') + ':00:00');
  SUIVI.push(
    {
      id: 'sv8',
      to: 'thomas',
      by: 'sarah',
      k: 'msg',
      txt: 'Thomas, comment va ton épaule ? On adapte la séance de lundi si besoin.',
      at: at('2026-10-11', 10)
    },
    {
      id: 'sv9',
      to: 'thomas',
      by: 'thomas',
      k: 'msg',
      txt: 'Ça va mieux, merci ! Je peux faire des smashs légers.',
      at: at('2026-10-12', 21)
    },
    {
      id: 'sv10',
      to: 'thomas',
      by: 'thomas',
      k: 'video',
      url: 'https://youtu.be/exemple2',
      txt: 'Ma bandeja en match dimanche : je la sors trop tard ?',
      at: at('2026-10-12', 21)
    },
    {
      id: 'sv11',
      to: 'ines',
      by: 'sarah',
      k: 'contenu',
      txt: 'Vidéo à regarder avant jeudi : les 3 placements au filet en double.',
      url: 'https://youtu.be/exemple3',
      at: at('2026-10-09', 12)
    }
  );
})();
