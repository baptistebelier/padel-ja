# Mettre Padel JA en ligne — guide pas à pas

Objectif : `https://ja.riseandmove.fr`, une page de présentation pour les clubs, une démo en un clic et des comptes juge-arbitre.

Durée : environ 45 minutes. Coût : 0 € pour Supabase et GitHub, environ 7 $/mois pour Render (formule *Starter*, sans mise en veille).

> Ne m'envoie jamais tes mots de passe ni tes clés secrètes dans la conversation. Tu les colleras toi-même dans Render (étape 4).

---

## Étape 1 — GitHub (stocker le code)
1. Va sur https://github.com et crée un compte gratuit (ou connecte-toi).
2. En haut à droite, **+ → New repository**.
3. Nom : `padel-ja`. Coche **Private**. Ne coche rien d'autre. Clique sur **Create repository**.
4. Donne-moi l'adresse affichée (du type `https://github.com/ton-pseudo/padel-ja`). Je prépare l'envoi du code, et tu valides la connexion à GitHub dans la fenêtre qui s'ouvrira.

## Étape 2 — Supabase (base de données)
1. Va sur https://supabase.com et clique sur **Start your project**. Inscris-toi, par exemple avec ton compte GitHub.
2. **New project** :
   - Name : `padel-ja`
   - Database password : clique sur *Generate* et garde-le dans un gestionnaire de mots de passe (tu n'en auras pas besoin au quotidien)
   - Region : **Central EU (Frankfurt)** ou **West EU (Paris)**, pour le RGPD
   - Clique sur **Create new project** et attends environ 2 minutes.
3. Menu de gauche **SQL Editor → New query**. Colle tout le contenu du fichier `supabase.sql` (dans ce dossier), puis clique sur **Run**. Le message attendu est « Success. No rows returned ».
4. Menu **Project Settings → API**. Note deux valeurs (à garder pour toi) :
   - **Project URL**, du type `https://xxxx.supabase.co`
   - la clé **service_role** (section *Project API keys*, bouton *Reveal*). ⚠️ Elle est secrète : elle donne tous les droits sur la base.

## Étape 3 — Render (héberger le logiciel)
1. Va sur https://render.com et inscris-toi **avec ton compte GitHub**.
2. Autorise Render à accéder au dépôt `padel-ja`.
3. **New + → Blueprint**, puis choisis le dépôt `padel-ja`. Render lit le fichier `render.yaml` tout seul (serveur à Francfort, Node 20).
4. Render te demande deux valeurs : colle **SUPABASE_URL** (Project URL) et **SUPABASE_SERVICE_KEY** (clé service_role). `SESSION_SECRET` est générée automatiquement.
5. Clique sur **Apply**. Au bout de 2 à 3 minutes, tu as une adresse du type `https://padel-ja.onrender.com`. Ouvre-la : c'est la page de présentation.

## Étape 4 — Ton adresse `ja.riseandmove.fr`
1. Dans Render : service `padel-ja` → **Settings → Custom Domains → Add** → `ja.riseandmove.fr`. Render affiche une cible du type `padel-ja.onrender.com`.
2. Dans **Shopify** : **Paramètres → Domaines → riseandmove.fr → Paramètres du domaine → Modifier les enregistrements DNS → Ajouter un enregistrement** :
   - Type : **CNAME**
   - Nom : `ja`
   - Valeur : la cible donnée par Render
3. Retourne dans Render et clique sur **Verify**. Le certificat HTTPS se crée tout seul (de quelques minutes à 1 heure).

Ta boutique n'est pas touchée : on ajoute seulement un sous-domaine.

## Étape 5 — Vérification
- `https://ja.riseandmove.fr`, bouton **Essayer la démo** : le tournoi démo s'ouvre.
- **Créer un compte** avec ton e-mail, puis crée un tournoi à partir d'un modèle.
- Onglet *Écran TV & stream* : les liens « Écran TV » et « Télécommande » fonctionnent depuis un autre appareil (smart TV, iPad, téléphone).

---

## Et ensuite
- **Abonnements via Shopify** : produit « Padel JA » plus l'app *Shopify Subscriptions*. Le logiciel active le compte automatiquement après l'achat.
- **Mot de passe oublié** par e-mail (Brevo, gratuit).
- **Mode hors connexion** pour les clubs avec un Wi-Fi faible.
- **Page publique** du tournoi pour les joueurs (QR code au club).

## Rappel : la version locale continue de marcher
`Lancer Padel JA.bat` démarre le logiciel sur ton PC, avec les données dans le dossier `data/`. À la première ouverture, crée un compte local : il ne sert que sur ce PC.
