/* /RAM Club — ui/12-aide.js : page « Aide », le guide complet de l'appli.
   Rubriques dépliables, recherche dans tout le guide, et « Pour toi » : les rubriques du rôle
   de la personne (bureau, enseignant, capitaine, parent) remontent en premier.
   Les fichiers ui/*.js se chargent dans l'ordre de leur numéro (voir index.html). */
const AIDE = [
  {
    id: 'debut',
    t: 'Premiers pas',
    i: 'home',
    q: [
      [
        'Rejoindre mon club',
        "Crée ton compte /RAM (le même que pour /RAM JA), puis entre le <b>code du club</b> donné par le bureau (par exemple TPC-4821). Ta demande part au bureau : dès qu'il valide ton adhésion pour la saison, tout le club s'ouvre."
      ],
      [
        "Installer l'appli sur mon téléphone",
        "<b>iPhone</b> : ouvre l'appli dans Safari, touche Partager puis « Sur l'écran d'accueil ». <b>Android</b> : dans Chrome, touche « Installer l'application ». L'appli s'ouvre alors en plein écran, comme une appli classique, et peut t'envoyer des notifications."
      ],
      [
        'Se déplacer dans l’appli',
        'La barre du bas mène aux six espaces : Accueil (le mur), Groupes (les discussions), Agenda, École, Club et Profil. Le bouton <b>+</b> sert à publier. Sur un écran ouvert, la flèche en haut à gauche ramène en arrière.'
      ],
      [
        'Jour, nuit et style',
        'La lune (ou le soleil) en haut passe en mode nuit ou jour. Dans Profil, choisis Jour, Nuit ou Système, le style de l’interface (Épuré, Street dosé, Full street) et le motif du fond. Les couleurs sont celles du club.'
      ]
    ]
  },
  {
    id: 'mur',
    t: 'Le mur du club',
    i: 'news',
    q: [
      [
        'Réagir à une publication',
        'Touche le cœur pour aimer, la bulle pour commenter. Dans les commentaires, reste appuyé sur un message pour réagir, répondre ou le signaler.'
      ],
      [
        'M’inscrire à un événement',
        "« Je m'inscris » ou « Peut-être » sous l'événement. Tu peux aussi te proposer comme <b>bénévole</b> et l'<b>ajouter à l'agenda</b> de ton téléphone. Toucher à nouveau le bouton annule."
      ],
      [
        'Les étiquettes Tennis et Padel',
        'Le coin en haut de chaque publication indique le sport. Les publications des deux sports portent les deux étiquettes.'
      ],
      [
        'Signaler un contenu',
        "Les trois points d'une publication, puis « Signaler ». Le bureau décide de le supprimer ou de l'ignorer. Tu peux aussi bloquer un adhérent : tu ne vois plus ce qu'il publie."
      ]
    ]
  },
  {
    id: 'jeu',
    t: 'Jouer : parties, résultats, palmarès',
    i: 'ball',
    q: [
      [
        'Chercher des partenaires',
        '<b>+</b> puis « Chercher une partie » : sport, date, heure, niveau. Les adhérents la rejoignent ; quand elle est complète, les suivants passent en liste d’attente. Tu es prévenu à chaque arrivée ou désistement.'
      ],
      [
        'Parties dirigées et séances à thème',
        "Proposées par les enseignants, par fourchettes de niveau. Inscris-toi dans ta fourchette : la première fourchette complète est validée, les autres passent en liste d'attente. Tu es prévenu dès que ta date est confirmée. Le prix est indiqué sur la publication."
      ],
      [
        'Ajouter un résultat',
        '<b>+</b> puis « Ajouter un résultat », ou depuis ton profil. Il entre dans ton palmarès de la saison, et tes abonnés en sont prévenus.'
      ],
      [
        'Mon palmarès',
        'Dans Profil : tes résultats de la saison (tennis et padel), et les tournois et animations /RAM JA que tu as joués, avec ta place.'
      ]
    ]
  },
  {
    id: 'agenda',
    t: 'Agenda',
    i: 'cal',
    q: [
      [
        'Mon agenda et l’Agenda du club',
        "<b>Mon agenda</b> réunit tout ce où tu es inscrit : cours, parties, séances, événements, tournois (avec l'heure de ton match), rencontres d'équipe, repas réservés au bar. L'<b>Agenda du club</b> montre tout ce qui se passe au club."
      ],
      [
        'Changer de vue et filtrer',
        'À venir, Semaine ou Jour ; dans la semaine, touche un bloc pour l’ouvrir et glisse pour changer de semaine. Les pastilles filtrent par type (Cours, Parties, Événements, Tournois, Équipes, Repas) et par sport.'
      ]
    ]
  },
  {
    id: 'ecole',
    t: 'École de tennis et de padel',
    i: 'school',
    q: [
      [
        'Annoncer ma présence à un cours',
        "Dans École, Mes cours : « Je serai présent » ou « Absent » pour chaque séance des trois prochaines semaines. L'enseignant prépare la séance en conséquence, et tu es prévenu si le lieu change (salle ou extérieur) ou si le cours est annulé."
      ],
      ['Les stages', 'Dans École, Stages : les stages du club, avec inscription en un geste.']
    ]
  },
  {
    id: 'equipes',
    t: 'Équipes et rencontres',
    i: 'users',
    q: [
      [
        'Répondre à une convocation',
        'Quand le capitaine te convoque (titulaire ou remplaçant), tu reçois une notification : réponds « Je suis dispo » ou « Pas dispo ». Ta réponse apparaît tout de suite chez le capitaine.'
      ],
      [
        'Suivre une rencontre en direct',
        "Pendant la rencontre, les scores s'affichent point par point, et une discussion « Le direct » est ouverte le temps du match pour encourager l'équipe. Elle s'efface au dernier point."
      ],
      [
        'Saisir les scores',
        "Les joueurs de l'équipe et le capitaine touchent « Saisir les scores » depuis le bord du court. Tout le club voit le score changer en direct."
      ],
      [
        'Championnats',
        'Dans Club, Équipes : le fil des rencontres, les championnats, les classements et les résultats de chaque équipe.'
      ]
    ]
  },
  {
    id: 'groupes',
    t: 'Groupes de discussion',
    i: 'chat',
    q: [
      [
        'Qui voit quoi',
        "Les groupes Club sont ouverts à tous les adhérents. Chaque groupe d'entraînement et chaque équipe a son groupe, réservé à ses membres, à l'enseignant et au capitaine."
      ],
      [
        'Réagir, répondre, envoyer une photo',
        'Reste appuyé sur un message pour réagir avec un emoji, y répondre ou le signaler. Le bouton image à gauche de la zone de saisie joint une photo.'
      ],
      [
        'Couper les notifications d’un groupe',
        'Le haut-parleur en haut du groupe le met en sourdine : il reste lisible, mais ne te prévient plus.'
      ]
    ]
  },
  {
    id: 'tournois',
    t: 'Tournois et animations /RAM JA',
    i: 'trophy',
    q: [
      [
        "M'inscrire à un tournoi du club",
        "Sur la publication du tournoi : « Inscrire ma paire », puis choisis ton partenaire parmi les adhérents, ou indique un partenaire extérieur. Ta paire arrive dans la liste du juge-arbitre. Désinscription possible jusqu'au tirage. Certains tournois s'inscrivent ailleurs (Ten'Up…) : le lien est indiqué."
      ],
      [
        'Inscrire mon enfant',
        "Sur la même publication, un bouton « Inscrire » apparaît pour chacun de tes enfants. Son partenaire peut être un autre enfant du club. C'est toi qui reçois ses horaires et ses résultats."
      ],
      [
        'Le jour du tournoi',
        "La publication affiche l'heure et la piste de ton prochain match (tu es prévenu s'il bouge de plus d'un quart d'heure), puis « Suivre le direct » : matchs en cours avec le score, matchs à venir, derniers résultats, et le grand écran du tournoi."
      ],
      [
        'Animations (americano, mexicano, montée-descente…)',
        "Inscription individuelle. Sur place, scanne le <b>QR code</b> affiché par l'organisateur pour saisir le score de ton terrain depuis ton téléphone. À la fin, ta place entre dans ton palmarès."
      ],
      [
        'La ligue des animations',
        "Dans Club, Le club : chaque animation de la saison rapporte des points (10, 8, 6, 5, 4, 3, 2, 1 du 1er au 8e, plus 1 point de participation). Le vainqueur d'une montée-descente gagne le trophée rare « Roi du terrain »."
      ]
    ]
  },
  {
    id: 'bar',
    t: 'Bar et club-house',
    i: 'cup',
    q: [
      [
        'Réserver un repas ou une boisson',
        "Dans Club, Bar : choisis le jour et le moment (midi, soir), puis « Réserver ». Les réservations ferment la veille à l'heure choisie par le club. Tu peux annuler la tienne avant."
      ],
      [
        'Les points bar',
        "Chaque commande réservée dans l'appli et servie au bar rapporte des points (le nombre de points par euro est choisi par le club). Échange-les contre un article avec « Prendre avec … pts », puis montre ton bon au bar. Selon le club, les points repartent de zéro chaque saison."
      ]
    ]
  },
  {
    id: 'profil',
    t: 'Profil, trophées et classements',
    i: 'user',
    q: [
      [
        'Le score d’investissement',
        'Chaque action dans la vie du club (like, message, inscription, cours suivi, rencontre jouée…) rapporte des points. Les paliers débloquent des <b>trophées</b> (bronze, argent, or, platine) et des <b>cadres</b> autour de ton avatar. Le calcul est fait par le serveur : tout le monde voit les mêmes points.'
      ],
      [
        'Ce que les autres voient de moi',
        'Dans Profil, « Mes informations visibles » : ton téléphone, ton e-mail et ton Instagram sont masqués par défaut. Active seulement ce que tu acceptes de partager. Ta date de naissance reste visible par toi seul.'
      ],
      [
        'Le classement des clubs',
        'Dans Club, Le club : les clubs les plus actifs (points moyens par adhérent) et les résultats en tournoi de leurs joueurs, saison par saison.'
      ],
      ['Suivre un adhérent', 'Sur son profil, « Suivre » : tu es prévenu de ses résultats et de ses publications.']
    ]
  },
  {
    id: 'notifs',
    t: 'Notifications',
    i: 'bell',
    q: [
      [
        'Recevoir les notifications sur mon téléphone',
        "Dans Profil, « Mes notifications », puis « Activer » sous « Notifications sur ce téléphone ». Tu es prévenu même appli fermée. Sur iPhone, installe d'abord l'appli sur l'écran d'accueil (iOS 16.4 ou plus récent)."
      ],
      [
        'Choisir ce que je reçois',
        'Dans Profil, « Mes notifications » : le club, les adhérents suivis, les groupes, mon équipe, les parties, mes publications. Chaque groupe peut aussi être mis en sourdine.'
      ],
      [
        'Sons et vibrations',
        'Dans Profil : les sons de l’appli et une légère vibration sur un like, une inscription ou un interrupteur.'
      ]
    ]
  },
  {
    id: 'clubs',
    t: 'Plusieurs clubs',
    i: 'club',
    q: [
      [
        'Être adhérent de deux clubs',
        "Dans Profil, « Mes clubs » : entre le code d'un autre club pour le rejoindre (un club de tennis et un club de padel, par exemple). Passe d'un club à l'autre avec « Ouvrir »."
      ],
      [
        'Le club principal',
        "C'est le club de ta licence : il apparaît sur ta fiche joueur /RAM JA. Choisis-le avec « Principal » dans « Mes clubs »."
      ],
      [
        'Les nouveautés des autres clubs',
        "L'accueil affiche « Du nouveau dans tes autres clubs », avec le nombre de nouveautés depuis ta dernière visite."
      ]
    ]
  },
  {
    id: 'famille',
    t: 'Famille et enfants',
    i: 'heart',
    r: 'parent',
    q: [
      [
        'Ajouter mon enfant',
        'Dans Profil, ajoute ton enfant : il a son profil dans le club, sans compte ni e-mail. Tu gères ses présences aux cours, ses inscriptions aux tournois et tu reçois ses notifications.'
      ],
      [
        'Ce que voit un jeune',
        "Un compte jeune ne voit ni l'annuaire des adhérents ni les groupes réservés aux adultes. Les parents lisent les groupes de leur enfant."
      ]
    ]
  },
  {
    id: 'bureau',
    t: 'Pour le bureau',
    i: 'gear',
    r: 'admin',
    q: [
      [
        'Valider les adhérents',
        "Roue dentée en haut, « Faire entrer les adhérents » : le code du club, l'invitation à copier et les demandes à valider. Valider ouvre le club à l'adhérent pour la saison."
      ],
      [
        'Publier au nom du club',
        "<b>+</b> : annonce, événement (avec inscriptions dans l'appli ou sur Ten'Up), tournoi, sondage, publication avec lien, actu, mise en avant des partenaires."
      ],
      [
        'Organiser un tournoi avec /RAM JA',
        "<b>+</b>, « Tournoi » : le tournoi est créé dans /RAM JA sur ton compte, puis publié sur le mur avec les inscriptions dans l'appli. Le juge-arbitre gère ensuite le tirage, la programmation et les scores. Si ton accès /RAM JA ne permet plus de créer de tournoi, l'appli t'explique quoi faire."
      ],
      [
        'Championnats, équipes et groupes',
        "Roue dentée : crée les championnats, leurs équipes, leurs capitaines et leur calendrier ; les groupes d'entraînement (jour, heure, enseignant, élèves) ; les groupes de discussion."
      ],
      [
        'Infos du club et bar',
        "Roue dentée, « Infos du club » : courts, horaires, adresse, tarifs, liens (réservation, cotisation, boutique), modules affichés. Pour le bar : l'heure de fin des réservations, les points par euro et la remise à zéro des points à chaque saison."
      ],
      [
        'Identité du club',
        "Roue dentée, « Apparence » : nom, sigle, logo (PNG transparent conseillé) et couleur du club. Toute l'appli prend ces couleurs."
      ],
      ['Modération', '« Signalements » : chaque contenu signalé par un adhérent, à supprimer ou ignorer.'],
      [
        'Changer de saison',
        'Roue dentée, « Saison » : clôture la saison en cours (les trophées sont figés, les palmarès archivés) et lance la suivante. Les adhésions sont à valider à nouveau.'
      ]
    ]
  },
  {
    id: 'enseignant',
    t: 'Pour les enseignants',
    i: 'school',
    r: 'coach',
    q: [
      [
        'Mes groupes',
        "Roue dentée, « Mes groupes » : pour chaque groupe, le prochain cours, les présences annoncées et l'<b>appel</b>. Tu peux passer un cours en salle ou en extérieur, ou l'annuler : élèves et parents sont prévenus."
      ],
      [
        'Proposer des parties dirigées et des séances',
        '<b>+</b>, « Partie dirigée » ou « Séance collective à thème » : dates, fourchettes de niveau, nombre de places, prix. Tu vois arriver les inscriptions ; la première fourchette complète est validée automatiquement.'
      ],
      ['Stages', '<b>+</b>, « Stage » : un stage avec inscription, visible dans École, Stages.']
    ]
  },
  {
    id: 'capitaine',
    t: 'Pour les capitaines',
    i: 'flag',
    r: 'cap',
    q: [
      [
        'Composer l’équipe et convoquer',
        'Sur la rencontre : choisis les titulaires et les remplaçants. Chacun est convoqué par notification et répond « dispo » ou « pas dispo ».'
      ],
      [
        'Le jour de la rencontre',
        'Lance le direct, fais saisir les scores depuis le bord du court, puis publie le résultat : il apparaît sur le mur et dans le fil des rencontres.'
      ],
      [
        'Clôturer le championnat',
        'À la fin, la clôture donne le trophée Champion aux joueurs qui ont joué au moins un match.'
      ]
    ]
  },
  {
    id: 'vie-privee',
    t: 'Confidentialité et sécurité',
    i: 'shield',
    q: [
      [
        'Mes données',
        'Seuls les adhérents validés du club voient le contenu du club. Tes coordonnées restent masquées tant que tu ne choisis pas de les partager. Les réservations au bar ne sont visibles que par toi et le bureau.'
      ],
      [
        'Supprimer mon compte',
        'Dans Profil, en bas : « Supprimer mon compte ». Tes données sont effacées sous 30 jours.'
      ]
    ]
  }
];
/* rôle de la personne → rubriques à mettre en premier */
function aideFor() {
  const r = [];
  if (isAdmin() && S.role !== 'coach') r.push('bureau');
  if (S.role === 'coach') r.push('enseignant');
  if (S.role === 'cap' || GROUPS.some(g => g.cap === ME())) r.push('capitaine');
  if (M[ME()] && (M[ME()].kids || []).length) r.push('famille');
  return r;
}
const aideNorm = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, '')
    .toLowerCase();
