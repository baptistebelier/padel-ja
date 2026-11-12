/* Catalogue des composants /RAM (ds.css) : chaque composant, dans toutes ses variantes, en jour et en nuit.
   Sert de référence au contrôle contre Figma, et de cible au test d'écran du design system. */
(function () {
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    users:
      '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3.5-5 7-5s7 1.5 7 5M16 4.5a3.5 3.5 0 010 7M22 20c0-2.5-1.5-4-4-4.6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    star: '<path d="M12 3l2.8 5.9 6.2.8-4.5 4.3 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.7l6.2-.8z"/>',
    home: '<path d="M3 11l9-7 9 7v9H3z"/>',
    school: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    warn: '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>',
    euro: '<path d="M18 6a7 7 0 100 12M4 10h10M4 14h10"/>'
  };
  const ic = n =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
  const sec = (t, body) => `<section class="cat-sec" data-cat="${t}"><h2>${t}</h2>${body}</section>`;
  const demo = items =>
    `<div class="cat-demo">${items.map(([l, h]) => `<div><span class="cat-lab">${l}</span>${h}</div>`).join('')}</div>`;

  const html = [
    sec(
      'Boutons',
      demo([
        ['Principal', `<button class="r-btn">${ic('plus')}Nouveau tournoi</button>`],
        ['Secondaire', `<button class="r-btn r-btn--sec">Voir l’agenda</button>`],
        ['Danger', `<button class="r-btn r-btn--danger">Supprimer</button>`],
        ['Désactivé', `<button class="r-btn" disabled>Indisponible</button>`],
        ['Petit', `<button class="r-btn r-btn--sm">Réserver</button>`],
        [
          'Icône',
          `<button class="r-ib" aria-label="Plus">${ic('more')}</button> <button class="r-ib r-ib--accent" aria-label="Ajouter">${ic('plus')}</button>`
        ],
        ['Secondaire dans une carte', `<div class="r-card"><button class="r-btn r-btn--sec">Peut-être</button></div>`]
      ])
    ),
    sec(
      'Champs',
      demo([
        [
          'Repos',
          `<div class="r-field cat-col"><label for="c1">Nom du tournoi</label><input class="r-input" id="c1" value="Open de printemps"><span class="r-field__aide">Visible par les joueurs</span></div>`
        ],
        [
          'Liste de choix',
          `<div class="r-field cat-col"><label for="c2">Catégorie</label><span class="r-selectw"><select class="r-select" id="c2"><option>P250</option><option>P500</option></select></span></div>`
        ],
        [
          'Erreur',
          `<div class="r-field r-field--err cat-col"><label for="c3">Nom du tournoi</label><input class="r-input" id="c3" value="Open de printemps 2027"><span class="r-field__err">Ce nom existe déjà</span></div>`
        ],
        [
          'Texte long',
          `<div class="r-field cat-col"><label for="c4">Message</label><textarea class="r-textarea" id="c4" placeholder="Écris ton message"></textarea></div>`
        ]
      ])
    ),
    sec(
      'Petits contrôles',
      demo([
        [
          'Interrupteur',
          `<button class="r-switch" role="switch" aria-checked="true" aria-label="Actif"></button> <button class="r-switch" role="switch" aria-checked="false" aria-label="Inactif"></button>`
        ],
        [
          'Case à cocher',
          `<input type="checkbox" class="r-check" checked aria-label="Cochée"> <input type="checkbox" class="r-check" aria-label="Non cochée">`
        ],
        [
          'Pastilles d’état',
          `<div class="r-row-wrap"><span class="r-tag r-tag--live">En direct</span><span class="r-tag r-tag--ok">Terminé</span><span class="r-tag r-tag--accent">Inscriptions</span><span class="r-tag">Rencontre</span></div>`
        ],
        [
          'Sport',
          `<div class="r-row-wrap"><span class="r-tag r-tag--tennis">Tennis</span><span class="r-tag r-tag--padel">Padel</span></div>`
        ],
        [
          'Nombre et point',
          `<div class="r-row-wrap"><span class="r-count">4</span><span class="r-count">99+</span><span class="r-dot"></span></div>`
        ],
        [
          'Avatars',
          `<div class="r-row-wrap"><span class="r-av">BB</span><span class="r-av r-av--pink">IF</span><span class="r-av r-av--green r-av--sm">TL</span><span class="r-av r-av--n-bronze">CR</span><span class="r-av r-av--n-argent">EG</span><span class="r-av r-av--n-or">IF</span><span class="r-av r-av--lg r-av--n-platine">SB</span><span class="r-av r-av--n-legende">HM</span></div>`
        ],
        [
          'Jauge',
          `<div class="cat-col"><span class="r-gauge"><i style="width:58%"></i></span><br><span class="r-gauge r-gauge--green"><i style="width:30%"></i></span></div>`
        ]
      ])
    ),
    sec(
      'Onglets',
      demo([
        [
          'Segments',
          `<div class="r-tabs" role="tablist"><button role="tab" aria-selected="true">Poules</button><button role="tab" aria-selected="false">Tableau</button><button role="tab" aria-selected="false">Classement</button></div>`
        ],
        [
          'Pleine largeur',
          `<div class="cat-col"><div class="r-tabs r-tabs--full" role="tablist"><button role="tab" aria-selected="true">Midi</button><button role="tab" aria-selected="false">Soir</button></div></div>`
        ]
      ])
    ),
    sec(
      'Cartes',
      demo([
        [
          'Carte',
          `<div class="r-card cat-col"><span class="r-surtitre">Agenda</span><h3 class="r-sous-titre">Prochains tournois</h3><p class="r-petit">Trois tournois ouverts aux inscriptions ce mois-ci. Le prochain commence samedi à 9 h.</p><button class="r-btn">Voir l’agenda</button></div>`
        ],
        [
          'Carte avec titre et liste',
          `<div class="r-card cat-col"><div class="r-card__head">${ic('check')}<b>À traiter</b><button class="r-btn r-btn--sec r-btn--sm">Sélectionner</button></div><div class="r-list"><button class="r-row"><span class="r-row__ic">${ic('cal')}</span><span class="r-row__txt"><b>Bilan à écrire</b><small>Galaxie U12 · mer. 4 nov</small></span></button><button class="r-row"><span class="r-row__ic">${ic('chat')}</span><span class="r-row__txt"><b>4 messages non lus</b><small>Réponses de tes élèves</small></span><span class="r-count">4</span></button></div></div>`
        ],
        [
          'Boîte intérieure',
          `<div class="r-card cat-col"><div class="r-card__head">${ic('users')}<b>Fourchettes de niveau</b></div><div class="r-stack"><div class="r-box"><b>Niveau 3 à 4</b><br><span class="r-petit">2 places sur 4</span></div><div class="r-box"><b>Niveau 5 à 6</b><br><span class="r-petit">Complet</span></div></div></div>`
        ],
        [
          'Carte héros',
          `<div class="r-hero cat-col"><div class="r-row-wrap"><span class="r-surtitre">Tournoi en cours</span><span class="r-tag r-tag--live">En direct</span></div><h3 class="r-titre">Open de printemps</h3><span class="r-gauge"><i style="width:58%"></i></span></div>`
        ],
        [
          'Compteur',
          `<div class="r-stat cat-col"><div><span class="r-stat__lab">Paires inscrites</span><span class="r-stat__num">24</span><span class="r-stat__det">sur 32 places</span></div><span class="r-stat__ic">${ic('users')}</span></div>`
        ],
        [
          'État vide',
          `<div class="r-card cat-col"><div class="r-empty">${ic('check')}<b>Tout est réglé</b><span>Aucun paiement en attente.</span></div></div>`
        ]
      ])
    ),
    sec(
      'Alertes et titres',
      demo([
        [
          'Succès',
          `<div class="r-alert cat-col">${ic('check')}<div><b>Score enregistré</b><br><span>Le tableau est à jour.</span></div></div>`
        ],
        [
          'Attention',
          `<div class="r-alert r-alert--warn cat-col">${ic('warn')}<div><b>Terrain 3 en retard</b></div></div>`
        ],
        ['Erreur', `<div class="r-alert r-alert--err cat-col">${ic('info')}<div><b>Connexion perdue</b></div></div>`],
        [
          'Titre de section',
          `<div class="r-section cat-col"><span>Séances de la semaine</span><button class="r-ib r-ib--accent" aria-label="Ajouter">${ic('plus')}</button></div>`
        ]
      ])
    ),
    sec('États et listes', demo([
      ['Bouton appuyé', `<button class="r-btn is-pressed">Nouveau tournoi</button>`],
      ['Bouton au clavier (focus)', `<button class="r-btn r-btn--sec is-focus">Voir l’agenda</button>`],
      ['Champ en saisie (focus)', `<div class="r-field cat-col"><label for="c5">Nom du tournoi</label><input class="r-input is-focus" id="c5" value="Open de printemps 2027"></div>`],
      ['Liste ouverte', `<div class="r-field cat-col"><label>Catégorie</label><span class="r-selectw"><button class="r-select" style="text-align:left">P500</button></span><div class="r-menu" role="listbox"><button role="option" aria-selected="false">P250</button><button role="option" aria-selected="true">P500</button><button role="option" aria-selected="false">P1000</button></div></div>`],
      ['Ligne choisie', `<div class="r-card r-card--flush cat-col" style="padding:0 14px"><div class="r-list"><button class="r-row"><span class="r-av r-av--sm">IF</span><span class="r-row__txt"><b>Inès Faure</b><small>Padel loisirs · 12 séances</small></span></button><button class="r-row" aria-current="true"><span class="r-av r-av--sm r-av--pink">TL</span><span class="r-row__txt"><b>Thomas Leroy</b><small>Padel compétition · 20 séances</small></span></button></div></div>`],
      ['Fenêtre du bas', `<div class="r-sheet cat-col"><div class="r-card__head"><b>Appel</b><button class="r-ib" aria-label="Fermer">${ic('more')}</button></div><div class="r-stack"><button class="r-btn r-btn--full">${ic('check')}Valider l’appel</button></div></div>`]
    ])),
    sec('Carte héros et publication', demo([
      ['Héros avec chiffres', `<div class="r-hero cat-col"><div class="r-row-wrap"><span class="r-surtitre">Tournoi en cours</span><span class="r-tag r-tag--live">En direct</span></div><h3 class="r-titre">Open de printemps</h3><div class="r-hero__stats"><div><b>24</b><span>paires</span></div><div><b>18/31</b><span>matchs joués</span></div><div><b>58 %</b><span>avancement</span></div></div><span class="r-gauge"><i style="width:58%"></i></span></div>`],
      ['Publication', `<article class="r-post cat-col"><div class="r-post__who"><span class="r-av">TPC</span><span><b>Bureau du club</b><small>il y a 2 h</small></span><span class="r-tag r-tag--tennis">Tennis</span></div><div class="r-poster"><span class="r-etiquette">Événement</span><h3>Soirée padel vendredi</h3></div><p style="margin:0">Matchs à la mêlée de 19 h à 22 h, puis apéro à la buvette.</p><div class="r-post__acts"><button class="r-btn">Je m’inscris</button><button class="r-btn r-btn--sec">Peut-être</button></div></article>`]
    ])),
    sec(
      'Navigation',
      demo([
        [
          'Grand écran : menu, sous-menu, en-tête',
          `<div class="cat-nav"><nav class="r-rail"><button class="r-rail__it" aria-current="page">${ic('home')}Accueil</button><button class="r-rail__it">${ic('chat')}Groupes<span class="r-count">7</span></button><button class="r-rail__it">${ic('cal')}Agenda</button><button class="r-rail__it">${ic('school')}École</button><button class="r-rail__it">${ic('flag')}Club</button><button class="r-rail__it">${ic('user')}Profil</button></nav><nav class="r-sub"><div class="r-sub__head"><span class="r-surtitre">TPC</span><b>École</b></div><button class="r-sub__it" aria-selected="true">${ic('cal')}Mes cours</button><button class="r-sub__it" aria-selected="false">${ic('user')}Mon espace</button><button class="r-sub__it" aria-selected="false">${ic('users')}Enseignants<span class="r-count">2</span></button></nav><div><header class="r-head"><div class="r-head__t"><span class="r-surtitre">Cours et stages</span><h1>Mes cours</h1></div><div class="r-head__act"><button class="r-btn">${ic('plus')}Réserver un cours</button><button class="r-ib" aria-label="Notifications">${ic('star')}</button></div></header></div></div>`
        ],
        [
          'Téléphone : bande de sous-menu et barre du bas',
          `<div class="cat-phone"><div class="r-strip"><button class="r-sub__it" aria-selected="true">${ic('cal')}Mes cours</button><button class="r-sub__it" aria-selected="false">${ic('user')}Mon espace</button><button class="r-sub__it" aria-selected="false">${ic('users')}Enseignants</button></div><div style="flex:1;min-height:120px"></div><nav class="r-bottom"><button class="r-rail__it" aria-current="page">${ic('home')}Accueil</button><button class="r-rail__it">${ic('chat')}Groupes</button><button class="r-rail__it">${ic('cal')}Agenda</button><button class="r-rail__it">${ic('school')}École</button><button class="r-rail__it">${ic('flag')}Club</button></nav></div>`
        ]
      ])
    )
  ].join('');
  document.getElementById('cat').innerHTML = html;

  // jour / nuit et forme des coins
  const root = document.documentElement;
  document.querySelectorAll('[data-mode]').forEach(b =>
    b.addEventListener('click', () => {
      root.dataset.mode = b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    })
  );
  document.querySelectorAll('[data-coins]').forEach(b =>
    b.addEventListener('click', () => {
      if (b.dataset.coins) root.dataset.coins = b.dataset.coins;
      else delete root.dataset.coins;
      document.querySelectorAll('[data-coins]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    })
  );
  const q = new URLSearchParams(location.search);
  if (q.get('mode') === 'nuit') document.querySelector('[data-mode="nuit"]').click();
  if (q.get('coins') === 'arrondis') document.querySelector('[data-coins="arrondis"]').click();
})();
