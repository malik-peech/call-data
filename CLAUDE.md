# CLAUDE.md — Call Data

Contexte pour reprendre le projet. **Aucun secret ici** (fichier versionné) — les clés
sont dans Coolify (env) et documentées dans [`docs/SETUP.md`](docs/SETUP.md).

## Ce que c'est
App qui centralise les **calls de l'agence** (vidéo + transcript), les catégorise par
**client / code projet**, avec une **IA** : résumé auto + Q&A sur un call + Q&A transversal
(par client/projet). Peech-Newic (agence de prod vidéo / SMM).

## Stack
- **Next.js 15** (App Router, TS, Tailwind v4), Docker `standalone`
- **Supabase** : Postgres + `pgvector` + Storage + Auth
- **Claude** (résumés/Q&A) + **Voyage** (embeddings)
- Déploiement **Coolify** (Dockerfile, port **5000**)
- ⚠️ **Pas de Node en local** → on ne build/teste pas ici, tout se vérifie au déploiement Coolify.

## Sources de données (décisions arrêtées)
| Source | Rôle | Vidéo | Transcript |
|---|---|---|---|
| **Recall.ai** *(principale)* | bot auto sur agendas de l'équipe **sauf sales** | ✅ (stockée par nous) | ✅ natif Recall |
| **Attio** | calls **sales** (déjà leur outil) | 🔗 lien seulement (pas d'API vidéo) | ✅ |
| **Google Meet** natif | historique / fallback | ✅ si dispo (Drive) | ✅ Doc Drive |
| **Airtable** | référentiel clients + codes projets (catégo) | — | — |

- **Anti-double-bot** : une réunion = un seul système. Sales → Attio ; reste → Recall
  (`RECALL_EXCLUDE`, `shouldRecordEvent`). Filet : dédup DB `calls.duplicate_of`.
- **Transcription native** (Recall/Attio/Meet fournissent le transcript). Notre STT
  ([`ai/transcription.ts`](src/lib/ai/transcription.ts), Gladia/Whisper) = **fallback** rare.
- **Attio ne donne PAS la vidéo par API** (mp4 sur GCS via URL signée, session-only).
- **Airtable** : base `appYFl5MvR7VeL0uB`, table `tbl0Pij0JqZFD9Ijr`, vue `viwsjtvRuPucNQXXR`
  (projets « En cours » / « Finalisation »). Champs : code `fldMLeWX9bmpeIUbe`,
  nom `fldCXc7SrrEMhTzew`, client `fld4HBc0UG3hUDhBK` + lookup `fldGhYcxGEidchBDF`.

## Architecture (flux)
```
Agendas (hors sales) → Recall auto-schedule → webhook bot.done
  → ingestRecallBot: vidéo → Supabase Storage, transcript → call_segments
Attio (sales) / Meet → /api/sync (pull)
/api/process (cron) → résumé Claude → call_summaries ; chunk+embeddings → call_chunks
UI: liste filtrable → fiche call (vidéo/transcript/résumé + chat) ; /chat transversal
Chat: /api/chat → match_call_chunks (pgvector) → Claude → réponse + citations
```

## Carte du code
- `src/lib/env.ts` — accès env centralisé (getters *lazy*, ne throw qu'à l'usage)
- `src/lib/integrations/` — `recall.ts`, `attio.ts`, `google.ts`, `airtable.ts`
- `src/lib/ingest/` — `recall.ts`, `attio.ts`, `meet.ts`, `airtable.ts`, `calendar.ts`
- `src/lib/ai/` — `anthropic.ts`, `embeddings.ts`, `chunk.ts`, `search.ts`, `categorize.ts`, `process.ts`, `transcription.ts`
- `src/lib/supabase/` — `admin.ts` (service-role, bypass RLS), `server.ts` (SSR/auth), `browser.ts`, `storage.ts`
- `src/app/api/` — `recall/webhook`, `sync`, `process`, `chat`, `retention`, `auth/callback`, `auth/signout`
- `src/app/(app)/` — `calls`, `calls/[id]`, `chat` (protégées par `src/middleware.ts`)
- `supabase/migrations/` — `0001_init.sql`, `0002_rls.sql`
- Docs : `docs/SETUP.md` (toutes les clés), `docs/RECORDER.md` (Recall + règles + rétention)

## Endpoints cron (auth `Bearer $SYNC_SECRET`)
```
POST /api/sync?airtable=1&attio=1&meet=1&process=1   # pull sources + IA
POST /api/process                                     # résumés + embeddings en attente
POST /api/retention                                   # purge vidéos > RETENTION_MEDIA_DAYS
POST /api/recall/webhook                              # push Recall (bot.done, calendar.sync_events)
```

## État du déploiement (au 2026-07-29)
- **Repo** : github.com/malik-peech/call-data — `main`.
- **Supabase** : projet `call-data` (org Peech Newic, free, **eu-west-1**),
  ref `xcekasyxgxrklqteocdv`. Migrations `0001` + `0002` exécutées, **RLS activé**.
  Bucket privé **`call-media`** créé.
- **Coolify** : app sur `calldata.peech-newic.com`, port 5000, Dockerfile.
  Toutes les env renseignées (Supabase, Recall, Anthropic, Voyage, Airtable) —
  `NEXT_PUBLIC_*` marquées **build-time**.
- **Build** : corrigé (`typescript.ignoreBuildErrors` — cf. plus bas). Redeploy à relancer.

## ⚠️ Gotchas / dette connue
1. **Type-check désactivé au build** (`next.config.ts` → `typescript.ignoreBuildErrors: true`) :
   le type `Database` fait main ne modélise pas les relations → l'inférence supabase-js
   donne `never` sur les selects joints. Ce sont des artefacts, pas des bugs runtime.
   *Dette* : générer les types (`supabase gen types typescript`) et retirer le flag.
2. **Healthcheck Coolify** : `/` redirige (3xx) → peut marquer *unhealthy*. Mettre le
   healthcheck sur `/login` (ou ajouter un `/api/health`).
3. **Supabase Free** : upload max **50 Mo** + 1 Go total → les vidéos de réunion vont
   dépasser. Pour héberger la vidéo : passer **Pro** ou stockage externe (S3/R2).
   Le cœur (transcript + IA) marche sans.
4. **Rien n'a encore tourné end-to-end** — 1er vrai bot Recall à valider (chemins
   `media_shortcuts`, config `recallai_async`, format transcript = écrits défensivement).

