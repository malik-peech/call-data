# Call Data

Centralise les calls de l'agence — **vidéo + transcript** — les catégorise par
**client / code projet**, et offre une **interface IA** pour résumer un call et
l'interroger (sur un call précis ou de façon transversale par client/projet).

## Sources de données

| Source | Périmètre | Vidéo | Transcript | Accès |
|---|---|---|---|---|
| **Recall.ai** *(principale)* | Toute l'équipe **sauf sales** — bot auto-planifié sur les agendas | ✅ (stockée chez nous) | ✅ (transcrit chez nous) | Calendar Integration + webhooks |
| **Attio** *(sales)* | Calls commerciaux des sales | 🔗 lien Attio | ✅ | REST API |
| Google Meet natif | Historique / fallback | ✅ si dispo | ✅ | Drive API |
| Airtable | Référentiel clients + codes projets (vue projets actifs) | — | — | REST API |

**Règle anti-double-bot** : une réunion est captée par **un seul** système. Sales → Attio ;
tout le reste → Recall. Si un sales est invité à une réunion, Attio la possède et Recall s'abstient.
Filet de sécurité : dédup côté DB (`calls.duplicate_of`).

**Transcription & stockage chez nous** : Recall fournit la capture (bot) ; on télécharge
le média, on le stocke dans Supabase Storage, et on transcrit avec notre propre moteur STT
(diarisation par intervenant). Aucune dépendance à la transcription de Recall.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind v4)
- **Supabase** — Postgres + `pgvector` + Auth + **Storage** (média)
- **Recall.ai** — bots d'enregistrement + intégration agenda
- **STT** de secours (rarement utilisé — les sources fournissent leur transcript) : Gladia ou Whisper self-hosted
- **Claude** (Anthropic) — résumés & Q&A · **Voyage AI** — embeddings
- Déploiement **Coolify** (Dockerfile `standalone`)

## Architecture

```
Agendas équipe (hors sales) ─▶ Recall auto-schedule bot ─▶ webhook "done"
                                                              │
Attio (sales) ────────────────────────────────────────────┐  │
                                                           ▼  ▼
                                                     Ingestion (/api/ingest, /api/sync)
                                                           │
                        média ─▶ Supabase Storage          │
                        audio  ─▶ STT (diarisation) ─▶ call_segments
                                                           │
                                      ├─▶ Résumé (Claude)   → call_summaries
                                      └─▶ Chunk + embeddings → call_chunks (pgvector)

UI ─▶ liste / filtres client·projet ─▶ fiche call (vidéo + transcript + résumé)
   └▶ Chat IA (RAG) ─▶ match_call_chunks() ─▶ Claude ─▶ réponse + citations
```

Détails capture/agenda/rétention : [`docs/RECORDER.md`](docs/RECORDER.md).
Configuration des accès externes : [`docs/SETUP.md`](docs/SETUP.md).

## Développement

Pas de Node en local : build/run sur Coolify (ou tout hôte Docker).

```bash
cp .env.example .env.local   # renseigner les clés
npm install
npm run dev                  # http://localhost:5000
```

Base de données : exécuter les migrations de `supabase/migrations/` dans le SQL editor Supabase.

## Roadmap

- [x] **P1** — Scaffolding, schéma DB, config déploiement
- [x] **P2** — Intégrations : Attio, Float, Google Drive (+ clients Supabase)
- [x] **P2b** — Recall.ai : bot + calendar integration + webhooks + STT maison
- [x] **P3** — Ingestion + catégorisation auto (métadonnées agenda / titre / code projet)
- [x] **P4** — IA : résumés, chunking/embeddings, chat RAG (par call + transversal)
- [x] **P5** — UI : liste filtrable, fiche call (vidéo/transcript/résumé), chat
- [x] **P6** — Auth (Supabase + Google, domaine restreint), RLS, rétention RGPD, crons

> ⚠️ Code écrit sans exécution locale (pas de Node/clés) : à vérifier au 1er déploiement.
> Détails API version-sensibles (Recall `media_shortcuts`/`recallai_async`, format transcript)
> à confirmer sur un vrai bot.
```
