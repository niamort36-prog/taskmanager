# Mes tâches

Webapp personnelle de gestion de tâches, **mobile first**, installable en PWA.

- **Front** : React + Vite + TypeScript + Tailwind, hébergé sur **GitHub Pages**.
- **Backend** : **Supabase** (Postgres + RLS, Auth par email, Edge Functions, pg_cron).
- Aucun secret dans le dépôt : le front ne connaît que l'URL Supabase et la clé *anon* (publique).

| Phase | Contenu | État |
|---|---|---|
| 1 | Setup, Auth, tâches et sous-tâches, vues, déploiement | ✅ |
| 2 | Contacts, liens, dossiers, pièces jointes, Markdown | ✅ |
| 3 | Rappels + notifications push | ✅ |
| 4 | Emails (Resend/Brevo), SMS (Free Mobile), récapitulatif quotidien | ✅ |
| 5 | Assistant IA (Gemini) | ✅ |
| 6 | PWA, hors ligne, plan d'action IA, finitions | ✅ |

---

## Structure

```
.github/workflows/   deploy-pages.yml (front), deploy-supabase.yml (migrations), keepalive.yml
supabase/
  config.toml        configuration du Supabase local
  migrations/        schéma SQL versionné (appliqué dans l'ordre)
  templates/         modèle de l'email de connexion (lien + code)
src/
  app/               routes et mise en page (barre du bas / barre latérale)
  components/ui/     composants génériques (bottom sheet, toast, champ date…)
  features/          un dossier par domaine : auth, tasks, subtasks, tags, contacts, links,
                     attachments, calendar, settings, history
  lib/               client Supabase, cache, dates (Europe/Paris)
  types/             types métier
```

---

## 1. Créer le projet Supabase (une fois)

1. Créez un compte sur <https://supabase.com>, puis **New project** (région *West EU (Paris)* ou *Frankfurt*). Notez le **mot de passe de la base**.
2. **Appliquer le schéma**, au choix :
   - **CLI** (recommandé) :
     ```bash
     npx supabase login
     ```
     ```bash
     npx supabase link --project-ref <REF_DU_PROJET>
     ```
     ```bash
     npx supabase db push
     ```
     (`<REF_DU_PROJET>` est l'identifiant dans l'URL du dashboard : `https://supabase.com/dashboard/project/<ref>`.)
   - **Ou à la main** : *SQL Editor* → coller le contenu de chaque fichier de `supabase/migrations/` dans l'ordre → *Run*.
3. **Authentication → Sign In / Providers** :
   - *Email* activé, **désactiver « Allow new users to sign up »** (usage personnel).
4. **Authentication → Users → Add user → Create new user** : votre email, cochez *Auto Confirm User*. (Le mot de passe ne servira pas, la connexion se fait par code.)
5. **Authentication → URL Configuration** :
   - *Site URL* : `https://niamort36-prog.github.io/taskmanager/`
   - *Redirect URLs* : ajoutez `https://niamort36-prog.github.io/taskmanager/` et `http://localhost:5173/taskmanager/`
6. **Authentication → Emails → Templates → Magic Link** : remplacez le contenu par celui de [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html) (il ajoute le **code à 6 chiffres**, indispensable dans la PWA iPhone).
7. **Project Settings → API** : copiez l'**URL** et la clé **anon public**.

> Le serveur d'email intégré de Supabase est limité (quelques emails/heure) : largement suffisant pour se connecter. On pourra brancher Resend en SMTP en phase 4.

## 2. Lancer en local

Prérequis : Node 22+.

```bash
npm install
```

Créez `.env.local` à partir de `.env.example` avec l'URL et la clé anon, puis :

```bash
npm run dev
```

L'app est sur <http://localhost:5173/taskmanager/>.

### Mode démo (sans backend)

```bash
npm run demo
```

Lance l'interface avec un backend **simulé en mémoire** (données d'exemple, session factice, rien n'est enregistré). Pratique pour tester l'ergonomie sur téléphone sans toucher à vos vraies données. Ce mode n'existe pas dans le build de production.

### Variante 100 % locale (Docker)

Avec Docker Desktop lancé, un Supabase complet tourne sur votre PC (les emails arrivent dans une boîte de test) :

```bash
npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,studio,postgres-meta
```

Utilisez alors l'URL `http://127.0.0.1:54321` et la clé *anon/publishable* affichées dans `.env.local`. Créez l'utilisateur via l'API admin (voir `npx supabase status` pour la clé service) ; les emails de connexion sont visibles sur <http://127.0.0.1:54324>.

