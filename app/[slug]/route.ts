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
    .select("id, destination, is_active, expires_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= Date.now();

  if (!data.is_active || isExpired) {
    await admin.from("short_links").delete().eq("id", data.id);
    return NextResponse.json({ error: "링크가 만료되었습니다." }, { status: 404 });
  }

  await admin.rpc("increment_click_count", {
    link_id: data.id,
  });

  return NextResponse.redirect(data.destination, { status: 307 });
}
