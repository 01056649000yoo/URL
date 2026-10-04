import { NextResponse, type NextRequest } from "next/server";

// 다른 사이트가 방문자 브라우저를 빌려 몰래 보내는 요청(CSRF)을 막는다(2026-10-04 보안 점검).
// 기기 쿠키는 아지트 안 iframe 에서도 쓰려고 SameSite=None 이라, 다른 사이트에서 보낸 요청에도 실린다.
// 실제로 text/plain 으로 보낸 JSON 이 /api/my-links/extend 에서 처리되는 것을 확인했다.
// 그래서 /api 의 바꾸는 요청은 샘링크 자기 주소에서 온 것만 받는다. iframe 안의 샘링크 화면도 출처는 샘링크다.
// Origin 이 없는 서버 간 호출(만료 정리 cleanup·curl)은 Sec-Fetch-Site 가 cross-site 가 아니면 통과한다.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(request: NextRequest) {
  const origins = new Set<string>([request.nextUrl.origin]);
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // SITE_URL 형식이 잘못돼도 자기 주소 비교는 남는다.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
  }
  return origins;
}

export function isCrossSiteRequest(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return false;

  const origin = request.headers.get("origin");
  if (origin) return !allowedOrigins(request).has(origin);

  return request.headers.get("sec-fetch-site") === "cross-site";
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