## 3. Déployer sur GitHub Pages

Le workflow [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) construit et publie le site à chaque push sur `main`.

1. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
2. **Settings → Secrets and variables → Actions → onglet *Variables*** : créez
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (ce sont des *variables* et non des *secrets* : ces valeurs sont publiques par nature, la sécurité repose sur les règles RLS).
3. **Actions → Déploiement GitHub Pages → Run workflow** (ou poussez un commit).

Site : <https://niamort36-prog.github.io/taskmanager/>

### Garder le projet Supabase actif

Un projet gratuit est mis en pause après ~7 jours sans requête. Le workflow [`keepalive.yml`](.github/workflows/keepalive.yml) fait un appel REST deux fois par semaine (il utilise les mêmes variables).

### (Optionnel) Migrations automatiques

[`deploy-supabase.yml`](.github/workflows/deploy-supabase.yml) applique `supabase/migrations` à chaque modification. Il faut :
- secrets : `SUPABASE_ACCESS_TOKEN` (<https://supabase.com/dashboard/account/tokens>) et `SUPABASE_DB_PASSWORD` ;
- variable : `SUPABASE_PROJECT_REF`.

## 4. Mettre à jour la base (nouvelle migration)

À chaque phase, un nouveau fichier apparaît dans `supabase/migrations/`. Pour l'appliquer :
- **SQL Editor** du dashboard → coller le contenu du **nouveau** fichier uniquement → *Run* ;
- ou `npx supabase db push` (après `npx supabase login` et `npx supabase link`), qui n'applique que les migrations manquantes.

La migration de la phase 2 crée aussi le bucket Storage privé `attachments` (50 Mo max par fichier) et ses règles d'accès : rien à faire à la main dans *Storage*.

## 5. Rappels et notifications push (phase 3)

### Fonctionnement
1. `pg_cron` exécute `dispatch_due_reminders()` **chaque minute**. Cette fonction SQL n'appelle l'Edge Function `send-reminders` (via `pg_net`) que s'il existe des rappels échus.
2. `send-reminders` vérifie le secret partagé (stocké dans Supabase Vault), puis appelle `claim_due_notifications()`. Celle-ci, dans une seule transaction, verrouille les rappels, crée une ligne de journal par canal (contrainte unique : **jamais de doublon**) et calcule l'occurrence suivante en heure de Paris.
3. Chaque envoi est journalisé dans `notification_logs` (`sent`, `failed` avec 3 tentatives maximum, ou `skipped`). Le journal est visible dans Réglages.
4. Pendant la plage « ne pas déranger », les rappels attendent sa fin.

### Mise en place (une fois)
1. **Migration** : exécuter `supabase/migrations/20261027000001_reminders_push.sql` dans le SQL Editor. Elle active `pg_cron` et `pg_net`, génère le secret du cron dans Vault et planifie la tâche.
2. **URL du projet dans Vault** (SQL Editor) :
   ```sql
   select vault.create_secret('https://<REF>.supabase.co', 'project_url');
   ```
3. **Clés VAPID** : `supabase/.env.secrets` (ignoré par git) contient la paire de clés. Pour en générer une nouvelle : `npx web-push generate-vapid-keys`.
   - La clé **publique** va dans la variable GitHub `VITE_VAPID_PUBLIC_KEY`.
   - La clé **privée** reste dans les secrets Supabase.
4. **Déploiement des Edge Functions** (après `npx supabase login`) :
   ```bash
   npm run secrets:push
   ```
   ```bash
   npm run functions:deploy
   ```
5. Dans l'app : **Réglages → Notifications push sur cet appareil → Activer**, puis **Envoyer un test**.

> **iPhone** : les notifications push ne fonctionnent que si l'app est **installée sur l'écran d'accueil** (Safari → Partager → « Sur l'écran d'accueil », iOS 16.4 ou plus). L'écran Réglages l'explique.

## 6. Emails et SMS (phase 4)

Les fournisseurs sont interchangeables (`supabase/functions/_shared/email.ts` et `sms.ts`). Leurs clés vont dans `supabase/.env.secrets` (ignoré par git), puis `npm run secrets:push`.

### SMS : Free Mobile
1. Espace abonné Free Mobile → **Mes options** → activez **Notifications par SMS**.
2. Notez l'**identifiant** et la **clé** affichés.
3. Ajoutez dans `supabase/.env.secrets` :
   ```
   FREE_MOBILE_USER=12345678
   FREE_MOBILE_KEY=xxxxxxxxxxxxxx
   ```
4. L'API envoie **uniquement vers votre propre ligne**. Pour un autre destinataire, il faut Twilio : `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_TO`.

### Email : Resend (ou Brevo)
- **Resend** : <https://resend.com> → API Keys → `RESEND_API_KEY=re_…`. Sans domaine vérifié, l'expéditeur est `onboarding@resend.dev` et les emails ne partent **que vers l'adresse de votre compte Resend**. Avec un domaine : `EMAIL_FROM=Mes tâches <rappels@votre-domaine.fr>`.
- **Brevo** : <https://www.brevo.com> → SMTP & API → clé API → `BREVO_API_KEY=…`, et `EMAIL_FROM=Mes tâches <adresse-validée@…>` (une adresse validée dans « Expéditeurs »).
- Si les deux sont présents, `EMAIL_PROVIDER=resend|brevo` choisit.

### Dans l'app
**Réglages → Canaux autorisés** : saisissez l'adresse email, activez Email et/ou SMS, puis **Tester**. Le **récapitulatif quotidien** (tâches du jour + retards) s'active juste en dessous, avec son heure d'envoi. Il n'est envoyé qu'une fois par jour, et pas du tout s'il n'y a rien.

## 7. Assistant IA (phase 5)

Dans le détail d'une tâche, la section **Assistant IA** propose quatre actions :
- **Rédiger un mail** : relance, demande d'info, point ou mail libre. On choisit le destinataire parmi les contacts liés et le ton (formel, neutre, direct). Le texte est modifiable, copiable, ou s'ouvre dans la messagerie (`mailto:`).
- **Répondre à un mail** : collez le mail reçu, l'IA propose une réponse.
- **Prochaines étapes** et **Découper la tâche** : suggestions ajoutables en sous-tâches, une par une ou toutes d'un coup.

Fonctionnement et sécurité :
- Tout passe par l'Edge Function `ai`. La clé Gemini reste dans les secrets Supabase, jamais dans le navigateur ni dans le dépôt.
- Le contexte est construit côté serveur : titre, description, notes, sous-tâches, nom et rôle du contact. **Jamais de téléphone ni d'email.**
- Quota : `settings.ai_daily_limit` (50 par jour par défaut) et 10 demandes par minute au maximum. Chaque appel est journalisé dans `ai_usage`.
- Fournisseur interchangeable : `supabase/functions/_shared/ai/provider.ts`. Gemini est l'implémentation par défaut.

Configuration :
1. Créez une clé sur <https://aistudio.google.com/apikey>.
2. Ajoutez dans `supabase/.env.secrets` : `GEMINI_API_KEY=…`. Facultatif : `GEMINI_MODEL` (ici `gemini-3.8-flash`) et `GEMINI_FALLBACK_MODEL` (secours si le modèle principal est surchargé, `gemini-2.5-flash` par défaut).
3. Lancez `npm run secrets:push`.

> Avec l'offre gratuite de Gemini, Google peut utiliser les contenus envoyés pour améliorer ses modèles.

### Plan d'action IA (toutes les tâches)
Bouton **Plan IA** en haut d'« Aujourd'hui » (et dans la barre latérale sur PC). On choisit l'horizon (aujourd'hui ou 7 jours) et, si besoin, des contraintes (« 3 h dispo cet après-midi »). L'IA renvoie :
- une synthèse ;
- les tâches classées (urgent, important, rapide, à débloquer, peut attendre), avec le **pourquoi** et le **comment** ;
- un plan par créneaux ;
- des conseils d'organisation.

