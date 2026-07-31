import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/supabase/server";
import { toAccessUser, visibleCallIdsFor } from "@/lib/access";
import { searchChunks } from "@/lib/ai/search";
import { answerQuestion, type AnswerSource } from "@/lib/ai/anthropic";
import type { Citation, ChatScope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  question: string;
  scope: ChatScope;
  callId?: string;
  clientId?: string;
  projectId?: string;
  threadId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as ChatBody;
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const db = supabaseAdmin();

  // Restrict retrieval to calls this user is allowed to see (everyone except
  // malik@peechstudio.com is scoped to calls they participated in).
  const accessUser = toAccessUser(await currentUser());
  const visibleIds = await visibleCallIdsFor(accessUser);
  if (body.scope === "call" && visibleIds && body.callId && !visibleIds.has(body.callId)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 1. retrieve relevant chunks within scope
  // Over-fetch when we'll post-filter by visibility, so a restricted user
  // doesn't lose relevant hits just because higher-ranked chunks belonged to
  // calls they can't see (match_call_chunks has no per-user ACL filter).
  const rawMatches = await searchChunks({
    query: body.question,
    callId: body.scope === "call" ? body.callId : undefined,
    clientId: body.scope === "client" ? body.clientId : undefined,
    projectId: body.scope === "project" ? body.projectId : undefined,
    limit: visibleIds ? 60 : 12,
  });
  const matches = (visibleIds ? rawMatches.filter((m) => visibleIds.has(m.call_id)) : rawMatches).slice(0, 12);

  const sources: AnswerSource[] = matches.map((m, i) => ({
    index: i + 1,
    callId: m.call_id,
    chunkId: m.chunk_id,
    title: m.title,
    start: m.start_seconds,
    content: m.content,
  }));

  // 2. thread + history
  let threadId = body.threadId;
  if (!threadId) {
    const { data: t } = await db
      .from("chat_threads")
      .insert({
        scope: body.scope,
        call_id: body.callId ?? null,
        client_id: body.clientId ?? null,
        project_id: body.projectId ?? null,
        title: body.question.slice(0, 80),
      })
      .select("id")
      .single();
    threadId = t?.id;
  }
  const { data: histRows } = threadId
    ? await db
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", threadId)
        .order("id", { ascending: true })
        .limit(10)
    : { data: [] };
  const history = (histRows ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 3. answer
  const { answer, usedIndices } = await answerQuestion({
    question: body.question,
    sources,
    history,
  });

  const citations: Citation[] = sources
    .filter((s) => usedIndices.includes(s.index))
    .map((s) => ({ call_id: s.callId, chunk_id: s.chunkId, start_seconds: s.start, title: s.title }));

  // 4. persist
  if (threadId) {
    await db.from("chat_messages").insert([
      { thread_id: threadId, role: "user", content: body.question },
      { thread_id: threadId, role: "assistant", content: answer, citations },
    ]);
  }

  return NextResponse.json({ threadId, answer, citations });
}