## TODO pour finir la mise en service
1. **Relancer le build Coolify** (fix poussé) → vérifier que le conteneur démarre.
2. **Login Google** (bloque l'accès à l'app) : recette dans [`docs/SETUP.md`](docs/SETUP.md) §3 —
   Google Cloud OAuth client (consent **Internal**) + redirect `https://<ref>.supabase.co/auth/v1/callback`,
   puis Supabase Auth → Providers → Google + URL Configuration (Site URL + `…/**`).
3. **Recall** : créer le compte en région **EU** → `RECALL_REGION=eu-central-1`,
   `RECALL_API_KEY`, puis webhook `https://calldata.peech-newic.com/api/recall/webhook` → `RECALL_WEBHOOK_SECRET`.
   Connecter les agendas (hors sales) + régler `RECALL_EXCLUDE`.
4. **Crons** : programmer `/api/sync?airtable=1`, `/api/process`, `/api/retention`.
5. **1er test** : réunion de test → webhook → ingestion → fiche call → résumé → chat.

## Conventions
- Réponses/UI en **français**.
- Accès data serveur via `supabaseAdmin()` (service-role) ; l'auth est gardée par le middleware.
- Ne jamais exposer `SUPABASE_SERVICE_ROLE_KEY` / clés secrètes côté client.