Le dernier plan reste consultable hors ligne. Les tâches sont envoyées au modèle sous des références courtes (T1, T2…), et seuls titres, échéances, sous-tâches, étiquettes et noms des contacts sont transmis.

## 8. PWA et hors ligne (phase 6)

- **Installation** : Android (Chrome) via le bandeau « Installer » d'« Aujourd'hui » ou le menu ⋮ ; iPhone via Safari → Partager → « Sur l'écran d'accueil ». L'app s'ouvre en plein écran, avec les raccourcis « Nouvelle tâche » et « Aujourd'hui » (appui long sur l'icône).
- **Hors ligne** :
  - le service worker (`public/sw.js`) met l'application en cache : réseau d'abord avec 3 s de délai maximal, puis cache ;
  - les données sont gardées 7 jours dans IndexedDB ;
  - créer une tâche, la modifier, la terminer, gérer ses sous-tâches et ses étiquettes fonctionne sans réseau. Ces modifications sont **mises en file d'attente, conservées même si l'app est fermée**, puis envoyées au retour du réseau (bandeau « Hors ligne · n modifications en attente »). Voir `src/lib/offline.ts`.
  - Les fonctions qui demandent le serveur (pièces jointes, IA, contacts, rappels) attendent le réseau.
- **Tirer vers le bas** sur une liste pour actualiser.
- **Dictée vocale** : bouton micro dans la saisie rapide, la description, les notes, les sous-tâches et le plan IA. Il est masqué si le navigateur ne le gère pas ; le micro du clavier reste disponible. Selon le navigateur, la voix peut être transcrite par les serveurs de Google (Chrome) ou d'Apple (Safari).
- **Poids** : environ 220 Ko compressés au premier chargement. Les pages secondaires, le détail d'une tâche et le rendu Markdown se chargent à la demande. Ensuite, l'app est servie depuis le cache.

