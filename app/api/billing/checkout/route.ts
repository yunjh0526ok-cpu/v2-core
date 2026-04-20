import { NextResponse } from "next/server";
import { z } from "zod";

/**
 *  POST /api/billing/checkout
 *  ──────────────────────────
 *   프리미엄 결제 세션을 시작합니다.
 *   provider 에 따라 Stripe Checkout 또는 PortOne(아임포트) 결제 창으로 분기.
 *
 *   환경 변수 (선택):
 *     · STRIPE_SECRET_KEY         · STRIPE_PRICE_PREMIUM
 *     · PORTONE_STORE_ID          · PORTONE_CHANNEL_KEY
 *
 *   미설정 시 '데모 모드' 로 동작해 /api/billing/activate 콜백으로 바로 통과시킵니다.
 *   이 구조는 실제 결제 연동 전에도 프리뷰·QA 가 가능하게 하는 기본 스캐폴드입니다.
 */

export const runtime = "nodejs";

const BodySchema = z.object({
  provider: z.enum(["stripe", "portone", "demo"]).default("demo"),
  plan: z.enum(["institution-premium", "institution-enterprise"]).default("institution-premium"),
  buyerEmail: z.string().email().optional(),
  buyerName: z.string().max(80).optional(),
  institution: z.string().max(120).optional(),
});

type CheckoutResponse = {
  ok: true;
  provider: "stripe" | "portone" | "demo";
  /** 클라이언트에서 redirect 시킬 결제 URL 또는 데모 콜백 경로 */
  redirectUrl: string;
  /** 선택: 결제 세션 ID */
  sessionId?: string;
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const { provider, plan, buyerEmail, institution } = parsed.data;

  // ───────────────────────  Stripe  ───────────────────────
  if (provider === "stripe") {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    const priceId = process.env.STRIPE_PRICE_PREMIUM?.trim();
    if (!key || !priceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "STRIPE_NOT_CONFIGURED",
          hint: "`.env.local` 에 STRIPE_SECRET_KEY · STRIPE_PRICE_PREMIUM 설정 필요.",
        },
        { status: 503 }
      );
    }
    // 실제 Stripe SDK 연동 포인트 — 여기서는 구조만 남겨 둡니다.
    // const stripe = new Stripe(key);
    // const session = await stripe.checkout.sessions.create({
    //   mode: "subscription",
    //   line_items: [{ price: priceId, quantity: 1 }],
    //   success_url: `${origin}/api/billing/activate?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `${origin}/pricing?canceled=1`,
    //   customer_email: buyerEmail,
    //   metadata: { plan, institution: institution ?? "" },
    // });
    return NextResponse.json({
      ok: false,
      error: "STRIPE_STUB",
      hint: "Stripe SDK 연동 블록은 코드에 주석 처리된 상태입니다. 배포 시 활성화해 주세요.",
    } as const, { status: 501 });
  }

  // ───────────────────────  PortOne (아임포트)  ───────────────────────
  if (provider === "portone") {
    const storeId = process.env.PORTONE_STORE_ID?.trim();
    const channelKey = process.env.PORTONE_CHANNEL_KEY?.trim();
    if (!storeId || !channelKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "PORTONE_NOT_CONFIGURED",
          hint: "`.env.local` 에 PORTONE_STORE_ID · PORTONE_CHANNEL_KEY 설정 필요.",
        },
        { status: 503 }
      );
    }
    // 실제 PortOne V2 연동은 클라이언트 SDK 호출 + 서버 verify 두 단계로 구성됩니다.
    // 이 엔드포인트는 클라이언트에서 필요한 공개 파라미터만 돌려주고,
    // 결제 완료 후 /api/billing/activate 로 서버 검증을 수행합니다.
    return NextResponse.json({
      ok: true,
      provider: "portone",
      publicParams: {
        storeId,
        channelKey,
        orderName: plan === "institution-enterprise"
          ? "Ethics-Core AI Enterprise 월 구독"
          : "Ethics-Core AI Premium 월 구독",
        totalAmount: plan === "institution-enterprise" ? 1_900_000 : 490_000,
        currency: "KRW",
        buyerEmail,
        customData: { plan, institution: institution ?? "" },
      },
    });
  }

  // ───────────────────────  Demo (기본)  ───────────────────────
  const demo: CheckoutResponse = {
    ok: true,
    provider: "demo",
    sessionId: `demo_${Date.now().toString(36)}`,
    redirectUrl: `/api/billing/activate?demo=1&plan=${encodeURIComponent(plan)}`,
  };
  return NextResponse.json(demo);
}
