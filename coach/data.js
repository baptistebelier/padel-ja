/* /RAM Coach — data.js : données d'exemple du prototype (aucun serveur) et petits outils.
   Le coach de la démo : Camille Roux, responsable pédagogique du TPC Les Tilleuls (le club de la démo /RAM Club).
   Les élèves sont des adhérents /RAM Club ; ceux qui n'ont pas encore créé leur compte ont été ajoutés à la main
   par le coach (account: 'manuel') et retrouveront tout en créant leur compte. */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ---------- pictos (mêmes traits que /RAM Club) ---------- */
const I = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3.5-5 7-5s7 1.5 7 5M16 4.5a3.5 3.5 0 010 7M22 20c0-2.5-1.5-4-4-4.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  school: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
  video: '<path d="M3 6h13v12H3zM16 10l5-3v10l-5-3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  ladder: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  euro: '<path d="M17 6.5A6.5 6.5 0 007 12a6.5 6.5 0 0010 5.5M4 10h9M4 14h9"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
  send: '<path d="M4 12l16-8-6 16-3-6z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6.5 7-11.5a7 7 0 10-14 0C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  mega: '<path d="M3 10v4h3l7 5V5L6 10zM17 9a4 4 0 010 6M19.5 6.5a7.5 7.5 0 010 11"/>',
  stop: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  news: '<path d="M4 4h13v16H4zM17 9h3v11h-3M7 8h7M7 12h7M7 16h4"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4c0 3 2 4.5 4 4.5M16 6h4c0 3-2 4.5-4 4.5M12 13v4M8 20h8M9.5 17h5"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M4 12a8 8 0 108-8H8M8 1v6h6" transform="translate(0 0)"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  mail: '<path d="M3 6h18v12H3zM3 7l9 6 9-6"/>',
  phone: '<path d="M7 3h10v18H7zM11 18h2"/>',
  lock: '<path d="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>'
};
const ic = n =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || ''}</svg>`;

/* ---------- dates ---------- */
const TODAY = '2026-10-27'; // mardi, pendant les vacances de la Toussaint
const NOW_MIN = 11 * 60 + 20; // 11 h 20 : le stage du matin est en cours
const D = iso => new Date(iso + 'T12:00:00');
const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (iso, n) => {
  const d = D(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmtDay = iso => {
  const d = D(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
};
const fmtShort = iso => {
  const d = D(iso);
  return `${d.getDate()} ${MOIS[d.getMonth()]}`;
};
const hm = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`.replace(' h 00', ' h');
const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const SEASON0 = '2026-09-07';
const SEASON1 = '2026-12-19';
const VACANCES = [['2026-10-17', '2026-11-01', 'Vacances de la Toussaint']];
const FERIES = ['2026-11-11'];
const inVac = iso => VACANCES.some(v => iso >= v[0] && iso <= v[1]);

