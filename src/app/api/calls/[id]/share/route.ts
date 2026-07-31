import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ShareBody {
  share_enabled?: boolean;
  regenerate?: boolean;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as ShareBody;

  const update: { share_enabled?: boolean; share_token?: string } = {};
  if (typeof body.share_enabled === "boolean") update.share_enabled = body.share_enabled;
  if (body.regenerate) update.share_token = crypto.randomUUID();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("calls")
    .update(update)
    .eq("id", id)
    .select("share_enabled, share_token")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
