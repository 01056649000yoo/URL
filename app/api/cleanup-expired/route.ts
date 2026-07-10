import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

function tokensMatch(a: string, b: string) {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// 스케줄러(도커 cleanup 컨테이너, Vercel cron)는 공유 토큰으로,
// 관리자 페이지는 로그인 토큰으로 호출합니다. 둘 다 아니면 거부합니다.
async function authorizeCleanup(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const sharedTokens = [process.env.SHORTENER_ADMIN_TOKEN, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (bearer && sharedTokens.some((token) => tokensMatch(bearer, token))) {
    return;
  }

  await requireAdminUser(request);
}

async function cleanupExpiredLinks(request: Request) {
  try {
    await authorizeCleanup(request);
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
