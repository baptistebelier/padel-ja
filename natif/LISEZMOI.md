# /Buvette sur l'App Store

L'appli de l'App Store est une coque native (Capacitor) qui affiche `https://buvette.riseandmove.fr`.
Ce qu'on change dans `club/` arrive donc dans l'appli sans repasser par Apple.
Il ne faut une nouvelle version sur l'App Store que si l'on touche à ce dossier `natif/`
(icône, permissions, modules natifs).

Pas besoin de Mac : la compilation se fait sur les Mac de Codemagic (`codemagic.yaml` à la racine).

## Ce que la coque ajoute au site

- Notifications natives d'Apple. L'appli envoie son jeton au serveur (`apns:<jeton>`), puis `lib/apns.js` écrit à Apple.
- Appareil photo et photothèque, avec les phrases d'autorisation en français dans `ios/App/App/Info.plist`.
- Page « Pas de connexion » (`www/index.html`) quand le téléphone est hors ligne.
- Pas d'achat d'offre ni de prix dans l'appli : c'est la règle d'Apple, voir `enNatif()` dans `club/ui/1-briques.js`.

## Mise en route, une seule fois

### 1. Apple

1. Créer le compte développeur : <https://developer.apple.com/programs/>. Il coûte 99 $ par an. Le prendre en organisation si RAM a un numéro SIREN, ce qui demande un numéro D-U-N-S, gratuit.
2. Dans **Certificates, Identifiers & Profiles**, ouvrir **Identifiers** et créer l'App ID `fr.riseandmove.buvette`. Cocher la case **Push Notifications**.
3. Dans **Keys**, créer une clé avec **Apple Push Notifications service (APNs)**. Télécharger le fichier `.p8`, qui ne se télécharge qu'une fois. Noter son **Key ID** et le **Team ID**, affiché en haut à droite.
4. Dans **App Store Connect**, ouvrir **Mes apps** puis **+ Nouvelle app** :
   - nom : /Buvette ;
   - langue : français ;
   - identifiant de lot : `fr.riseandmove.buvette` ;
   - SKU : `buvette`.
5. Toujours dans App Store Connect, aller dans **Utilisateurs et accès**, puis **Intégrations**, puis **Clés d'API App Store Connect**. Créer une clé avec le rôle **Gestionnaire d'apps** (App Manager). Télécharger son fichier `.p8`, et noter l'**Issuer ID** et le **Key ID**.

### 2. Render (notifications)

Ajouter ces variables d'environnement au service :

- `APNS_KEY` : le contenu du fichier `.p8` de l'étape 1.3, y compris les lignes BEGIN et END.
- `APNS_KEY_ID` : le Key ID de cette clé.
- `APNS_TEAM_ID` : le Team ID.

### 3. Codemagic

1. Créer un compte sur <https://codemagic.io> avec GitHub et donner accès au dépôt `padel-ja`.
2. Aller dans **Team settings**, puis **Integrations**, puis **Developer Portal**. Ajouter la clé d'API de l'étape 1.5 sous le nom **RAM App Store**.
3. Toujours dans **Team settings**, ouvrir **codemagic.yaml settings**, puis **Code signing identities**. Choisir **iOS certificates** puis **Generate certificate**, de type Apple Distribution. Codemagic crée le certificat et le garde.
4. Dans `codemagic.yaml`, remplacer `APP_STORE_APPLE_ID` par l'identifiant Apple de l'appli. C'est un nombre à 10 chiffres, visible dans App Store Connect, rubrique Informations sur l'app.
5. Ouvrir l'appli dans Codemagic, choisir **Start new build**, la branche `main` et le workflow **/Buvette iOS → TestFlight**.

En 15 à 20 minutes, la compilation arrive sur TestFlight. On l'installe ensuite sur iPhone et iPad avec l'appli TestFlight.

## Avant d'envoyer à Apple pour validation

- Mettre en ligne de vraies conditions d'utilisation et une vraie politique de confidentialité, à une adresse publique.
- Préparer un compte de démonstration pour les testeurs d'Apple, dans un club rempli d'exemples.
- Remplir la fiche App Store :
  - captures pour iPhone 6,9 pouces et iPad 13 pouces ;
  - description et mots-clés ;
  - adresse d'assistance ;
  - âge minimum ;
  - questionnaire sur les données collectées.

## Changer l'icône ou l'écran de démarrage

Sur un PC Windows, dans `natif/` :

```
npm ci
npm run icones
```

Le logo source est `assets/icone.svg`.
