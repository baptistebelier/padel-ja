# Consignes pour Codex — applis /RAM (/Pista, /Buvette, /Dojo)

Codex travaille ici comme exécutant : Claude (Claude Code) pilote le projet, écrit les consignes, relit et met en ligne.

## Au début de chaque tâche
- Lire `docs/etat.md` (chantiers en cours, façon de travailler) et `docs/regles-design.md` (règles de design validées,
  à ne jamais modifier sans demande explicite).
- Lire aussi `CLAUDE.md` : organisation du code de `club/`, tests, règles de l'interface.

## Règles
- Répondre et commenter le code en français. Pictogrammes SVG, jamais d'emojis.
- Faire exactement ce que dit la consigne, dans les fichiers indiqués ; ne pas reformater ni « améliorer » le reste.
- Ne pas pousser sur git et ne pas mettre en ligne : Claude relit puis envoie. Ne rien committer sauf demande.
- Après une modification de `club/` : changer `VERSION` dans `club/sw.js` et lancer `npx prettier --write` sur les seuls
  fichiers JS de `club/` modifiés.
- Tests à lancer avant de rendre la main : `npm test` ; si le fonctionnement change, aussi
  `SUPABASE_URL=https://exemple.invalid SUPABASE_SERVICE_KEY=sb_secret_essai npm test` et `npm run test:ecrans`.
- Le serveur n'a aucune dépendance npm : n'en ajouter aucune. Aucun secret dans le code.
- Ne jamais bloquer le zoom ; tout doit rester lisible à 360 px de large.
- En fin de tâche : un résumé court (fichiers touchés, ce qui a changé, résultat des tests, ce qui reste).
