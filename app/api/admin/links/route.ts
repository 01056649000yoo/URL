import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("short_links")
      .select("id, slug, destination, created_by, expires_at, click_count, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
