/**
 *  POST /api/dialogue/feedback
 *    — 토론 현장 의견/투표 기록 → DialogueFeedback DB
 *    — Intelligence Hub 에서 자동 집계됨.
 *
 *  GET /api/dialogue/feedback?sessionId=xxx
 *    — 특정 세션 피드백 조회 (강사/운영자용)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { analyzeDialogueComment } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostSchema = z.object({
  sessionId: z.string().min(1).max(80),
  kind: z.enum(["vote", "comment", "sentiment"]),
  text: z.string().max(500).optional(),
  optionId: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const p = PostSchema.safeParse(body);
  if (!p.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: p.error.issues },
      { status: 400 }
    );
  }

  let sentiment: string | null = null;
  let topic: string | null = null;

  // 댓글은 Gemini(또는 규칙) 로 감정/주제 자동 분석
  if (p.data.kind === "comment" && p.data.text) {
    const a = await analyzeDialogueComment(p.data.text);
    sentiment = a.sentiment;
    topic = a.topic;
  }

  const created = await prisma.dialogueFeedback.create({
    data: {
      sessionId: p.data.sessionId,
      kind: p.data.kind,
      text: p.data.text ?? null,
      optionId: p.data.optionId ?? null,
      sentiment,
      topic,
    },
  });

  return NextResponse.json({ ok: true, data: created });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_SESSION_ID" },
      { status: 400 }
    );
  }
  const items = await prisma.dialogueFeedback.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ ok: true, items });
}
