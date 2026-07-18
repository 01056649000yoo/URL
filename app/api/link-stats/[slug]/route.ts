import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDeviceId } from "@/lib/device-cookie";
import { decodeSlugParam } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceCanManageLink } from "@/lib/link-ownership";

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
    const { deviceId } = getOrCreateDeviceId(request);
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

    if (error || !link) {
      return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!(await deviceCanManageLink(admin, deviceId, link.id))) {
      return NextResponse.json({ error: "이 링크의 통계를 볼 권한이 없습니다." }, { status: 403 });
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
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
