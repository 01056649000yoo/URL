import { createHash, timingSafeEqual } from "node:crypto";
import { requireAdminUser } from "@/lib/auth/admin";

function tokensMatch(a: string, b: string) {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// 스케줄러(도커 cleanup 컨테이너, Vercel cron)는 공유 토큰으로,
// 관리자 페이지는 로그인 토큰으로 호출합니다. 둘 다 아니면 거부합니다.
// 만료 정리(/api/cleanup-expired)와 악성 주소 다시 검사(/api/rescan-links)가 같이 쓴다.
export async function authorizeScheduler(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const sharedTokens = [process.env.SHORTENER_ADMIN_TOKEN, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (bearer && sharedTokens.some((token) => tokensMatch(bearer, token))) {
    return;
  }

  await requireAdminUser(request);
}
