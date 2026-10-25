# Mes tâches

Webapp personnelle de gestion de tâches, **mobile first**, installable en PWA.

- **Front** : React + Vite + TypeScript + Tailwind, hébergé sur **GitHub Pages**.
- **Backend** : **Supabase** (Postgres + RLS, Auth par email, Edge Functions, pg_cron).
- Aucun secret dans le dépôt : le front ne connaît que l'URL Supabase et la clé *anon* (publique).

| Phase | Contenu | État |
|---|---|---|
| 1 | Setup, Auth, tâches et sous-tâches, vues, déploiement | ✅ |
| 2 | Contacts, liens, dossiers, pièces jointes, Markdown | ⏳ |
| 3 | Rappels + notifications push | ⏳ |
| 4 | Emails (Resend) et SMS (Free Mobile) | ⏳ |
| 5 | Assistant IA (Gemini) | ⏳ |
| 6 | PWA, hors ligne, finitions | ⏳ |

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
  features/          un dossier par domaine : auth, tasks, subtasks, tags, calendar, settings, history
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

## 4. Tester sur votre téléphone

- **Version déployée** : ouvrez <https://niamort36-prog.github.io/taskmanager/> dans Chrome (Android) ou Safari (iPhone).
- **Version locale** : `npm run dev -- --host`, puis ouvrez `http://<IP-du-PC>:5173/taskmanager/` depuis le téléphone (même Wi-Fi). Ajoutez cette URL aux *Redirect URLs* Supabase si vous voulez utiliser le lien de l'email ; le code à 6 chiffres fonctionne dans tous les cas.
- **Dans le navigateur du PC** : outils de développement (F12) → icône téléphone → *iPhone 12 Pro* (390 px), *Galaxy S8* (360 px), *iPhone 14 Pro Max* (430 px).

## 5. Gestes et raccourcis

| Geste | Effet |
|---|---|
| Toucher une tâche | Ouvre le détail (bottom sheet ; panneau à droite sur PC) |
| Glisser vers la droite | Terminer (ou rouvrir) |
| Glisser vers la gauche | Reporter : demain, semaine prochaine, +1 semaine, date au choix |
| Appui long | Sélection multiple → terminer / reporter / supprimer en groupe |
| Bouton « + » | Saisie rapide (titre seul + raccourcis de date) |
| Tirer la poignée d'une sous-tâche | Réordonner |

## 6. Secrets (phases suivantes)

Tous les secrets vont dans **Supabase → Edge Functions → Secrets** (ou `npx supabase secrets set NOM=valeur`), jamais dans le dépôt :

| Secret | Phase | Où l'obtenir |
|---|---|---|
| `VAPID_PRIVATE_KEY` | 3 | généré par un script fourni en phase 3 |
| `RESEND_API_KEY` | 4 | <https://resend.com> → API Keys |
| `FREE_MOBILE_USER`, `FREE_MOBILE_KEY` | 4 | Espace abonné Free Mobile → *Mes options* → activer **Notifications par SMS** : l'identifiant et la clé s'affichent |
| `GEMINI_API_KEY` | 5 | <https://aistudio.google.com/apikey> |

> L'API SMS de Free Mobile envoie uniquement vers **votre propre ligne** : le numéro n'est jamais stocké, seuls l'identifiant et la clé le sont.
