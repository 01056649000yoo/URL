import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeSlugParam } from "@/lib/slug";
import {
  getOrCreateVisitorIdentity,
  getRequestReferrer,
  getVisitorCookieMaxAge,
  getVisitorCookieName,
} from "@/lib/visitor";
import { useSecureCookies } from "@/lib/site-url";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { slug: rawSlug } = await context.params;
  const slug = decodeSlugParam(rawSlug);
  const admin = createAdminClient();
  const visitor = getOrCreateVisitorIdentity(request);

  const { data, error } = await admin
    .from("short_links")
    .select("id, destination, is_active, expires_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= Date.now();

  if (!data.is_active || isExpired) {
    // 만료 즉시 삭제하지 않습니다 — 30일 유예 동안 소유자가 복구할 수 있고,
    // 유예가 지난 링크는 시간당 청소 작업이 정리합니다.
    // 상대 경로 Location이라 어떤 호스트·프로토콜로 접속했든 올바르게 이동합니다.
    return new NextResponse(null, { status: 302, headers: { Location: "/expired" } });
  }

  await Promise.allSettled([
    admin.rpc("increment_click_count", {
      link_id: data.id,
    }),
    admin.rpc("record_short_link_visit", {
      p_link_id: data.id,
      p_visitor_hash: visitor.visitorHash,
      p_referrer: getRequestReferrer(request),
    }),
  ]);

  const response = NextResponse.redirect(data.destination, { status: 307 });

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
}
