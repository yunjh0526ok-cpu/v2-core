import { NextResponse } from "next/server";

/**
 *  GET /api/billing/activate
 *  ─────────────────────────
 *   결제 성공 콜백. 실제 운영에서는 Stripe/PortOne 서명 검증을 거친 뒤
 *   `ethics_premium=active` 쿠키를 심어 Intelligence Hub 잠금을 해제합니다.
 *
 *   현재 스캐폴드는 쿼리 파라미터만 검사해 쿠키를 세팅합니다 (QA 목적).
 *   - ?demo=1              → 데모 결제 통과 시나리오
 *   - ?session_id=<id>     → Stripe Checkout 세션 검증 (TODO: SDK)
 *   - ?imp_uid=<id>        → PortOne 주문 검증 (TODO: REST)
 */

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const demo = url.searchParams.get("demo") === "1";
  const sessionId = url.searchParams.get("session_id");
  const impUid = url.searchParams.get("imp_uid");

  // 실제 연동 포인트: 여기서 provider 별 검증 수행 필요
  // if (sessionId) { const ok = await verifyStripeSession(sessionId); if (!ok) return ...; }
  // if (impUid)    { const ok = await verifyPortOneOrder(impUid);    if (!ok) return ...; }

  if (!demo && !sessionId && !impUid) {
    return NextResponse.json(
      { ok: false, error: "MISSING_VERIFICATION_TOKEN" },
      { status: 400 }
    );
  }

  const res = NextResponse.redirect(new URL("/intelligence-hub?activated=1", url));
  // 30일짜리 쿠키 (subscription renew 주기에 맞춰 갱신)
  res.cookies.set("ethics_premium", "active", {
    httpOnly: false, // 클라이언트 PremiumGate 가 읽어야 함
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
