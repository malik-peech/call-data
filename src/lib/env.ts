/**
 * Central environment access. Server-only values throw if read in the browser.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(value: string | undefined, fallback = ""): string {
  return value ?? fallback;
}

const isServer = typeof window === "undefined";

export const env = {
  isServer,

  app: {
    url: optional(process.env.APP_URL, "http://localhost:5000"),
    allowedEmailDomains: optional(process.env.ALLOWED_EMAIL_DOMAINS, "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    syncSecret: optional(process.env.SYNC_SECRET),
    retentionMediaDays: Number(optional(process.env.RETENTION_MEDIA_DAYS, "0")) || 0,
  },

  supabase: {
    url: optional(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: optional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    mediaBucket: optional(process.env.SUPABASE_MEDIA_BUCKET, "call-media"),
    // server-only
    get serviceRoleKey() {
      if (!isServer) throw new Error("serviceRoleKey is server-only");
      return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
    },
  },

  recall: {
    region: optional(process.env.RECALL_REGION, "us-east-1"),
    webhookSecret: optional(process.env.RECALL_WEBHOOK_SECRET),
    // emails/domains excluded from auto-recording (sales → Attio)
    exclude: optional(process.env.RECALL_EXCLUDE, "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    get apiKey() {
      return required("RECALL_API_KEY", process.env.RECALL_API_KEY);
    },
  },

  attio: {
    get apiKey() {
      return required("ATTIO_API_KEY", process.env.ATTIO_API_KEY);
    },
  },

  google: {
    serviceAccountJsonBase64: optional(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64),
    impersonateSubject: optional(process.env.GOOGLE_IMPERSONATE_SUBJECT),
    meetFolderId: optional(process.env.GOOGLE_MEET_FOLDER_ID),
  },

  airtable: {
    baseId: optional(process.env.AIRTABLE_BASE_ID, "appYFl5MvR7VeL0uB"),
    projectsTable: optional(process.env.AIRTABLE_PROJECTS_TABLE, "tbl0Pij0JqZFD9Ijr"),
    projectsView: optional(process.env.AIRTABLE_PROJECTS_VIEW, "viwsjtvRuPucNQXXR"),
    get apiKey() {
      return required("AIRTABLE_API_KEY", process.env.AIRTABLE_API_KEY);
    },
  },

  ai: {
    get anthropicKey() {
      return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
    },
    anthropicModel: optional(process.env.ANTHROPIC_MODEL, "claude-sonnet-4-5"),
    get voyageKey() {
      return required("VOYAGE_API_KEY", process.env.VOYAGE_API_KEY);
    },
    voyageModel: optional(process.env.VOYAGE_MODEL, "voyage-3"),
  },

  transcription: {
    // Fallback STT only — sources normally provide their own transcript.
    provider: optional(process.env.TRANSCRIPTION_PROVIDER, "gladia") as "gladia" | "whisper",
    whisperUrl: optional(process.env.WHISPER_URL),
    get gladiaKey() {
      return required("GLADIA_API_KEY", process.env.GLADIA_API_KEY);
    },
  },
};
