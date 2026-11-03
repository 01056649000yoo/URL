import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeScheduler } from "@/lib/auth/scheduler";
import { serverError } from "@/lib/api-error";

async function cleanupExpiredLinks(request: Request) {
  try {
    await authorizeScheduler(request);
  } catch {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_expired_short_links");

  if (error) {
    return serverError(error, "cleanup-expired");
  }

  const deletedCount = typeof data === "number" ? data : 0;

  return NextResponse.json({ deleted: deletedCount });
}

// GET 은 두지 않는다(2026-11-03 KISA 점검: GET 은 출처 검사를 건너뛰어 관리자 쿠키로 다른 사이트가 실행시킬 수 있었다).
export async function POST(request: Request) {
  try {
    return await cleanupExpiredLinks(request);
  } catch (error) {
    return serverError(error, "cleanup-expired");
  }
}
