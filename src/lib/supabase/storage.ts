import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/**
 * Supabase Storage helpers for call media (private bucket `SUPABASE_MEDIA_BUCKET`).
 *
 * NOTE: Recall media URLs expire, so we download+store soon after `bot.done`.
 * Large files: this buffers the whole file in memory. Fine for typical meeting
 * recordings; move to a streamed/background job if you hit very large files.
 */

const bucket = () => env.supabase.mediaBucket;

/** Download a remote file (e.g. Recall media URL) and store it in our bucket. */
export async function uploadFromUrl(
  path: string,
  sourceUrl: string,
  contentType?: string
): Promise<string> {
  const res = await fetch(sourceUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${path}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const { error } = await supabaseAdmin()
    .storage.from(bucket())
    .upload(path, buf, {
      contentType: contentType ?? res.headers.get("content-type") ?? "application/octet-stream",
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  return path;
}

/** Create a time-limited signed URL to play/download a stored file. */
export async function signedUrl(path: string, expiresInSeconds = 60 * 60): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket())
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
