# Recorder — capture des calls (Recall.ai)

Recall.ai est la **source principale** : un bot rejoint automatiquement les réunions de
l'équipe (sauf sales) et fournit vidéo + transcript. On récupère le média, on le stocke
chez nous (Supabase Storage) et on garde le transcript diarisé (natif Recall).

## 1. Connexion des agendas
Pour l'auto-planification, il faut connecter les agendas Google de l'équipe à Recall
(Calendar Integration V2) :
- **Par personne** : chaque membre autorise son Google Calendar (OAuth).
- **Toute la boîte** : via la **délégation domaine Google Workspace** (service account admin),
  Recall connecte tous les agendas sans action individuelle.

Une fois connectés, Recall émet des webhooks `calendar.sync_events` → notre endpoint
planifie/retire les bots selon les règles ci-dessous.

## 2. Règles de capture (anti-double-bot)
Une réunion est captée par **un seul** système :
- **Sales → Attio** (ils ont déjà leur notetaker). On les **exclut** de Recall via
  `RECALL_EXCLUDE` (emails ou domaines). Si un sales est invité, Recall s'abstient.
- **Tout le reste → Recall**, uniquement les réunions avec un **lien visio** (Meet/Zoom/Teams).

Logique dans [`shouldRecordEvent`](../src/lib/integrations/recall.ts) et
[`syncCalendar`](../src/lib/ingest/calendar.ts). Filet de sécurité : dédup DB (`calls.duplicate_of`).

## 3. Configuration Recall
1. Créer un compte Recall.ai, récupérer la clé → `RECALL_API_KEY`, et la région → `RECALL_REGION`.
2. Dashboard Recall → Webhooks : ajouter l'URL `https://<APP_URL>/api/recall/webhook`,
   récupérer le secret Svix → `RECALL_WEBHOOK_SECRET`.
3. Le bot demande la **transcription native** (`recallai_async`) — voir `RECORDING_CONFIG`.

## 4. Cycle de vie
```
calendar.sync_events → syncCalendar() → scheduleBotForEvent() (hors sales)
bot rejoint, enregistre, transcrit
bot.done → ingestRecallBot(): vidéo → Storage, transcript → call_segments
/api/process (cron) → résumé (Claude) + embeddings (Voyage)
```

## 5. Transcription
Native Recall par défaut (diarisation = vrais noms, moins chère). Notre module STT
([`transcription.ts`](../src/lib/ai/transcription.ts), Deepgram/Gladia/Whisper) sert de
**fallback** quand aucune transcription n'est fournie (ex. audio brut).

## 6. Rétention RGPD
- Bot **visible** dans la réunion (consentement implicite) — prévoir un bandeau d'info interne.
- `RETENTION_MEDIA_DAYS` : purge automatique des vidéos stockées au-delà de N jours
  (endpoint `/api/retention`, à mettre en cron). Les transcripts sont conservés par défaut.
- Stockage et localisation des données **sous notre contrôle** (Supabase), Recall n'est qu'un transit.

## 7. Crons (Coolify Scheduled Tasks)
```bash
# planification/ingestion sont push (webhooks) — ces crons couvrent le reste :
curl -fsS -H "Authorization: Bearer $SYNC_SECRET" -X POST https://<APP_URL>/api/process
curl -fsS -H "Authorization: Bearer $SYNC_SECRET" -X POST "https://<APP_URL>/api/sync?airtable=1"
curl -fsS -H "Authorization: Bearer $SYNC_SECRET" -X POST https://<APP_URL>/api/retention
```
