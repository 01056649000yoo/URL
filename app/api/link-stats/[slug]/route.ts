import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const admin = createAdminClient();
    const recentThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const today = new Date();
    const todayThresholdIso = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    ).toISOString();

    const { data: link, error } = await admin
      .from("short_links")
      .select("id, slug, click_count, is_active, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !link) {
      return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    }

    const [recentVisitsResult, todayVisitsResult] = await Promise.all([
      admin
        .from("short_link_visits")
        .select("visitor_hash")
        .eq("link_id", link.id)
        .gte("visited_at", recentThresholdIso),
      admin
        .from("short_link_visits")
        .select("visitor_hash")
        .eq("link_id", link.id)
        .gte("visited_at", todayThresholdIso),
    ]);

    const recentVisitors = new Set(
      (recentVisitsResult.data ?? [])
        .map((visit) => visit.visitor_hash)
        .filter((value): value is string => Boolean(value)),
    ).size;

    const todayVisitors = new Set(
      (todayVisitsResult.data ?? [])
        .map((visit) => visit.visitor_hash)
        .filter((value): value is string => Boolean(value)),
    ).size;

    return NextResponse.json({
      slug: link.slug,
      clickCount: link.click_count,
      recentVisitors,
      todayVisitors,
      isActive: link.is_active,
      expiresAt: link.expires_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
