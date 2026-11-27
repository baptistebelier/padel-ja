# Carnet de bord — état des chantiers

À lire au début de chaque session (Claude ou Codex), puis à tenir à jour à la fin : ce qui est fait, ce qui reste,
les décisions prises. Court et factuel ; le détail est dans le code et l'historique git.
Dernière mise à jour : 27/11/2026.

## Comment on travaille
- Applis : /Pista (juges-arbitres, `public/`), /Buvette (club, `club/index.html`), /Dojo (enseignants, `club/coach.html`).
  Un seul serveur `server.js` (Render, service `srv-dbb2bpm7bikc73bfu7s0`), données Supabase.
- Copie de travail de Claude : `padel-ja/.claude/worktrees/post-prod-6090b3`. Mise en ligne :
  `git fetch -q origin && git rebase -q origin/main && git push -q origin HEAD:main` (Render déploie tout seul).
- Avant chaque envoi : `npm test` ; si changement de fonctionnement, aussi
  `SUPABASE_URL=https://exemple.invalid SUPABASE_SERVICE_KEY=sb_secret_essai npm test` et `npm run test:ecrans`.
- Après une modification de `club/`, changer `VERSION` dans `club/sw.js`. Prettier seulement sur les JS de `club/` modifiés.
- En local : serveur de prévisualisation « post-prod » (port 4877) ; démos : `/coach/` (Dojo), `/club/demo` (Buvette),
  `/demo` (Pista). Le service worker garde l'ancienne version : le désinscrire avant de vérifier.
- Le module de confidentialité bloque le shell sur les fichiers qui contiennent l'e-mail de Baptiste
  (`server.js`, `ecrans/ecrans.ecran.mjs`) : les lire et les modifier avec les outils Read / Edit / Grep.
- Économie de jetons (décision du 27/11) : sessions courtes (une par sujet) ; Codex fait le travail mécanique
  (chercher, modifier, tester) sur une consigne précise de Claude, Claude relit, vérifie et met en ligne ;
  vérifier par des mesures en texte, une seule capture réduite par écran modifié.

## En cours : revue design des 3 applis
Revue (page privée) : https://claude.ai/artifact/LsVW48RwUKLzoEbUwsa1bt — règles figées : `docs/regles-design.md`.
- **Lot 1 — fait** (commit b594878) : titre Statistiques (Dojo), « À faire » regroupé, doublon « Lancer le tirage »
  retiré (Pista), état vide standard `.etat-vide` (ds.css) dans Direct et Programmation, teinte du jour en vue Mois
  (Dojo) et calendrier (Pista), bandeaux de notification sous l'en-tête, « Envoyer un contenu » en contour.
- **Lot 2 — en partie fait** (27/11) : bandeau d'en-tête /Pista sur toute la largeur (éditeur de tournoi, « Équipes
  du club » `.page-h`), heures du planning en 13 px, nom non répété dans les fiches élève et groupe (Dojo),
  pictogrammes décoratifs en contour (Dojo `.tile`, Buvette `.bvtile`, Pista `.kpi .ico`), pastilles de niveau
  neutres, bandeau « adhérents » neutre et Agenda moins rose (Buvette).
  Reste : bandeau d'en-tête uniforme vérifié sur toutes les pages des 3 applis ; échelle d'espacement commune
  (4·8·12·16·24·32 ; carte 20 px, 16 au téléphone ; 16 entre cartes ; 24 entre sections) ; « Un seul bouton plein
  par zone » écran par écran.
  Fait le 27/11 (après-midi) : Bar /Buvette (bureau) — Carte / Gestion en intercalaires collés à une boîte
  `.bar-corps` (`.bar-tabs` ajouté au moteur des intercalaires) ; Groupes /Buvette — le « … » de chaque ligne laisse
  place à l'appui long (ou clic droit) sur la ligne (`data-lp-tout` dans `app/6-gestes.js`), « … » visible seulement
  au survol de la souris. Le serveur local et le service worker gardent l'ancien CSS : relancer et désinscrire.
- **Lot 3 — à faire** : état vide standard partout (Pista Joueurs, Équipes ; Dojo Réglages de groupe) ; listes à deux
  lignes et rangées entièrement cliquables (élèves, inscriptions, tournois, Groupes) ; menus « … » pour les actions
  secondaires (Pista Mes tournois, Inscriptions) ; réglages du groupe regroupés dans leur intercalaire (Dojo) ;
  fil d'Ariane cliquable et coches d'étapes 01→07 (Pista) ; Messages Dojo : étoiles rentrées dans la ligne.
- À la fin : mettre la revue à jour (marquer fait / reste). Générateur : `fabrique.js` dans le dossier temporaire
  de la session précédente — sinon reconstruire la page depuis ce carnet.

## En attente
- **Club de démo pour les testeurs d'Apple** : route `POST /api/admin/club-demo` et script `tools/club-demo.js`
  prêts ; `DEMO_APPLE_PASSWORD` posé sur Render. Reste à lancer le script dans un navigateur connecté en
  administrateur sur https://buvette.riseandmove.fr/demo (Baptiste doit être devant son ordinateur).
- **Appli iOS /Buvette** : coque Capacitor `natif/`, compilation Codemagic (`codemagic.yaml`). Restent côté Baptiste :
  compte Apple Developer, clés APNs et API, compte Codemagic ; mode d'emploi `natif/LISEZMOI.md`.
- **Menu pleine largeur** (section active du menu sur toute la largeur) : essai seulement sur /Dojo, pas encore
  validé ni étendu à /Buvette et /Pista.
- **Bascule des noms de domaine** : code prêt ; DNS, Render et `NOMS_OFFICIELS` à faire.

## Fait récemment (repères)
- 25/11 : section Tournois de /Buvette (`club/app/26-tournois.js`) ; panneau de notifications réparé (notification
  d'une personne absente du club) ; heure de fin des tournois /Pista ; outils `ja_modeles` / `ja_modifier_modele`.
- 25–26/11 : moteur commun `club/empilement.js` (boîtes imbriquées, éléments de données, navigation à plat,
  intercalaires) chargé par les 3 applis.
