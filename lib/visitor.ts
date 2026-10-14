import { createHash, randomUUID } from "node:crypto";

const VISITOR_COOKIE_NAME = "samlink_visitor";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

function getVisitorSalt() {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-rate-limit-v1";
  return salt;
}

function parseCookies(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  const pairs = raw
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const [name, ...rest] = value.split("=");
      return [name, rest.join("=")] as const;
    });

  return new Map(pairs);
}

export function getVisitorHashFromId(visitorId: string) {
  return createHash("sha256").update(`${visitorId}|${getVisitorSalt()}`).digest("hex");
}

export function getOrCreateVisitorIdentity(request: Request) {
  const cookies = parseCookies(request);
  const existing = cookies.get(VISITOR_COOKIE_NAME)?.trim();
  const visitorId = existing || randomUUID();

  return {
    visitorId,
    visitorHash: getVisitorHashFromId(visitorId),
    needsCookie: !existing,
  };
}

export function getVisitorCookieName() {
  return VISITOR_COOKIE_NAME;
}

export function getVisitorCookieMaxAge() {
  return VISITOR_COOKIE_MAX_AGE;
}

// 2026-10-14 점검: Referer 전체(경로·쿼리)에는 학생 식별자·토큰이 들어 있을 수 있고 화면에서 쓰지도 않는다. 출처(주소의 앞부분)만 남긴다.
export function getRequestReferrer(request: Request) {
  const raw = request.headers.get("referer")?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.origin.slice(0, 200);
  } catch {
    return null;
  }
}
