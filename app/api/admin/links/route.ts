import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);

    const admin = createAdminClient();
    const todayUtc = new Date().toISOString().slice(0, 10);
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
    let alerts = [] as Array<{
      alert_key: string;
      kind: string;
      title: string;
      message: string;
      created_at: string;
    }>;
    try {
      const [statsResult, dailyResult, alertsResult] = await Promise.all([
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
      ]);

      createdCount = statsResult.data?.total_created ?? 0;
      deletedCount = statsResult.data?.total_deleted ?? 0;
      todayCreated = dailyResult.data?.created_count ?? 0;
      todayDeleted = dailyResult.data?.deleted_count ?? 0;
      alerts = alertsResult.data ?? [];
    } catch {
      createdCount = 0;
      deletedCount = 0;
      todayCreated = 0;
      todayDeleted = 0;
      alerts = [];
    }

    return NextResponse.json({
      links: data ?? [],
      createdCount,
      todayCreated,
      todayDeleted,
      deletedCount,
      alerts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
