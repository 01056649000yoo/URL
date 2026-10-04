import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeScheduler } from "@/lib/auth/scheduler";

async function cleanupExpiredLinks(request: Request) {
  try {
    await authorizeScheduler(request);
  } catch {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_expired_short_links");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deletedCount = typeof data === "number" ? data : 0;

  return NextResponse.json({ deleted: deletedCount });
}

export async function GET(request: Request) {
  try {
    return await cleanupExpiredLinks(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await cleanupExpiredLinks(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
