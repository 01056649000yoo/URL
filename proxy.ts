import { NextResponse, type NextRequest } from "next/server";

// 다른 사이트가 방문자 브라우저를 빌려 몰래 보내는 요청(CSRF)을 막는다(2026-10-04 보안 점검).
// 기기 쿠키는 아지트 안 iframe 에서도 쓰려고 SameSite=None 이라, 다른 사이트에서 보낸 요청에도 실린다.
// 실제로 text/plain 으로 보낸 JSON 이 /api/my-links/extend 에서 처리되는 것을 확인했다.
// 그래서 /api 의 바꾸는 요청은 샘링크 자기 주소에서 온 것만 받는다. iframe 안의 샘링크 화면도 출처는 샘링크다.
// Origin·Sec-Fetch-Site 가 없는 서버 간 호출(만료 정리 cleanup·curl)은 통과한다.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// 샘링크는 https·http, www 유무로 모두 열린다(2026-10-10 확인). 주소 모양이 달라도 같은 샘링크로 본다.
function siteHost(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function allowedHosts(request: NextRequest) {
  const hosts = new Set<string>([siteHost(request.nextUrl.hostname)]);
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost) hosts.add(siteHost(forwardedHost.split(":")[0] ?? ""));
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    try {
      hosts.add(siteHost(new URL(configured).hostname));
    } catch {
      // SITE_URL 형식이 잘못돼도 자기 주소 비교는 남는다.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost");
  }
  return hosts;
}

export function isCrossSiteRequest(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return false;

  // 요즘 브라우저는 Sec-Fetch-Site 를 스스로 붙이고 웹페이지가 바꿀 수 없다 — 이것이 있으면 이것만 본다.
  // (www.샘링크.kr·http 로 들어온 화면, Origin 이 null 로 찍히는 경우도 same-origin 으로 통과)
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "cross-site";

  // 옛 브라우저: Origin 주소의 호스트로 비교한다.
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return !allowedHosts(request).has(siteHost(new URL(origin).hostname));
    } catch {
      return true;
    }
  }
  return origin === "null";
}

export function proxy(request: NextRequest) {
  if (isCrossSiteRequest(request)) {
    return NextResponse.json({ error: "샘링크 화면에서 보낸 요청만 처리할 수 있습니다." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
