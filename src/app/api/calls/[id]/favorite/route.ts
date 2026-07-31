import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.is_favorite !== "boolean") {
    return NextResponse.json({ error: "is_favorite (boolean) required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("calls")
    .update({ is_favorite: body.is_favorite })
    .eq("id", id)
    .select("is_favorite")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