### Export, impression et partage
Bouton **imprimante** en haut de « Toutes les tâches ».
- **Contenu** : tâches en cours, retards + aujourd'hui, 7 prochains jours, filtres actuels de la liste, ou tout (y compris terminées).
- **Regroupement** : par échéance, statut, priorité ou étiquette.
- **Détails au choix** : sous-tâches, descriptions, notes, contacts avec leur téléphone.
- **Imprimer / PDF** : la feuille sort en noir sur blanc quel que soit le thème. Sur téléphone, choisir « Enregistrer en PDF » dans la fenêtre d'impression.
- **Partager** : envoie la liste en texte (SMS, WhatsApp, email…). **Copier** la met dans le presse-papiers.

## 9. Tester sur votre téléphone

- **Version déployée** : ouvrez <https://niamort36-prog.github.io/taskmanager/> dans Chrome (Android) ou Safari (iPhone).
- **Version locale** : `npm run dev -- --host`, puis ouvrez `http://<IP-du-PC>:5173/taskmanager/` depuis le téléphone (même Wi-Fi). Ajoutez cette URL aux *Redirect URLs* Supabase si vous voulez utiliser le lien de l'email ; le code à 6 chiffres fonctionne dans tous les cas.
- **Dans le navigateur du PC** : outils de développement (F12) → icône téléphone → *iPhone 12 Pro* (390 px), *Galaxy S8* (360 px), *iPhone 14 Pro Max* (430 px).

## 10. Gestes et raccourcis

| Geste | Effet |
|---|---|
| Toucher une tâche | Ouvre le détail (bottom sheet ; panneau à droite sur PC) |
| Glisser vers la droite | Terminer (ou rouvrir) |
| Glisser vers la gauche | Reporter : demain, semaine prochaine, +1 semaine, date au choix |
| Appui long | Sélection multiple → terminer / reporter / supprimer en groupe |
| Bouton « + » | Saisie rapide (titre seul + raccourcis de date) |
| Tirer la poignée d'une sous-tâche | Réordonner |
| Tirer la liste vers le bas | Actualiser |
| Appui long sur l'icône de l'app | Raccourcis « Nouvelle tâche », « Aujourd'hui » |
| Boutons téléphone / bulle / enveloppe d'un contact | Appeler, SMS, email (tel:, sms:, mailto:) |
| Toucher un chemin réseau | Le copie dans le presse-papiers (un navigateur ne peut pas l'ouvrir) |

## 11. Secrets

Tous les secrets vont dans **Supabase → Edge Functions → Secrets** (ou `npx supabase secrets set NOM=valeur`), jamais dans le dépôt :

| Secret | Phase | Où l'obtenir |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `APP_URL` | 3 | `supabase/.env.secrets`, envoyé par `npm run secrets:push` |
| `RESEND_API_KEY` ou `BREVO_API_KEY` (+ `EMAIL_FROM`) | 4 | voir section 6 |
| `FREE_MOBILE_USER`, `FREE_MOBILE_KEY` | 4 | Espace abonné Free Mobile → *Mes options* → activer **Notifications par SMS** : l'identifiant et la clé s'affichent |
| `GEMINI_API_KEY` | 5 | <https://aistudio.google.com/apikey> |

> L'API SMS de Free Mobile envoie uniquement vers **votre propre ligne** : le numéro n'est jamais stocké, seuls l'identifiant et la clé le sont.
