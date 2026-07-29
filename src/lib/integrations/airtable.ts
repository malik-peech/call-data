import "server-only";
import { env } from "@/lib/env";

/**
 * Airtable — client / project-code reference for categorization.
 * Reads a pre-filtered view (active projects: "En cours" / "Finalisation").
 *
 * Field IDs are stable (names can change), so we request by field id.
 */
const F = {
  code: "fldMLeWX9bmpeIUbe", // project code (e.g. "1726")
  name: "fldCXc7SrrEMhTzew", // project title
  clientLink: "fld4HBc0UG3hUDhBK", // linked client → [recordId]
  clientName: "fldGhYcxGEidchBDF", // client name lookup → [string]
  status: "fldW4VN9PwfhJpNAs", // "En cours" | "Finalisation" | ...
} as const;

export interface AirtableProject {
  recordId: string;
  code: string | null;
  name: string;
  clientRecId: string | null;
  clientName: string | null;
  status: string | null;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export async function listActiveProjects(): Promise<AirtableProject[]> {
  const base = env.airtable.baseId;
  const table = env.airtable.projectsTable;
  const out: AirtableProject[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("view", env.airtable.projectsView);
    url.searchParams.set("returnFieldsByFieldId", "true");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields[]", F.code);
    url.searchParams.append("fields[]", F.name);
    url.searchParams.append("fields[]", F.clientLink);
    url.searchParams.append("fields[]", F.clientName);
    url.searchParams.append("fields[]", F.status);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.airtable.apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { records: AirtableRecord[]; offset?: string };

    for (const r of json.records) {
      const f = r.fields;
      const asStr = (v: unknown) => (typeof v === "string" ? v : null);
      const first = (v: unknown) => (Array.isArray(v) ? (v[0] as string) : null);
      const nameVal = asStr(f[F.name]) ?? asStr(f[F.clientName]) ?? "Projet";
      out.push({
        recordId: r.id,
        code: asStr(f[F.code]),
        name: nameVal,
        clientRecId: first(f[F.clientLink]),
        clientName: first(f[F.clientName]) ?? asStr(f[F.clientName]),
        status: asStr(f[F.status]),
      });
    }
    offset = json.offset;
  } while (offset);

  return out;
}
