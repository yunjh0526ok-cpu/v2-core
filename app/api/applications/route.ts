import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const ApplicationSchema = z.object({
  mode: z.enum(["lecture", "partnership"]),
  institutionName: z.string().min(1, "기관명을 입력해주세요"),
  contactName: z.string().min(1, "담당자 이름을 입력해주세요"),
  contactEmail: z.string().email("이메일 형식이 올바르지 않습니다"),
  orgScale: z.string().optional().default(""),
  participants: z.string().optional().default(""),
  preferredDate: z.string().optional().default(""),
  preferredTimeStart: z.string().optional().default(""),
  preferredTimeEnd: z.string().optional().default(""),
  location: z.string().optional().default(""),
  selectedRisks: z.array(z.string()).default([]),
  aiParticipation: z.enum(["ai-interactive", "lecture-focused", ""]).optional().default(""),
  goal: z.string().optional().default(""),
  partnershipPurposes: z.array(z.string()).default([]),
  timeline: z.string().optional().default(""),
  riskScore: z.number().int().min(0).max(100).default(0),
  priorityRiskId: z.string().optional().nullable(),
});

/** Airtable 레코드 전송 (AIRTABLE_* 환경 변수가 있을 때만 실행) */
async function pushToAirtable(d: z.infer<typeof ApplicationSchema>) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME ?? "Applications";

  if (!apiKey || !baseId) return; // 환경 변수 미설정 시 스킵

  const fields: Record<string, string | number | string[]> = {
    "신청유형": d.mode === "lecture" ? "강의/컨설팅" : "사업 협력/파트너십",
    "기관명": d.institutionName,
    "담당자": d.contactName,
    "이메일": d.contactEmail,
    "기관규모": d.orgScale || "",
    "참여인원": d.participants || "",
    "희망일자": d.preferredDate || "",
    "희망시간": d.preferredTimeStart && d.preferredTimeEnd
      ? `${d.preferredTimeStart} ~ ${d.preferredTimeEnd}`
      : d.preferredTimeStart || "",
    "장소": d.location || "",
    "AI참여형여부": d.aiParticipation === "ai-interactive"
      ? "AI 참여형 (Dialogue QR)"
      : d.aiParticipation === "lecture-focused"
        ? "강의 중심형"
        : "",
    "선택리스크": d.selectedRisks.join(", "),
    "종합리스크지수": d.riskScore,
    "최우선리스크ID": d.priorityRiskId ?? "",
    "추가요청사항": d.goal || "",
    "협업목적": d.partnershipPurposes.join(", "),
    "추진시점": d.timeline || "",
  };

  await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = ApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const d = parsed.data;

  const created = await prisma.application.create({
    data: {
      mode: d.mode,
      institutionName: d.institutionName,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
      orgScale: d.orgScale || null,
      participants: d.participants || null,
      preferredDate: d.preferredDate || null,
      location: d.location || null,
      selectedRisks: JSON.stringify(d.selectedRisks),
      goal: d.goal || null,
      partnershipPurposes: JSON.stringify(d.partnershipPurposes),
      timeline: d.timeline || null,
      riskScore: d.riskScore,
      priorityRiskId: d.priorityRiskId ?? null,
    },
  });

  // Airtable 전송 (실패해도 응답에 영향 없음)
  pushToAirtable(d).catch((e) =>
    console.warn("[Airtable] push failed:", (e as Error).message)
  );

  return NextResponse.json({
    ok: true,
    data: {
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
    },
  });
}

export async function GET() {
  const items = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({
    ok: true,
    data: items.map((a) => ({
      ...a,
      selectedRisks: safeParseArray(a.selectedRisks),
      partnershipPurposes: safeParseArray(a.partnershipPurposes),
    })),
  });
}

function safeParseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
