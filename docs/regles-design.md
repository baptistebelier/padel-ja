# Règles de design validées par Baptiste (communes à /Pista, /Buvette, /Dojo)

Ne pas les modifier en appliquant la revue design ni ailleurs, sauf nouvelle demande de Baptiste.
La plupart sont écrites une seule fois dans le moteur commun `club/empilement.js` (chargé par les 3 applis).

## Boîtes et couleurs
- Une seule ombre portée : les boîtes principales posées sur le fond de l'appli, et les boutons. Rien d'autre.
- Sous-boîte (boîte dans une boîte) : pas d'ombre, contour noir, fond d'une autre valeur de la même teinte.
  Mode nuit : `color-mix(in srgb, var(--c-surface) 62%, #000)` — gris foncé, plus foncé que la carte, pas noir.
  Mode jour : fond de carte 84 % + couleur du texte 16 %.
- Jamais le même fond sur le même fond : boutons, étiquettes, champs posés dans une boîte prennent l'autre valeur ;
  l'en-tête collé en haut d'une sous-boîte prend le fond de la sous-boîte.
- Contour noir toujours : boutons, étiquettes, éléments de données (jauges, échelles, grilles, barres).
- Le moteur décide chaque élément une seule fois, avant affichage : jamais de recalcul au défilement (aucun clignotement).

## Navigation
- Navigation active ou survolée (menu, sous-menus, barre du bas, élément choisi dans une liste) : fond coloré seul,
  ni contour ni ombre. Le jour en cours d'un calendrier aussi.
- Intercalaires : l'actif a le fond de la boîte à laquelle il est collé, les inactifs sont un peu plus foncés ; contour
  noir toujours ; liseré citron en haut de l'actif ; pictogramme + titre ; à partir de 4, les inactifs ne montrent que le
  pictogramme ; on peut glisser le doigt de l'un à l'autre. Tout sous-menu horizontal est un intercalaire collé à la carte.
- Listes déroulantes : largeur et style exacts de la boîte d'où elles partent.

## Planning (/Dojo)
- Évènements et réservations sans ombre, contour noir, petites marges internes.
- Plages réservables discrètes : sans contour, valeur légèrement différente.
- Jour en cours : sans contour, teinte citron qui ressort ; ligne de l'heure et son rond en rouge.

## Revue design (en cours, voir `docs/etat.md`)
- Un bandeau d'en-tête uniforme sur chaque page, avec un fond, sur toute la largeur disponible.
- Un seul bouton plein par zone ; l'accent pour l'action, la sélection, l'actif et le direct ; état vide standard
  (`.etat-vide` : pictogramme, titre, une phrase, un bouton) ; petits textes 13 px minimum, contraste 4,5:1.

## Toujours
- Français ; pictogrammes SVG, jamais d'emojis ; ne jamais bloquer le zoom ; lisible à 360 px de large.
