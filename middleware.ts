/**
 *  middleware.ts — Next.js Edge Middleware
 *  ─────────────────────────────────────────────────────────────────────
 *   보호 경로:
 *     /admin, /admin/*            (관리자 대시보드)
 *     /stories/admin              (스토리 입력 폼)
 *     /api/stories  (POST)        (스토리 저장 API)
 *     /api/admin/*                (관리자 전용 API)
 *   통과 경로:
 *     /admin/login, /api/admin/login
 */

import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth";

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/stories/admin",
    "/stories/admin/:path*",
    "/api/stories",
    "/api/stories/:path*",
    "/api/admin/:path*",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 로그인 페이지/로그인 API 는 통과
  if (
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout"
  ) {
    return NextResponse.next();
  }

  // /api/stories 는 POST(쓰기) 만 보호, GET(리스트 조회)은 공개
  if (pathname === "/api/stories" && req.method === "GET") {
    return NextResponse.next();
  }
  // /api/stories/{slug} 같은 개별 조회(GET)는 공개. /api/stories/ai-dramatize 등 서브경로의 POST 는 보호.
  if (
    pathname.startsWith("/api/stories/") &&
    req.method === "GET" &&
    pathname !== "/api/stories/ai-dramatize"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = await verifySessionToken(token);
  if (ok) return NextResponse.next();

  // API 는 401 JSON, 페이지는 login 으로 리다이렉트
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "관리자 로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}
