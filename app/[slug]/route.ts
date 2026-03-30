import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { slug } = await context.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("short_links")
    .select("id, destination, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
  }

  await admin.rpc("increment_click_count", {
    link_id: data.id,
  });

  return NextResponse.redirect(data.destination, { status: 307 });
}
