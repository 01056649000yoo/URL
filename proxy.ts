import { NextResponse, type NextRequest } from "next/server";
import { isCrossSiteRequest, siteHost } from "@/lib/cross-site";

// 다른 사이트가 방문자 브라우저를 빌려 몰래 보내는 요청(CSRF)을 막는다(2026-10-04 보안 점검).
// 기기 쿠키는 아지트 안 iframe 에서도 쓰려고 SameSite=None 이라, 다른 사이트에서 보낸 요청에도 실린다.
// 실제로 text/plain 으로 보낸 JSON 이 /api/my-links/extend 에서 처리되는 것을 확인했다.
// 그래서 /api 의 바꾸는 요청은 샘링크 자기 주소에서 온 것만 받는다. iframe 안의 샘링크 화면도 출처는 샘링크다.
// Origin·Sec-Fetch-Site 가 없는 서버 간 호출(만료 정리 cleanup·curl)은 통과한다.

// 샘링크는 https·http, www 유무로 모두 열린다(2026-10-10 확인). 주소 모양이 달라도 같은 샘링크로 본다.
// 판정 규칙은 lib/cross-site.ts(검사: tests/cross-site.test.mjs).
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

export function isCrossSiteHttpRequest(request: NextRequest) {
  return isCrossSiteRequest({
    method: request.method,
    header: (name) => request.headers.get(name),
    allowedHosts: allowedHosts(request),
  });
}

export function proxy(request: NextRequest) {
  if (isCrossSiteHttpRequest(request)) {
    return NextResponse.json({ error: "샘링크 화면에서 보낸 요청만 처리할 수 있습니다." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
