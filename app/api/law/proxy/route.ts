/**
 * /api/law/proxy — law.go.kr Edge Function 프록시
 *
 * 문제: Vercel 서버리스 함수 IP는 law.go.kr에 차단됨
 * 해결: Edge Function(Cloudflare 엣지 노드 IP)을 거쳐 law.go.kr 호출
 *
 * Edge Function은 AWS Lambda 와 다른 IP 대역(Cloudflare Workers)에서 실행되어
 * 서버리스 함수 차단과 무관하게 law.go.kr 에 접근 가능.
 *
 * 지원 파라미터:
 *   target  law | prec
 *   query   검색어 (법령명 또는 키워드)
 *   display 결과 수 (기본 10)
 *   type    XML (기본)
 *   ID      법령ID (조문 조회 시)
 *   MST     법령MST (조문 조회 시, ID보다 우선)
 */

export const runtime = "edge";

const LAW_BASE = "https://www.law.go.kr/DRF";

const UPSTREAM_HEADERS: HeadersInit = {
  Accept: "application/xml, text/xml, */*",
  Referer: "https://www.law.go.kr",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const apiKey = process.env.LAW_API_KEY ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LAW_API_KEY 미설정" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const target  = searchParams.get("target")  ?? "law";
  const type    = searchParams.get("type")    ?? "XML";
  const query   = searchParams.get("query")   ?? "";
  const display = searchParams.get("display") ?? "10";
  const MST     = searchParams.get("MST");
  const ID      = searchParams.get("ID");

  let lawUrl: string;

  if (MST || ID) {
    // 조문 조회 (lawService.do)
    const idParam = MST
      ? `MST=${encodeURIComponent(MST)}`
      : `ID=${encodeURIComponent(ID!)}`;
    lawUrl =
      `${LAW_BASE}/lawService.do` +
      `?OC=${encodeURIComponent(apiKey)}` +
      `&target=${target}` +
      `&type=${type}` +
      `&${idParam}`;
  } else {
    // 검색 (lawSearch.do)
    lawUrl =
      `${LAW_BASE}/lawSearch.do` +
      `?OC=${encodeURIComponent(apiKey)}` +
      `&target=${target}` +
      `&type=${type}` +
      `&query=${encodeURIComponent(query)}` +
      `&display=${display}`;
  }

  try {
    const upstream = await fetch(lawUrl, {
      headers: UPSTREAM_HEADERS,
      // Edge Function 에서는 next.revalidate 미지원 → 직접 Cache-Control
    });

    const body = await upstream.text();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // 엣지 캐시 1시간, stale 24시간 허용
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("[law/proxy] upstream fetch failed:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
