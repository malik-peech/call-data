# Setup — accès externes

Toutes les clés vont dans `.env.local` (dev) ou les variables d'environnement Coolify (prod).
Modèle : [`.env.example`](../.env.example).

## 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com).
2. `Settings → API` :
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (**secret**, serveur uniquement)
3. `SQL Editor` → exécuter `supabase/migrations/0001_init.sql` puis `0002_rls.sql`.
   0001 active `pgvector` + crée les tables et `match_call_chunks` ; 0002 verrouille l'accès
   via la clé anon (RLS activé sans policy — tout passe par la clé service-role serveur).
4. `Storage` → créer un bucket **privé** nommé `call-media` (= `SUPABASE_MEDIA_BUCKET`)
   pour les vidéos/audios.

## 2bis. Recall.ai (capture principale)

1. Compte Recall.ai → clé API → `RECALL_API_KEY` ; région (ex. `us-east-1`) → `RECALL_REGION`.
2. Dashboard Recall → Webhooks : URL `https://<APP_URL>/api/recall/webhook`, secret Svix → `RECALL_WEBHOOK_SECRET`.
3. Connecter les agendas de l'équipe (Calendar Integration) et exclure les sales via `RECALL_EXCLUDE`.
   Détails : [`RECORDER.md`](RECORDER.md).

## 2. Attio (calls commerciaux)

1. Attio → `Settings → Developers → Access tokens` → créer un token.
2. Scopes nécessaires : lecture des **call recordings** et **objects/records** (companies, deals).
3. `ATTIO_API_KEY` = le token.

## 3. Google Workspace (transcripts + vidéos Meet)

Les transcripts Meet sont des Google Docs dans le dossier **Meet Recordings** du Drive ;
les vidéos sont des `.mp4` au même endroit. Pour un accès serveur non-interactif, on utilise
un **service account avec délégation à l'échelle du domaine**.

1. [Google Cloud Console](https://console.cloud.google.com) → créer/choisir un projet.
2. Activer l'API **Google Drive**.
3. `IAM & Admin → Service Accounts` → créer un service account → générer une clé JSON.
4. Noter le **Client ID** du service account (`Unique ID`).
5. Admin Google Workspace → `Sécurité → Contrôle des API → Délégation au niveau du domaine`
   → ajouter le Client ID avec le scope :
   `https://www.googleapis.com/auth/drive.readonly`
6. Encoder la clé JSON en base64 et la mettre dans `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` :
   ```bash
   base64 -i service-account.json | tr -d '\n'
   ```
7. `GOOGLE_IMPERSONATE_SUBJECT` = l'utilisateur dont on lit le Drive (ex. `malik@peechstudio.com`).
8. (Optionnel) `GOOGLE_MEET_FOLDER_ID` = l'id du dossier *Meet Recordings* pour limiter le scan.

> Pour lire les transcripts de **plusieurs** chefs de projet, soit ils partagent leur dossier
> Meet Recordings avec `GOOGLE_IMPERSONATE_SUBJECT`, soit on impersonne chaque CDP tour à tour
> (liste d'emails — à ajouter en P2 si besoin).

## 4. Airtable (référentiel clients / codes projets)

1. Créer un **personal access token** ([airtable.com/create/tokens](https://airtable.com/create/tokens))
   avec le scope `data.records:read` sur la base `appYFl5MvR7VeL0uB` → `AIRTABLE_API_KEY`.
2. `AIRTABLE_BASE_ID` / `AIRTABLE_PROJECTS_TABLE` / `AIRTABLE_PROJECTS_VIEW` sont pré-remplis
   (table Projets, vue filtrée sur les statuts **En cours / Finalisation**).
   Sert uniquement à la catégorisation auto (client + code projet).

## 5. IA

- **Anthropic** : [console.anthropic.com](https://console.anthropic.com) → API key → `ANTHROPIC_API_KEY`.
  Modèle par défaut `claude-sonnet-4-5` (surchargeable via `ANTHROPIC_MODEL`).
- **Voyage AI** : [dash.voyageai.com](https://dash.voyageai.com) → API key → `VOYAGE_API_KEY`.
  Modèle `voyage-3` (1024 dimensions, cohérent avec le schéma).
- **Transcription (fallback STT, optionnel)** : `TRANSCRIPTION_PROVIDER` (`gladia` par défaut)
  + `GLADIA_API_KEY` (ou `WHISPER_URL`). Utilisé seulement si une source ne fournit pas de
  transcript ; Recall/Attio/Meet transcrivent nativement.

## 6. App

- `APP_URL` = URL publique (Coolify).
- `ALLOWED_EMAIL_DOMAINS` = `peechstudio.com` (restreint le login).
- `SYNC_SECRET` = chaîne aléatoire longue ; protège l'endpoint `/api/sync` appelé par le cron.

## 7. Déploiement Coolify

1. Nouveau service → source = ce repo Git → build pack **Dockerfile**.
2. Port exposé : `5000`.
3. Renseigner toutes les variables d'environnement ci-dessus.
4. Programmer un cron (Coolify Scheduled Task ou cron externe) :
   ```
   curl -fsS -H "Authorization: Bearer $SYNC_SECRET" https://<APP_URL>/api/sync
   ```
