import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);

    const admin = createAdminClient();
    const todayUtc = new Date().toISOString().slice(0, 10);
    const recentThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const todayThresholdIso = new Date(`${todayUtc}T00:00:00.000Z`).toISOString();
    const { data, error } = await admin
      .from("short_links")
      .select("id, slug, destination, created_by, expires_at, click_count, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let deletedCount = 0;
    let createdCount = 0;
    let todayCreated = 0;
    let todayDeleted = 0;
    let recentVisitors = 0;
    let todayVisitors = 0;
    let alerts = [] as Array<{
      alert_key: string;
      kind: string;
      title: string;
      message: string;
      created_at: string;
    }>;
    try {
      const [statsResult, dailyResult, alertsResult, recentVisitsResult, todayVisitsResult] =
        await Promise.all([
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
        admin
          .from("short_link_visits")
          .select("link_id, visitor_hash")
          .gte("visited_at", recentThresholdIso),
        admin
          .from("short_link_visits")
          .select("link_id, visitor_hash")
          .gte("visited_at", todayThresholdIso),
      ]);

      const recentVisitorsByLink = new Map<number, Set<string>>();
      const todayVisitorsByLink = new Map<number, Set<string>>();
      const globalRecentVisitors = new Set<string>();

      for (const visit of recentVisitsResult.data ?? []) {
        if (typeof visit.link_id !== "number" || !visit.visitor_hash) continue;
        globalRecentVisitors.add(visit.visitor_hash);
        const current = recentVisitorsByLink.get(visit.link_id) ?? new Set<string>();
        current.add(visit.visitor_hash);
        recentVisitorsByLink.set(visit.link_id, current);
      }

      for (const visit of todayVisitsResult.data ?? []) {
        if (typeof visit.link_id !== "number" || !visit.visitor_hash) continue;
        const current = todayVisitorsByLink.get(visit.link_id) ?? new Set<string>();
        current.add(visit.visitor_hash);
        todayVisitorsByLink.set(visit.link_id, current);
      }

      createdCount = statsResult.data?.total_created ?? 0;
      deletedCount = statsResult.data?.total_deleted ?? 0;
      todayCreated = dailyResult.data?.created_count ?? 0;
      todayDeleted = dailyResult.data?.deleted_count ?? 0;
      recentVisitors = globalRecentVisitors.size;
      todayVisitors = new Set(
        (todayVisitsResult.data ?? [])
          .map((visit) => visit.visitor_hash)
          .filter((value): value is string => Boolean(value)),
      ).size;
      alerts = alertsResult.data ?? [];

      const linksWithTraffic = (data ?? []).map((link) => ({
        ...link,
        recent_visitors_5m: recentVisitorsByLink.get(link.id)?.size ?? 0,
        today_visitors: todayVisitorsByLink.get(link.id)?.size ?? 0,
      }));

      return NextResponse.json({
        links: linksWithTraffic,
        createdCount,
        todayCreated,
        todayDeleted,
        deletedCount,
        recentVisitors,
        todayVisitors,
        alerts,
      });
    } catch {
      createdCount = 0;
      deletedCount = 0;
      todayCreated = 0;
      todayDeleted = 0;
      recentVisitors = 0;
      todayVisitors = 0;
      alerts = [];
    }

    return NextResponse.json({
      links: data ?? [],
      createdCount,
      todayCreated,
      todayDeleted,
      deletedCount,
      recentVisitors,
      todayVisitors,
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
