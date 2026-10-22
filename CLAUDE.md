# Consignes pour Claude Code — /RAM JA et /RAM Club

## Une seule source pour /RAM Club
- Le code de /RAM Club se modifie **uniquement ici, dans `club/`**.
- Le dépôt `baptistebelier/appli-club` est un **miroir** (démo GitHub Pages) recopié
  automatiquement toutes les 3 heures. Ne jamais y faire de modification à la main.

## Avant chaque envoi
- `npm test` doit passer. Render lance ces tests à chaque mise en ligne : si un test
  échoue, la mise en ligne est annulée.
- Si tu touches à l'interface (`public/`, `club/`), lance aussi les tests d'écran :
  `npm run test:ecrans` (installe d'abord Playwright une fois :
  `npm i --no-save playwright && npx playwright install chromium`).
  Ils ouvrent chaque écran dans un vrai navigateur et échouent à la moindre erreur.
- Les tests d'écran vivent dans `ecrans/`, **pas** dans `test/` : `test/` est lancé par Render,
  qui n'a pas de navigateur.

## Règles de l'interface
- Ne jamais bloquer le zoom (`maximum-scale` / `user-scalable=no`) : beaucoup d'adhérents
  ont besoin d'agrandir le texte.
- Toute nouvelle fonction du Club doit rester lisible sur un téléphone de 360 px de large.
- Le serveur n'a aucune dépendance npm : ne pas en ajouter sans raison forte.
- Pas de secret dans le code : tout passe par les variables d'environnement de Render.
