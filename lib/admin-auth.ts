/**
 *  lib/admin-auth.ts
 *  ─────────────────────────────────────────────────────────────────────
 *   간단한 HMAC 서명 쿠키 기반 관리자 인증 (Web Crypto 사용 — Edge/Node 양쪽 호환).
 *
 *   - ADMIN_PASSWORD 환경변수가 시크릿 역할.
 *   - 토큰 페이로드: { iat, exp } (base64url) + "." + HMAC-SHA256 서명
 *   - Middleware 에서도 검증 가능 (crypto.subtle)
 */

export const ADMIN_COOKIE = "ecx_admin_session";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8; // 8시간

export const ADMIN_COOKIE_MAX_AGE_SEC = Math.floor(DEFAULT_TTL_MS / 1000);

function getSecret(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s)
    throw new Error(
      "ADMIN_PASSWORD 가 설정되지 않았습니다. .env.local 에 값을 넣어주세요."
    );
  return s;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = getSecret();
  const enc = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    enc,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(data: string): Promise<string> {
  const key = await getKey();
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return toBase64Url(sigBuf);
}

/**
 *  패스워드 비교 — 상수 시간 (가능한 한).
 *  Web Crypto 환경에서도 안전하게 쓸 수 있도록 XOR accumulator 사용.
 */
export function verifyPassword(input: string): boolean {
  const expected = getSecret();
  const a = new TextEncoder().encode(input);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function issueSessionToken(
  ttlMs = DEFAULT_TTL_MS
): Promise<string> {
  const payload = { iat: Date.now(), exp: Date.now() + ttlMs };
  const data = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const sig = await sign(data);
  return `${data}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expected = await sign(data);
  if (expected !== sig) return false;
  try {
    const text = new TextDecoder().decode(fromBase64Url(data));
    const payload = JSON.parse(text) as { iat: number; exp: number };
    if (typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}
