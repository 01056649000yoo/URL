import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type LinkSnapshot = {
  is_active: boolean;
  expires_at: string | null;
};

function isLiveLink(link: LinkSnapshot) {
  if (!link.is_active) {
    return false;
  }

  if (!link.expires_at) {
    return true;
  }

  const expiresAtMs = new Date(link.expires_at).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

export async function GET() {
  try {
    const admin = createAdminClient();

    const [{ data: links, error: linksError }, statsResult] = await Promise.all([
      admin.from("short_links").select("is_active, expires_at"),
      admin
        .from("short_link_stats")
        .select("total_created, total_deleted")
        .eq("key", "global")
        .maybeSingle(),
    ]);

    if (linksError) {
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }

    const totalCount = links?.length ?? 0;
    const activeCount = (links ?? []).filter(isLiveLink).length;
    const createdCount = statsResult.data?.total_created ?? 0;
    const deletedCount = statsResult.data?.total_deleted ?? 0;

    return NextResponse.json({
      totalCount,
      createdCount,
      activeCount,
      deletedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
