import "server-only";
import { google, type drive_v3 } from "googleapis";
import { env } from "@/lib/env";

/**
 * Google Drive client for Meet transcripts (Google Docs) and recordings (mp4).
 * Uses a service account with domain-wide delegation, impersonating a
 * workspace user (see docs/SETUP.md).
 */

const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const DOC_MIME = "application/vnd.google-apps.document";

let _drive: drive_v3.Drive | null = null;

function driveClient(): drive_v3.Drive {
  if (_drive) return _drive;
  const b64 = env.google.serviceAccountJsonBase64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not set");
  const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
    client_email: string;
    private_key: string;
  };
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
    subject: env.google.impersonateSubject || undefined,
  });
  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

export interface DriveTranscriptFile {
  id: string;
  title: string;
  parentId: string | null;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string | null;
}

/**
 * List Meet transcript Docs. Meet names transcripts "<title> - <date> - Transcript".
 * Restrict to the Meet Recordings folder when GOOGLE_MEET_FOLDER_ID is set.
 */
export async function listMeetTranscripts(opts: { modifiedSinceIso?: string } = {}): Promise<
  DriveTranscriptFile[]
> {
  const drive = driveClient();
  const clauses = [
    `mimeType = '${DOC_MIME}'`,
    "name contains 'Transcript'",
    "trashed = false",
  ];
  if (env.google.meetFolderId) clauses.push(`'${env.google.meetFolderId}' in parents`);
  if (opts.modifiedSinceIso) clauses.push(`modifiedTime > '${opts.modifiedSinceIso}'`);
  const q = clauses.join(" and ");

  const out: DriveTranscriptFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, parents, createdTime, modifiedTime, webViewLink)",
      pageSize: 100,
      orderBy: "createdTime desc",
      pageToken,
      corpora: "allDrives",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      out.push({
        id: f.id!,
        title: f.name ?? "",
        parentId: f.parents?.[0] ?? null,
        createdTime: f.createdTime ?? "",
        modifiedTime: f.modifiedTime ?? "",
        webViewLink: f.webViewLink ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Export a Google Doc transcript as plain text. */
export async function getDocPlainText(fileId: string): Promise<string> {
  const drive = driveClient();
  const res = await drive.files.export(
    { fileId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
}

/**
 * Best-effort: find the recording mp4 that belongs to a transcript, by looking
 * in the same folder for a video file whose name shares the meeting title.
 */
export async function findRecordingVideo(
  parentId: string | null,
  meetingTitlePrefix: string
): Promise<{ id: string; webViewLink: string | null } | null> {
  const drive = driveClient();
  const clauses = ["mimeType contains 'video/'", "trashed = false"];
  if (parentId) clauses.push(`'${parentId}' in parents`);
  const res = await drive.files.list({
    q: clauses.join(" and "),
    fields: "files(id, name, webViewLink)",
    pageSize: 100,
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const prefix = norm(meetingTitlePrefix).slice(0, 30);
  const match = (res.data.files ?? []).find((f) => norm(f.name ?? "").startsWith(prefix.slice(0, 20)));
  return match ? { id: match.id!, webViewLink: match.webViewLink ?? null } : null;
}
