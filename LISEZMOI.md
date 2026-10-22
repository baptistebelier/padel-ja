# /RAM JA

Logiciel du juge-arbitre de padel : inscriptions, modèles de tournoi, tirage au sort réel par cartes, poules, qualifications, tableaux, programmation, repos des paires, écran TV, overlay de stream, impressions et PDF.

## Lancer
1. **Node.js** doit être installé (https://nodejs.org, version LTS).
2. Double-cliquer sur **`Lancer Padel JA.bat`** : l'éditeur s'ouvre dans une fenêtre d'application.
3. Laisser la fenêtre noire (le serveur) ouverte pendant le tournoi. Tout est sauvegardé automatiquement dans `data/tournoi.json`, et tes modèles dans `data/modeles.json`.

Pour essayer sans rien saisir, clique sur le bouton **Démo** en bas à gauche.

## Les écrans
| Écran | Adresse | Utilisation |
|---|---|---|
| Éditeur | http://localhost:3737/ | Le poste du JA |
| Écran TV | http://localhost:3737/tv | À glisser sur la télé, puis **F11** ou double-clic. Le pointeur n'apparaît que pendant le tirage. |
| Overlay | http://localhost:3737/overlay | Fond vert (`?bg=transparent` pour OBS, `?court=ID` pour suivre un terrain) |
| Télécommande | http://IP-DU-PC:3737/remote | Sur un téléphone connecté au même Wi-Fi, avec le code PIN de l'onglet 7 |
| Impression | bouton **Imprimer / PDF** | Tableau, poules, qualifs, programmation, résultats, classement, inscrits, fiche |

## Déroulé type
1. **Tournoi** : choisir un **modèle** (ou enregistrer le tien), puis ajuster catégorie, formule (tableau direct, qualifications + TF, poules + TF, poules seules), formats par phase et terrains.
2. **Inscriptions** : saisie au clavier avec date d'inscription. La liste d'attente se calcule toute seule : par date en P25–P250, au poids en P500 et plus.
3. **Tirage au sort** : avec la méthode « cartes numérotées », chaque chapeau affiche des cartes face cachée. Tu tires un numéro dans la vraie vie, puis tu cliques sur la carte ou tu tapes son numéro au pavé numérique : la paire prend la place suivante du chapeau. La programmation se fait automatiquement à la fin du tirage.
4. **Tableaux** : classement des poules (2 pts par victoire, 1 par défaite, -2 en cas de WO ; départage aux sets, aux jeux, puis à la confrontation directe), qualifications, tableau final et matchs de classement (TMC).
5. **Programmation** : glisser-déposer. Chaque paire a un badge de repos : rose pendant le repos obligatoire, citron quand elle peut rejouer, avec le temps d'attente.
6. **Direct & repos** : score point par point, chronos de repos, contrôle du nombre de matchs par jour et alerte pour toute rencontre avant 7h ou après minuit.
7. **Écran TV & stream** : vues Tableau, Poules, Programmation, Direct, Classement, Fiche et Tirage, rotation automatique, overlay.

Tous les raccourcis sont listés derrière le bouton **?** de l'éditeur.
