import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

type DocType = "소명서" | "답변서" | "이의신청서" | "진술서";
type Stage = "collect" | "ready";

type ChatHistory = { role: "user" | "assistant"; content: string };
type CollectedData = {
  occurredAt?: string;
  department?: string;
  facts?: string;
  position?: string;
};

const FIELD_LABELS: Record<keyof CollectedData, string> = {
  occurredAt: "발생 일시",
  department: "요청 기관/부서",
  facts: "핵심 사실관계",
  position: "본인 입장/해명",
};

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .optional()
    .default([]),
  docType: z.enum(["소명서", "답변서", "이의신청서", "진술서"]).nullish(),
});

function classifyDocType(input: string, hinted?: DocType): DocType | null {
  if (hinted) return hinted;
  if (/감사|징계|경고|소명/.test(input)) return "소명서";
  if (/민원|고충|답변|회신|이의/.test(input)) return "답변서";
  if (/처분|불이익|이의신청|재심/.test(input)) return "이의신청서";
  if (/조사|수사|진술|피의|참고인/.test(input)) return "진술서";
  return null;
}

function extractCollectedData(text: string): CollectedData {
  const compact = text.replace(/\s+/g, " ").trim();
  const out: CollectedData = {};

  const dateMatch =
    compact.match(/\d{4}년\s*\d{1,2}월(?:\s*\d{1,2}일)?/) ||
    compact.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/) ||
    compact.match(/\d{1,2}월\s*\d{1,2}일/) ||
    compact.match(/(어제|오늘|지난주|지난달|금일|최근|작년|올해|이번 달)/);
  if (dateMatch) out.occurredAt = dateMatch[0];

  const deptMatch = compact.match(
    /(감사실|감사부서|인사팀|인사부|징계위원회|감사위원회|수사기관|경찰서|검찰청|노동청|민원실|기관|부서)/
  );
  if (deptMatch) out.department = deptMatch[0];

  if (compact.length >= 12) out.facts = compact.slice(0, 260);
  if (/저는|저의|제 입장|해명|사유|불가피/.test(compact)) out.position = compact.slice(0, 260);

  return out;
}

function mergeCollected(base: CollectedData, extra: CollectedData): CollectedData {
  return {
    occurredAt: base.occurredAt || extra.occurredAt,
    department: base.department || extra.department,
    facts: base.facts || extra.facts,
    position: base.position || extra.position,
  };
}

function getMissingField(collected: CollectedData): keyof CollectedData | null {
  if (!collected.occurredAt) return "occurredAt";
  if (!collected.department) return "department";
  if (!collected.facts) return "facts";
  if (!collected.position) return "position";
  return null;
}

function fallbackQuestion(missing: keyof CollectedData | null, docType: DocType | null): string {
  if (!docType) {
    return "소명서, 답변서, 이의신청서, 진술서 중 어떤 문서가 필요한지 먼저 알려주실 수 있을까요?";
  }
  if (missing === "occurredAt") return "언제 발생한 일인지 먼저 알려주세요.";
  if (missing === "department") return "어떤 기관이나 부서에서 요청했는지 알려주세요.";
  if (missing === "facts") return "핵심 사실관계를 한두 문장으로 설명해 주세요.";
  if (missing === "position") return "본인 입장이나 해명을 어떻게 정리하고 싶은지 알려주세요.";
  return "작성 준비가 됐습니다. 문서를 생성할까요?";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: true, stage: "collect", docType: null, collectedData: {}, reply: "" },
      { status: 200 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: true, stage: "collect", docType: null, collectedData: {}, reply: "" },
      { status: 200 }
    );
  }

  const { message, history, docType } = parsed.data;

  // 사용자 메시지만으로 분류/추출 (AI 응답 포함 시 키워드 오염 방지)
  const userTexts = [
    ...history.filter((h: ChatHistory) => h.role === "user").map((h: ChatHistory) => h.content),
    message,
  ];
  const mergedUserText = userTexts.join(" ");

  const resolvedType = classifyDocType(mergedUserText, docType ?? undefined);
  const collected = mergeCollected({}, extractCollectedData(mergedUserText));
  const missing = resolvedType ? getMissingField(collected) : null;
  const stage: Stage = resolvedType && !missing ? "ready" : "collect";

  // docType이 확인되지 않은 경우 첫 턴에만 fallback 즉시 반환 (2번째 턴부터는 Gemini 호출)
  if (!resolvedType && history.length === 0) {
    return NextResponse.json({
      ok: true,
      stage,
      docType: null,
      collectedData: collected,
      reply: fallbackQuestion(null, null),
    });
  }

  const system = [
    "당신은 공직자·직장인의 소명서·답변서·이의신청서·진술서 작성을 돕는 AI입니다.",
    "이전 대화 맥락을 반드시 확인하고, 사용자가 이미 언급한 내용은 절대 다시 묻지 마세요.",
    "반드시 한 문장으로만 답하세요. 추가 설명·마크다운·이모지 금지.",
  ].join("\n");

  const missingLabel = missing ? FIELD_LABELS[missing] : null;
  const instruction =
    stage === "ready"
      ? "정확히 이 문장만 출력하세요: 작성 준비가 됐습니다. 문서를 생성할까요?"
      : missingLabel
        ? `위 대화 기록을 확인하세요. '${missingLabel}'에 해당하는 내용을 사용자가 이미 말했으면 다음 항목으로 자연스럽게 이어가고, 아직 말하지 않았으면 한 문장으로 물어보세요.`
        : "위 대화 기록을 참고해 아직 파악되지 않은 정보를 자연스럽게 한 문장으로 물어보세요.";

  const contextMsg = [
    `[현재 상태] 문서유형: ${resolvedType} | 단계: ${stage}`,
    `[수집 현황] ${JSON.stringify(collected)}`,
    `[지시] ${instruction}`,
    `[사용자 입력] ${message}`,
  ].join("\n");

  // 실제 대화 history를 Gemini에 전달해 자연스러운 이어쓰기 보장
  const geminiMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user" as const, content: contextMsg },
  ];

  try {
    const reply =
      (await callText({
        system,
        messages: geminiMessages,
        temperature: 0.15,
        maxOutputTokens: 120,
      })) ?? "";

    return NextResponse.json({
      ok: true,
      stage,
      docType: resolvedType,
      collectedData: collected,
      reply: reply.trim() || fallbackQuestion(missing, resolvedType),
    });
  } catch {
    return NextResponse.json({
      ok: true,
      stage,
      docType: resolvedType,
      collectedData: collected,
      reply: fallbackQuestion(missing, resolvedType),
    });
  }
}
