import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { execSync } from "node:child_process";

let cachedCommitHash: string | null = null;

/*
 * 커밋 해시는 빌드할 때 정해진다(2026-09-02).
 *
 * 예전에는 실행 중에 `git rev-parse` 를 불렀다. 그 한 줄 때문에 운영 이미지가 git 실행 파일과
 * 저장소 이력 `.git`(2.9MB)을 통째로 들고 다녔다. 이제 `BUILD_COMMIT` 을 빌드 인자로 받아 두므로
 * 실행 이미지에 git 도 `.git` 도 필요 없다.
 * 로컬 개발(`next dev`)에서는 그 값이 없으므로 예전처럼 git 에게 물어본다.
 */
function getCommitHash() {
  if (cachedCommitHash !== null) {
    return cachedCommitHash;
  }

  const fromBuild = process.env.BUILD_COMMIT?.trim();
  if (fromBuild) {
    cachedCommitHash = fromBuild;
    return cachedCommitHash;
  }

  try {
    cachedCommitHash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // git 이 없거나 저장소가 아닐 때(운영 이미지가 여기에 해당한다)
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
