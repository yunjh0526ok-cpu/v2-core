import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  docType: z.enum(["소명서", "답변서", "이의신청서", "진술서"]),
  collectedData: z
    .object({
      occurredAt: z.string().optional(),
      department: z.string().optional(),
      facts: z.string().optional(),
      position: z.string().optional(),
      recipient: z.string().optional(),
      drafter: z.string().optional(),
      lawBasis: z.string().optional(),
      issue: z.string().optional(),
    })
    .optional()
    .default({}),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION" }, { status: 400 });
  }

  const { docType, collectedData } = parsed.data;
  const createdAt = new Date().toISOString();
  const dateOnly = createdAt.slice(0, 10);

  const recipient = collectedData.recipient || collectedData.department || "해당 기관";
  const drafter = collectedData.drafter || "작성자/직위";
  const issue = collectedData.issue || "해당 사안";
  const occurredAt = collectedData.occurredAt || "발생 일시 미기재";
  const facts = collectedData.facts || "핵심 사실관계 미기재";
  const position = collectedData.position || "본인 입장/해명 미기재";
  const lawBasis = collectedData.lawBasis || "관련 법령 근거는 사실관계 확인 후 보강 필요";

  const title = `${issue} 관련 ${docType}`;
  const content = [
    `수 신: ${recipient}`,
    `제 목: ${title}`,
    `작성인: ${drafter}`,
    `작성일: ${dateOnly}`,
    "",
    "1. 사안 개요",
    `- 발생 일시: ${occurredAt}`,
    `- 사안 요약: ${issue}`,
    "",
    "2. 내용",
    "가. 사실관계",
    facts,
    "",
    "나. 본인 입장",
    position,
    "",
    "다. 관련 법령 근거",
    lawBasis,
    "",
    "3. 결론",
    "위 사실관계와 근거를 바탕으로 본 문서의 취지에 맞는 판단을 요청드립니다.",
  ].join("\n");

  return NextResponse.json({
    title,
    content,
    docType,
    createdAt,
  });
}
