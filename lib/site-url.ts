import { domainToUnicode } from "node:url";

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  const hostname = domainToUnicode(parsed.hostname) || parsed.hostname;
  return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
}

// 실제 서비스 주소가 https일 때만 secure 쿠키를 사용해야
// 평문 HTTP(개발·프록시 없는 배포)에서 쿠키가 유실되지 않습니다.
export function useSecureCookies() {
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    return configured.startsWith("https://");
  }
  return process.env.NODE_ENV === "production";
}

export function getBaseUrl(request?: Request) {
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    return normalizeUrl(configured.replace(/\/$/, ""));
  }

  if (request) {
    return normalizeUrl(new URL(request.url).origin);
  }

  return "http://localhost:3000";
}
