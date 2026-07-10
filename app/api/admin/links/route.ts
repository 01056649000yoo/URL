import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

type LinkVisitStats = {
  link_id: number;
  recent_visitors: number;
  today_visitors: number;
};

type GlobalVisitStats = {
  recent_visitors: number;
  today_visitors: number;
};

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);

    const admin = createAdminClient();
    const todayUtc = new Date().toISOString().slice(0, 10);
    const recentThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const todayThresholdIso = new Date(`${todayUtc}T00:00:00.000Z`).toISOString();
    const sevenDaysAgoUtc = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const thirtyDaysAgoUtc = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data, error } = await admin
      .from("short_links")
      .select("id, slug, destination, created_by, expires_at, click_count, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let deletedCount = 0;
    let createdCount = 0;
    let todayCreated = 0;
    let todayDeleted = 0;
    let weekCreated = 0;
    let monthCreated = 0;
    let recentVisitors = 0;
    let todayVisitors = 0;
    let todayPageVisitors = 0;
    let alerts = [] as Array<{
      alert_key: string;
      kind: string;
      title: string;
      message: string;
      created_at: string;
    }>;
    try {
      const [
        statsResult,
        dailyResult,
        alertsResult,
        linkVisitStatsResult,
        globalVisitStatsResult,
        periodDailyResult,
        todayPageVisitsResult,
      ] = await Promise.all([
        admin
          .from("short_link_stats")
          .select("total_created, total_deleted")
          .eq("key", "global")
          .maybeSingle(),
        admin
          .from("short_link_daily_stats")
          .select("created_count, deleted_count")
          .eq("day", todayUtc)
          .maybeSingle(),
        admin
          .from("short_link_notifications")
          .select("alert_key, kind, title, message, created_at")
          .order("created_at", { ascending: false })
          .limit(3),
        admin.rpc("get_link_visit_stats", {
          p_recent_after: recentThresholdIso,
          p_today_after: todayThresholdIso,
        }),
        admin.rpc("get_global_visit_stats", {
          p_recent_after: recentThresholdIso,
          p_today_after: todayThresholdIso,
        }),
        admin
          .from("short_link_daily_stats")
          .select("day, created_count")
          .gte("day", thirtyDaysAgoUtc),
        admin
          .from("page_visits")
          .select("visitor_hash", { count: "exact", head: true })
          .eq("day_utc", todayUtc)
          .eq("path", "/"),
      ]);

      const visitStatsByLink = new Map<number, LinkVisitStats>();
      for (const row of (linkVisitStatsResult.data ?? []) as LinkVisitStats[]) {
        if (typeof row.link_id !== "number") continue;
        visitStatsByLink.set(row.link_id, row);
      }

      const globalStats = (
        Array.isArray(globalVisitStatsResult.data)
          ? globalVisitStatsResult.data[0]
          : globalVisitStatsResult.data
      ) as GlobalVisitStats | null | undefined;

      createdCount = statsResult.data?.total_created ?? 0;
      deletedCount = statsResult.data?.total_deleted ?? 0;
      todayCreated = dailyResult.data?.created_count ?? 0;
      todayDeleted = dailyResult.data?.deleted_count ?? 0;
      recentVisitors = globalStats?.recent_visitors ?? 0;
      todayVisitors = globalStats?.today_visitors ?? 0;

      for (const row of periodDailyResult.data ?? []) {
        const count = typeof row.created_count === "number" ? row.created_count : 0;
        if (typeof row.day === "string" && row.day >= sevenDaysAgoUtc) {
          weekCreated += count;
        }
        monthCreated += count;
      }

      todayPageVisitors = todayPageVisitsResult.count ?? 0;
      alerts = alertsResult.data ?? [];

      const linksWithTraffic = (data ?? []).map((link) => ({
        ...link,
        recent_visitors_5m: visitStatsByLink.get(link.id)?.recent_visitors ?? 0,
        today_visitors: visitStatsByLink.get(link.id)?.today_visitors ?? 0,
      }));

      return NextResponse.json({
        links: linksWithTraffic,
        createdCount,
        todayCreated,
        todayDeleted,
        weekCreated,
        monthCreated,
        deletedCount,
        recentVisitors,
        todayVisitors,
        todayPageVisitors,
        alerts,
      });
    } catch {
      createdCount = 0;
      deletedCount = 0;
      todayCreated = 0;
      todayDeleted = 0;
      weekCreated = 0;
      monthCreated = 0;
      recentVisitors = 0;
      todayVisitors = 0;
      todayPageVisitors = 0;
      alerts = [];
    }

    return NextResponse.json({
      links: data ?? [],
      createdCount,
      todayCreated,
      todayDeleted,
      weekCreated,
      monthCreated,
      deletedCount,
      recentVisitors,
      todayVisitors,
      todayPageVisitors,
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
