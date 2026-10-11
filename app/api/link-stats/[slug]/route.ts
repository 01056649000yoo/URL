import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/account-session";
import { decodeSlugParam } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceCanManageLink } from "@/lib/link-ownership";
import { serverError } from "@/lib/api-error";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

type LinkVisitStats = {
  link_id: number;
  recent_visitors: number;
  today_visitors: number;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug: rawSlug } = await context.params;
    const slug = decodeSlugParam(rawSlug);
    const viewer = getViewer(request);
    const admin = createAdminClient();
    const recentThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const today = new Date();
    const todayThresholdIso = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    ).toISOString();

    const { data: link, error } = await admin
      .from("short_links")
      .select("id, slug, click_count, is_active, expires_at, created_by")
      .eq("slug", slug)
      .maybeSingle();

    // 없는 링크와 "내가 볼 수 없는 링크"를 같은 404 로 답한다 — 403/404 가 다르면 쿠키 없는 외부인이 이 주소로
    // 살아 있는 짧은 주소를 제한 없이 찾아낼 수 있었다(2026-10-11 보안 점검, 200번 연달아 구분됨).
    if (error || !link || !(await deviceCanManageLink(admin, viewer, link))) {
      return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: visitStatsData } = await admin.rpc("get_link_visit_stats", {
      p_recent_after: recentThresholdIso,
      p_today_after: todayThresholdIso,
      p_link_id: link.id,
    });

    const visitStats = (
      Array.isArray(visitStatsData) ? visitStatsData[0] : visitStatsData
    ) as LinkVisitStats | null | undefined;

    return NextResponse.json({
      slug: link.slug,
      clickCount: link.click_count,
      recentVisitors: visitStats?.recent_visitors ?? 0,
      todayVisitors: visitStats?.today_visitors ?? 0,
      isActive: link.is_active,
      expiresAt: link.expires_at,
    });
  } catch (error) {
    return serverError(error, "link-stats/[slug]");
  }
}