function aideBody(q) {
  const n = aideNorm(q).trim(),
    mine = aideFor(),
    secs = [...AIDE.filter(s => mine.includes(s.id)), ...AIDE.filter(s => !mine.includes(s.id))];
  const out = secs
    .map(s => {
      const qs = n ? s.q.filter(([a, b]) => aideNorm(a + ' ' + b + ' ' + s.t).includes(n)) : s.q;
      if (!qs.length) return '';
      return `<details class="more aide"${n ? ' open' : ''}><summary>${ic(s.i)}${s.t}${mine.includes(s.id) ? ' <span class="tag lime">Pour toi</span>' : ''}</summary><div class="in">${qs
        .map(([a, b]) => `<div class="aq"><b>${a}</b><p>${b}</p></div>`)
        .join('')}</div></details>`;
    })
    .join('');
  return out || empty('search', 'Rien trouvé', 'Essaie un autre mot : cours, tournoi, bar, notification…');
}
V.aide = () =>
  `<div class="pad"><p class="muted">Tout ce que fait l’appli, et comment faire. Touche une rubrique pour l’ouvrir, ou cherche un mot.</p><div class="fld"><label for="aide-q">Rechercher dans l’aide</label><input id="aide-q" type="search" placeholder="Ex. : inscrire mon enfant, points bar…" autocomplete="off"></div><div id="aide-res">${aideBody('')}</div><div class="note">Une question sans réponse ? Écris au bureau de ton club dans le groupe Général, ou à l’éditeur de l’appli : contact@riseandmove.fr</div></div>`;
// recherche dans l'aide : le résultat se met à jour à chaque lettre, sans quitter le champ
document.addEventListener('input', e => {
  if (e.target.id === 'aide-q' && $('aide-res')) $('aide-res').innerHTML = aideBody(e.target.value);
});
