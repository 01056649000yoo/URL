import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function cleanupExpiredLinks() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("delete_expired_short_links");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    deleted: typeof data === "number" ? data : 0,
  });
}

export async function GET() {
  try {
    return await cleanupExpiredLinks();
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await cleanupExpiredLinks();
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
