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
    const { data: deleted } = await admin
      .from("short_links")
      .delete()
      .eq("id", data.id)
      .select("id");
    return NextResponse.json({ error: "링크가 만료되었습니다." }, { status: 404 });
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
