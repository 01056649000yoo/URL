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

export async function GET(request: Request) {
  try {
    return await cleanupExpiredLinks(request);
  } catch (error) {
    return serverError(error, "cleanup-expired");
  }
}

export async function POST(request: Request) {
  try {
    return await cleanupExpiredLinks(request);
  } catch (error) {
    return serverError(error, "cleanup-expired");
  }
}
