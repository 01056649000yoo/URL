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

export function getRequestReferrer(request: Request) {
  return request.headers.get("referer")?.trim() || null;
}