/* tirage pseudo-aléatoire fixe : la démo est la même à chaque ouverture */
let SEED = 7;
const rnd = () => {
  SEED |= 0;
  SEED = (SEED + 0x6d2b79f5) | 0;
  let t = Math.imul(SEED ^ (SEED >>> 15), 1 | SEED);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = l => l[Math.floor(rnd() * l.length)];

/* ---------- l'équipe pédagogique ---------- */
const ME = 'cr';
const COACHES = {
  cr: { id: 'cr', first: 'Camille', last: 'Roux', role: 'Responsable pédagogique', sports: ['Padel'], dip: 'DE JEPS padel', color: '#E0F50A' },
  jm: { id: 'jm', first: 'Julien', last: 'Morel', role: 'Enseignant', sports: ['Tennis', 'Padel'], dip: 'DE JEPS tennis', color: '#2F9BFF' },
  lg: { id: 'lg', first: 'Léa', last: 'Garnier', role: 'Enseignante', sports: ['Tennis', 'Padel'], dip: 'CQP tennis', color: '#F5104C' }
};

/* ---------- échelles de niveau : prérequis (pour entrer) et attendus (pour valider) ---------- */
const SCALES = {
  Padel: {
    name: 'Échelle padel du club',
    levels: [
      { n: 1, t: 'Découverte', pre: ['Aucun'], att: ['Tenir la raquette (prise continentale)', 'Échanger en coup droit à mi-court', 'Connaître le score'] },
      { n: 2, t: 'Initiation', pre: ['Échanger en coup droit et revers à mi-court'], att: ['Servir à la cuillère dans le bon carré', 'Laisser rebondir puis jouer après la vitre de fond (coup droit)', 'Volée de coup droit en bloc'] },
      { n: 3, t: 'Débutant', pre: ['Servir dans le carré 7 fois sur 10'], att: ['Sortie de vitre de fond en coup droit et revers', 'Lob défensif depuis le fond', 'Se placer à deux : côte à côte'] },
      { n: 4, t: 'Débutant confirmé', pre: ['Sortie de vitre de fond simple', 'Tenir un échange de 6 coups'], att: ['Bandeja de placement', 'Volées croisées en bloc', 'Retour de service croisé'] },
      { n: 5, t: 'Intermédiaire', pre: ['Bandeja de placement', 'Monter au filet après un lob'], att: ['Sortie de double vitre', 'Víbora de placement', 'Transitions fond-filet à deux'] },
      { n: 6, t: 'Intermédiaire confirmé', pre: ['Víbora de placement', 'Sortie de double vitre'], att: ['Smash par 3 (sortie de piste)', 'Chiquita', 'Varier le rythme au fond'] },
      { n: 7, t: 'Avancé', pre: ['Tournois P25 / P100'], att: ['Smash par 4', 'Contre-vitre', 'Construire le point selon l’adversaire'] },
      { n: 8, t: 'Compétition', pre: ['Victoires en P100'], att: ['Plan de jeu tenu sur un match', 'Variations de service', 'Gestion des points importants'] }
    ]
  },
  Tennis: {
    name: 'Galaxie Tennis (jeunes)',
    levels: [
      { n: 1, t: 'Blanc', pre: ['Aucun'], att: ['Renvoyer la balle en mousse', 'Lancer et rattraper', 'Se déplacer en pas chassés'] },
      { n: 2, t: 'Violet', pre: ['Échanger 5 balles sur terrain rouge'], att: ['Coup droit et revers en échange', 'Service par le bas', 'Compter les points'] },
      { n: 3, t: 'Rouge', pre: ['Échanger 10 balles sur terrain rouge'], att: ['Service par le haut', 'Volée de coup droit', 'Matchs sur terrain rouge'] },
      { n: 4, t: 'Orange', pre: ['Matchs gagnés sur terrain rouge'], att: ['Coups liftés', 'Montée au filet', 'Matchs sur terrain orange'] },
      { n: 5, t: 'Vert', pre: ['Matchs gagnés sur terrain orange'], att: ['Service régulier', 'Construire le point', 'Premiers tournois en balle verte'] }
    ]
  }
};

/* ---------- grilles de progression technique : 1 à découvrir · 2 en cours · 3 acquis · 4 maîtrisé ---------- */
const TECH = {
  Padel: ['Coup droit', 'Revers', 'Volée coup droit', 'Volée revers', 'Bandeja', 'Víbora', 'Smash', 'Lob', 'Sortie de vitre', 'Service / retour', 'Placement à deux'],
  Tennis: ['Coup droit', 'Revers', 'Service', 'Retour', 'Volée', 'Smash', 'Jeu de jambes', 'Tactique']
};
const STEPS = ['', 'À découvrir', 'En cours', 'Acquis', 'Maîtrisé'];

/* ---------- types de séance : ce que chacune rapporte au coach ---------- */
const TYPES = {
  colA: { name: 'Collectif adultes', mode: 'seance', prix: 60 },
  colJ: { name: 'Collectif jeunes', mode: 'seance', prix: 45 },
  comp: { name: 'Entraînement compétition', mode: 'seance', prix: 80 },
  indiv: { name: 'Cours individuel', mode: 'heure', prix: 45 },
  stage: { name: 'Stage vacances', mode: 'eleve', prix: 28 }
};
const MODES = { seance: 'par séance', heure: 'de l’heure', eleve: 'par élève et par jour' };

/* ---------- élèves ---------- */
const PRENOMS_A = ['Hugo', 'Sarah', 'Mehdi', 'Thomas', 'Inès', 'Nathan', 'Marc', 'Antoine', 'Claire', 'Julie', 'Karim', 'Sophie', 'Olivier', 'Émilie', 'Paul', 'Nadia', 'Vincent', 'Laura', 'Romain', 'Céline', 'Yanis', 'Manon', 'Pierre', 'Amandine'];
const NOMS = ['Martin', 'Benali', 'Lacroix', 'Leroy', 'Faure', 'Colin', 'Dubois', 'Brun', 'Moreau', 'Girard', 'Haddad', 'Lambert', 'Rousseau', 'Mercier', 'Blanc', 'Petit', 'Fontaine', 'Chevalier', 'Robin', 'Masson', 'Garcia', 'Perrin', 'Morin', 'Lefèvre', 'Bertrand', 'Roche', 'Vidal', 'Arnaud', 'Barbier', 'Renard'];
const PRENOMS_J = ['Lina', 'Noah', 'Jade', 'Léo', 'Chloé', 'Gabin', 'Lou', 'Malo', 'Alice', 'Timéo', 'Zoé', 'Sacha', 'Rose', 'Nolan', 'Emma', 'Adam', 'Léna', 'Tom', 'Mia', 'Ethan', 'Anna', 'Kaïs', 'Louise', 'Raphaël'];
const COLORS = ['#3B6B5A', '#4E5B2C', '#5C4A36', '#2F3E66', '#355E3B', '#6B3A4B', '#3E5C6E', '#6A5A2A', '#4B3F6B', '#2E5E5A'];

const STUDENTS = {};
let sid = 0;
function student(o) {
  const id = 's' + ++sid;
  STUDENTS[id] = Object.assign(
    {
      id,
      account: 'club',
      hand: rnd() < 0.86 ? 'Droitier' : 'Gaucher',
      side: null,
      goals: '',
      note: '',
      parents: [],
      groups: [],
      carnet: null,
      tech: {},
      levelHist: [],
      ja: [],
      color: COLORS[sid % COLORS.length]
    },
    o
  );
  return id;
}
const ADULT_GOALS = ['Jouer mon premier tournoi P25', 'Être plus régulier au fond', 'Oser monter au filet', 'Progresser en bandeja', 'Prendre du plaisir et me dépenser', 'Passer niveau 5 cette saison', 'Mieux me placer avec mon partenaire'];
const KID_GOALS = ['Passer au niveau supérieur', 'Faire ses premiers matchs', 'Gagner en confiance', 'Améliorer le service'];
const NOTES = ['Douleur à l’épaule droite en septembre : éviter les smashs répétés.', 'Très motivé, a besoin d’être cadré.', 'Timide en groupe, progresse mieux en petit effectif.', 'Revient de blessure (genou) : échauffement long.', '', '', '', ''];

let nA = 0,
  nJ = 0;
function adult(sport, lvl, extra = {}) {
  // on saute les 8 premiers noms : ce sont les adhérents de la démo /RAM Club, placés plus bas
  const first = PRENOMS_A[(nA + 8) % PRENOMS_A.length],
    last = NOMS[(nA + 8) % NOMS.length];
  nA++;
  return student(
    Object.assign(
      {
        first,
        last,
        born: 1968 + Math.floor(rnd() * 32),
        sport,
        level: lvl,
        side: sport === 'Padel' ? pick(['Droite', 'Gauche', 'Les deux']) : null,
        goals: pick(ADULT_GOALS),
        note: pick(NOTES),
        phone: '06 ' + [1, 2, 3, 4].map(() => String(10 + Math.floor(rnd() * 89))).join(' '),
        mail: (first + '.' + last).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@exemple.fr'
      },
      extra
    )
  );
}
function kid(sport, lvl, extra = {}) {
  const first = PRENOMS_J[nJ % PRENOMS_J.length],
    last = NOMS[(nJ * 7 + 3) % NOMS.length];
  nJ++;
  const pf = pick(['Nadia', 'Céline', 'Julie', 'Sophie', 'Émilie', 'Karim', 'Olivier', 'Vincent', 'Romain']);
  return student(
    Object.assign(
      {
        first,
        last,
        born: 2010 + Math.floor(rnd() * 9),
        sport,
        level: lvl,
        side: sport === 'Padel' ? pick(['Droite', 'Gauche']) : null,
        goals: pick(KID_GOALS),
        note: pick(NOTES),
        parents: [{ name: pf + ' ' + last, rel: ['Nadia', 'Céline', 'Julie', 'Sophie', 'Émilie'].includes(pf) ? 'Mère' : 'Père', phone: '06 ' + [1, 2, 3, 4].map(() => String(10 + Math.floor(rnd() * 89))).join(' '), mail: (pf + '.' + last).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@exemple.fr' }]
      },
      extra
    )
  );
}

/* ---------- groupes de l'école ---------- */
const GROUPS = {
  g1: { id: 'g1', name: 'Padel Adultes Débutants', sport: 'Padel', type: 'colA', coach: 'cr', day: 1, start: 19 * 60, dur: 90, court: 'Terrain 2', cap: 8, kids: false, chat: true, lv: '1 à 3' },
  g2: { id: 'g2', name: 'Padel Adultes Intermédiaires', sport: 'Padel', type: 'colA', coach: 'cr', day: 2, start: 19 * 60, dur: 90, court: 'Terrain 1', cap: 8, kids: false, chat: true, lv: '4 à 5' },
  g3: { id: 'g3', name: 'Padel Ados 12-16 ans', sport: 'Padel', type: 'colJ', coach: 'jm', day: 3, start: 14 * 60, dur: 90, court: 'Terrain 1', cap: 8, kids: true, chat: true, lv: '2 à 5' },
  g4: { id: 'g4', name: 'Padel Compétition', sport: 'Padel', type: 'comp', coach: 'cr', day: 4, start: 20 * 60, dur: 120, court: 'Terrains 1 et 2', cap: 8, kids: false, chat: true, lv: '6 à 8' },
  g5: { id: 'g5', name: 'Padel Féminines', sport: 'Padel', type: 'colA', coach: 'lg', day: 6, start: 10 * 60, dur: 90, court: 'Terrain 2', cap: 8, kids: false, chat: false, lv: '2 à 5' },
  g6: { id: 'g6', name: 'Mini-tennis Galaxie', sport: 'Tennis', type: 'colJ', coach: 'lg', day: 3, start: 10 * 60, dur: 60, court: 'Court 3', cap: 8, kids: true, chat: true, lv: 'Blanc à Rouge' },
  g7: { id: 'g7', name: 'Tennis U12', sport: 'Tennis', type: 'colJ', coach: 'jm', day: 6, start: 14 * 60, dur: 90, court: 'Courts 1 et 2', cap: 8, kids: true, chat: true, lv: 'Orange à Vert' },
  g8: { id: 'g8', name: 'Tennis Adultes Loisir', sport: 'Tennis', type: 'colA', coach: 'jm', day: 4, start: 18 * 60 + 30, dur: 90, court: 'Court 2', cap: 6, kids: false, chat: false, lv: '40 à 30/2' },
  st1: { id: 'st1', name: 'Stage Toussaint padel jeunes', sport: 'Padel', type: 'stage', coach: 'cr', stage: ['2026-10-26', '2026-10-30'], start: 10 * 60, dur: 120, court: 'Terrains 1 et 2', cap: 12, kids: true, chat: true, lv: '2 à 6' }
};
const RANKS = ['NC', '40', '30/5', '30/4', '30/3', '30/2', '30/1', '30', '15/5', '15/4'];
function fill(g, n, mk) {
  for (let i = 0; i < n; i++) {
    const id = mk(i);
    STUDENTS[id].groups.push(g);
  }
}
fill('g1', 7, () => adult('Padel', 1 + Math.floor(rnd() * 3)));
fill('g2', 8, () => adult('Padel', 4 + Math.floor(rnd() * 2)));
fill('g3', 7, () => kid('Padel', 2 + Math.floor(rnd() * 4)));
fill('g4', 6, () => adult('Padel', 6 + Math.floor(rnd() * 3)));
fill('g5', 6, () => adult('Padel', 2 + Math.floor(rnd() * 4)));
fill('g6', 8, () => kid('Tennis', 1 + Math.floor(rnd() * 3), { born: 2018 + Math.floor(rnd() * 3) }));
fill('g7', 7, () => kid('Tennis', 4 + Math.floor(rnd() * 2), { born: 2014 + Math.floor(rnd() * 3) }));
fill('g8', 5, () => adult('Tennis', null, { rank: pick(RANKS.slice(1, 7)) }));
// stage : des ados du club et trois nouveaux, ajoutés à la main (pas encore de compte /RAM Club)
Object.values(STUDENTS)
  .filter(s => s.groups.includes('g3'))
  .slice(0, 6)
  .forEach(s => s.groups.push('st1'));
for (let i = 0; i < 3; i++) STUDENTS[kid('Padel', 2 + i, { account: 'manuel' })].groups.push('st1');
STUDENTS['s3'].account = 'manuel'; // un adulte débutant inscrit à l'accueil, compte pas encore créé

// les adhérents de la démo /RAM Club qu'on retrouve ici
const named = { s1: ['Hugo', 'Martin'], s9: ['Sarah', 'Benali'], s10: ['Mehdi', 'Lacroix'], s11: ['Thomas', 'Leroy'], s23: ['Nathan', 'Colin'], s24: ['Marc', 'Dubois'], s25: ['Antoine', 'Brun'] };
Object.entries(named).forEach(([k, [f, l]]) => Object.assign(STUDENTS[k], { first: f, last: l, mail: (f + '.' + l).toLowerCase() + '@exemple.fr' }));

// cours individuels de Camille
const indiv = [
  { s: student({ first: 'Inès', last: 'Faure', born: 1991, sport: 'Padel', level: 4, side: 'Gauche', goals: 'Préparer le P100 de décembre', phone: '06 41 22 87 15', mail: 'ines.faure@exemple.fr' }), day: 2, start: 14 * 60, dur: 60 },
  { s: 's9', day: 5, start: 12 * 60 + 30, dur: 60 },
  { s: 's24', day: 1, start: 17 * 60 + 30, dur: 60 }
];
indiv.forEach((x, i) => {
  const g = 'i' + (i + 1),
    s = STUDENTS[x.s];
  GROUPS[g] = { id: g, name: 'Cours individuel', sport: s.sport, type: 'indiv', coach: 'cr', day: x.day, start: x.start, dur: x.dur, court: 'Terrain 3', cap: 1, kids: false, chat: false, indiv: x.s };
  s.groups.push(g);
  s.carnet = { total: 10, used: 0 };
});

/* ---------- séances de la saison ---------- */
const THEMES = {
  Padel: ['Sortie de vitre de fond', 'Bandeja : préparation et placement', 'Volée de revers bloquée', 'Jeu au filet à deux', 'Lob défensif', 'Víbora de placement', 'Retour de service croisé', 'Transitions fond-filet', 'Smash par 3', 'Match à thème : prise de filet', 'Sortie de double vitre', 'Chiquita et jeu bas'],
  Tennis: ['Coup droit lifté', 'Service : lancer de balle', 'Revers à deux mains', 'Volée et montée au filet', 'Jeu de jambes', 'Retour de service', 'Construire le point', 'Smash', 'Matchs à thème']
};
const BILANS = [
  'Bonne séance, gros volume de jeu. On reprend le placement la semaine prochaine.',
  'Le groupe a bien accroché sur le thème. Attention à la préparation, trop tardive.',
  'Séance un peu courte en intensité (chaleur). Points en fin de séance très disputés.',
  'Beaucoup de progrès sur la régularité. Continuer à travailler les appuis.',
  'Travail en ateliers puis jeu dirigé : objectif atteint pour la majorité.',
  'Concentration en baisse en fin de séance : prévoir plus de jeu la prochaine fois.'
];
const PERSO = [
  'Très bonne séance, la préparation est beaucoup plus tôt. Bravo.',
  'Encore trop de fautes en revers : travaille la prise.',
  'Tu as osé monter au filet, continue comme ça.',
  'Pense à t’échauffer les épaules avant la séance.',
  'Belle régularité aujourd’hui, on passe à la suite au prochain cours.',
  'Le placement à deux s’améliore nettement.'
];

const SESSIONS = [];
let sesN = 0;
function addSession(g, date, extra = {}) {
  const G = GROUPS[g];
  const members = Object.values(STUDENTS)
    .filter(s => s.groups.includes(g))
    .map(s => s.id);
  const s = Object.assign({ id: 'se' + ++sesN, g, date, start: G.start, dur: G.dur, coach: G.coach, theme: '', members, att: {}, bilan: '', perso: {}, cancelled: false }, extra);
  SESSIONS.push(s);
  return s;
}
for (let d = SEASON0; d <= SEASON1; d = addDays(d, 1)) {
  const wd = D(d).getDay();
  Object.values(GROUPS).forEach(G => {
    if (G.stage) {
      if (d >= G.stage[0] && d <= G.stage[1]) addSession(G.id, d);
      return;
    }
    if (G.day !== wd || FERIES.includes(d)) return;
    if (G.kids && inVac(d)) return;
    addSession(G.id, d);
  });
}
// déroulé : thèmes, appel, bilans des séances passées ; thèmes déjà prévus pour les deux semaines à venir
SESSIONS.forEach(s => {
  const G = GROUPS[s.g];
  const past = s.date < TODAY || (s.date === TODAY && s.start + s.dur <= NOW_MIN);
  const soon = s.date <= addDays(TODAY, 14);
  if (past || soon) s.theme = G.stage ? ['Bandeja et smash', 'Sortie de vitre', 'Jeu au filet', 'Défense et lob', 'Tournoi de fin de stage'][(D(s.date).getDay() + 6) % 7] : pick(THEMES[G.sport]);
  if (!past) return;
  s.members.forEach(k => {
    const r = rnd();
    s.att[k] = r < 0.86 ? 'p' : r < 0.94 ? 'e' : 'a';
    const st = STUDENTS[k];
    if (st.carnet && s.att[k] !== 'e') st.carnet.used++;
  });
  // les bilans des 10 derniers jours ne sont pas tous écrits
  if (s.date < addDays(TODAY, -10) || rnd() < 0.5) {
    s.bilan = pick(BILANS);
    s.members.forEach(k => {
      if (s.att[k] === 'p' && rnd() < 0.3) s.perso[k] = pick(PERSO);
    });
  }
});
// carnets : le carnet en cours (10 séances), les précédents sont terminés
Object.values(STUDENTS).forEach(s => s.carnet && (s.carnet.used %= s.carnet.total));
// une séance annulée pour la pluie (court extérieur)
const pluie = SESSIONS.find(s => s.g === 'g8' && s.date === '2026-10-08');
if (pluie) Object.assign(pluie, { cancelled: true, att: {}, bilan: '', perso: {}, cancelReason: 'Pluie : court extérieur impraticable' });
// le stage d'aujourd'hui est en cours : l'appel est fait
SESSIONS.filter(s => s.date === TODAY && s.g === 'st1').forEach(s => s.members.forEach(k => (s.att[k] = 'p')));

/* ---------- progression : évaluations techniques et niveaux ---------- */
Object.values(STUDENTS).forEach(s => {
  const coups = TECH[s.sport];
  const base = s.sport === 'Padel' ? (s.level || 3) : s.level || 3;
  coups.forEach((c, i) => {
    const v0 = Math.max(1, Math.min(4, Math.round(base / 2.4 + rnd() * 1.6 - (i > 3 ? 0.8 : 0))));
    const v1 = Math.min(4, v0 + (rnd() < 0.45 ? 1 : 0));
    s.tech[c] = [['2026-09-14', v0]].concat(v1 > v0 ? [['2026-10-12', v1]] : []);
  });
  if (s.level) {
    const up = rnd() < 0.25 && s.level > 1;
    s.levelHist = up ? [['2026-09-07', s.level - 1], ['2026-10-' + (10 + Math.floor(rnd() * 10)), s.level]] : [['2026-09-07', s.level]];
  }
  if (s.sport === 'Padel' && s.level >= 4 && s.born < 2008 && rnd() < 0.5)
    s.ja.push({ date: '2026-10-' + pick(['04', '11', '18']), event: pick(['P25 Open du TPC', 'Americano du jeudi', 'P100 Padel Club Est', 'Montée-descente d’octobre']), res: pick(['Demi-finale', '3ᵉ sur 16', 'Vainqueur', 'Quart de finale', '5ᵉ sur 12']) });
});

/* ---------- vidéos envoyées par les élèves depuis la page École de /RAM Club ---------- */
const VIDEOS = [
  { id: 'v1', s: 's9', date: '2026-10-26', len: '0:24', title: 'Ma bandeja', msg: 'Je finis souvent dans le filet quand je joue la bandeja côté gauche. Tu peux regarder ma préparation ?', reply: '', tint: 210 },
  { id: 'v2', s: 's1', date: '2026-10-25', len: '0:41', title: 'Sortie de vitre en revers', msg: 'Entraînement de samedi avec Marc. J’ai l’impression d’être trop près de la vitre.', reply: '', tint: 95 },
  { id: 'v3', s: 's11', date: '2026-10-19', len: '0:18', title: 'Service', msg: 'Mon service après tes conseils, c’est mieux ?', reply: 'Oui ! Le lancer est beaucoup plus régulier. Garde le bras plus haut à l’impact et on travaille la variation mardi.', replyAt: '2026-10-20', tint: 30 }
];

/* ---------- messages directs (seul le coach les écrit en premier ; l'élève ou le parent répond depuis /RAM Club) ---------- */
const kidOf = g => Object.values(STUDENTS).find(s => s.groups.includes(g) && s.parents.length);
const THREADS = [
  { id: 't1', s: kidOf('g3').id, to: 'parent', msgs: [{ me: true, at: '2026-10-14 18:02', x: 'Bonjour, Lina a très bien travaillé aujourd’hui. Je la vois bien rejoindre le stage de la Toussaint, il reste deux places.' }, { me: false, at: '2026-10-14 20:15', x: 'Merci beaucoup ! On l’inscrit, elle est ravie.' }] },
  { id: 't2', s: 's9', to: 'eleve', msgs: [{ me: true, at: '2026-10-21 21:10', x: 'Super séance ce soir Sarah. Pense à envoyer la vidéo de ta bandeja, on la regarde ensemble.' }] }
];

/* ---------- publications du coach vers l'école (affichées dans /RAM Club) ---------- */
const POSTS = [
  { id: 'p1', g: 'g3', kind: 'annonce', date: '2026-10-16', x: 'Pas de cours pendant les vacances. Reprise le mercredi 4 novembre. Pensez au stage de la Toussaint !' },
  { id: 'p2', g: 'g2', kind: 'contenu', date: '2026-10-08', x: 'Les 3 exercices de bandeja vus mardi, à refaire en échauffement avant vos matchs.', link: 'Fiche « Bandeja en 3 étapes »' },
  { id: 'p3', g: 'g8', kind: 'annule', date: '2026-10-08', x: 'Cours annulé ce soir : court extérieur impraticable (pluie). Séance rattrapée le jeudi 15.' }
];

/* ---------- agendas en ligne connectés (Google Agenda, Calendly, Outlook…) ----------
   Le coach choisit UN agenda dédié à ses rendez-vous professionnels ; ses rendez-vous sont récupérés
   automatiquement et apparaissent dans le planning. Un rendez-vous importé par erreur se retire de /RAM Coach :
   il reste dans l'agenda d'origine, mais ne revient pas à la synchronisation suivante. */
const CAL_SOURCES = {
  google: { name: 'Google Agenda', color: '#4285F4' },
  calendly: { name: 'Calendly', color: '#006BFF' },
  outlook: { name: 'Outlook', color: '#0F6CBD' },
  ical: { name: 'Lien iCal', color: '#8A8A8A' }
};
const CALS = [{ src: 'google', label: 'Cours padel (pro)', account: 'camille.roux.padel@exemple.fr', sync: '2026-10-27 11:05' }];
const EXT = [
  { id: 'x1', src: 'google', date: '2026-10-27', start: 16 * 60, dur: 60, title: 'Cours particulier : Julien Mercier', where: 'Terrain 3' },
  { id: 'x2', src: 'google', date: '2026-10-28', start: 9 * 60, dur: 60, title: 'Coaching duo : Perrin / Lambert', where: 'Terrain 1' },
  { id: 'x3', src: 'google', date: '2026-10-29', start: 12 * 60 + 30, dur: 30, title: 'Dentiste', where: '' },
  { id: 'x4', src: 'google', date: '2026-10-30', start: 17 * 60, dur: 90, title: 'Cours particulier : Inès Faure (rattrapage)', where: 'Terrain 3' },
  { id: 'x5', src: 'calendly', date: '2026-10-31', start: 11 * 60, dur: 60, title: 'Séance découverte : Amandine Roche', where: 'Terrain 2' },
  { id: 'x6', src: 'google', date: '2026-11-03', start: 12 * 60 + 15, dur: 60, title: 'Cours particulier : Julien Mercier', where: 'Terrain 3' }
];
