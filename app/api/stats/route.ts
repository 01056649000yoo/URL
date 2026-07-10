import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { execSync } from "node:child_process";

let cachedCommitHash: string | null = null;

function getCommitHash() {
  if (cachedCommitHash !== null) {
    return cachedCommitHash;
  }

  try {
    cachedCommitHash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // Fallback if git CLI is not installed or not in a git repo
    cachedCommitHash = "unknown";
  }

  return cachedCommitHash;
}

export async function GET() {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const [totalResult, activeResult, statsResult] = await Promise.all([
      admin.from("short_links").select("id", { count: "exact", head: true }),
      admin
        .from("short_links")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      admin
        .from("short_link_stats")
        .select("total_created, total_deleted")
        .eq("key", "global")
        .maybeSingle(),
    ]);

    if (totalResult.error) {
      return NextResponse.json({ error: totalResult.error.message }, { status: 500 });
    }

    if (activeResult.error) {
      return NextResponse.json({ error: activeResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      totalCount: totalResult.count ?? 0,
      createdCount: statsResult.data?.total_created ?? 0,
      activeCount: activeResult.count ?? 0,
      deletedCount: statsResult.data?.total_deleted ?? 0,
      commitHash: getCommitHash(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
