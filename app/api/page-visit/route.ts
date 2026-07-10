import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOrCreateVisitorIdentity,
  getVisitorCookieMaxAge,
  getVisitorCookieName,
} from "@/lib/visitor";
import { getRateLimitKey } from "@/lib/rate-limit";
import { useSecureCookies } from "@/lib/site-url";

type Payload = {
  path?: string;
};

// 임의 path 삽입으로 테이블이 무한 증가하지 않도록 기록 대상 경로를 제한합니다.
const ALLOWED_PATHS = new Set(["/"]);

export async function POST(request: Request) {
  try {
    let path = "/";
    try {
      const body = (await request.json()) as Payload;
      if (typeof body?.path === "string") {
        path = body.path;
      }
    } catch {
      // body 없거나 파싱 실패해도 기본 "/" 로 진행
    }

    if (!ALLOWED_PATHS.has(path)) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const visitor = getOrCreateVisitorIdentity(request);
    const admin = createAdminClient();

    const { data: allowed, error: rateLimitError } = await admin.rpc(
      "consume_page_visit_rate_limit",
      { p_ip_hash: getRateLimitKey(request) },
    );

    if (rateLimitError || allowed === false) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const dayUtc = new Date().toISOString().slice(0, 10);

    await admin
      .from("page_visits")
      .upsert(
        {
          visitor_hash: visitor.visitorHash,
          path,
          day_utc: dayUtc,
        },
        { onConflict: "visitor_hash,path,day_utc", ignoreDuplicates: true },
      );

    const response = NextResponse.json({ ok: true });
    if (visitor.needsCookie) {
      response.cookies.set({
        name: getVisitorCookieName(),
        value: visitor.visitorId,
        httpOnly: true,
        sameSite: "lax",
        secure: useSecureCookies(),
        path: "/",
        maxAge: getVisitorCookieMaxAge(),
      });
    }
    return response;
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
