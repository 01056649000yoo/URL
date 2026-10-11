import { createAdminClient } from "@/lib/supabase/admin";
import { getRateLimitKey } from "@/lib/rate-limit";

// 짧은 주소 열기(/슬러그, /b/슬러그)는 모두 여기로 조회한다(2026-10-10).
// 없는 주소를 IP별로 세서 찍어 보기를 막는다 — 기준 숫자는 migration 20261010120000 한 곳에 있다.
type AdminClient = ReturnType<typeof createAdminClient>;

export type GuardedLink = {
  id: number;
  destination: string;
  is_active: boolean;
  expires_at: string | null;
  bundle_items: unknown;
};

export type GuardedLookup =
  | { status: "found"; link: GuardedLink }
  | { status: "missing" }
  | { status: "blocked"; retryAfterSeconds: number }
  // 막기 확인 함수가 오류를 냈다(DB·네트워크). 막기를 건너뛰고 조회로 넘어가지 않는다 — 잠시 뒤 다시.
  | { status: "unavailable"; retryAfterSeconds: number };

type LookupRow = {
  blocked: boolean;
  retry_after_seconds: number;
  id: number | null;
  destination: string | null;
  is_active: boolean | null;
  expires_at: string | null;
  bundle_items: unknown;
};

export async function lookupLinkGuarded(
  admin: AdminClient,
  request: { headers: { get(name: string): string | null } },
  slug: string,
): Promise<GuardedLookup> {
  // 오류면 한 번만 다시 부른다(순간적인 연결 문제). 그래도 오류면 직접 조회로 넘어가지 않는다 — 막기를 일부러 오류 나게 해
  // 우회하지 못하게(2026-10-11 Codex 독립 검토 지적, 선생님 결정 B안). DB 가 안 되면 어차피 조회도 안 되니 잃는 것이 거의 없다.
  let result = await admin.rpc("lookup_short_link_guarded", { p_slug: slug, p_ip_hash: getRateLimitKey(request) });
  if (result.error) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    result = await admin.rpc("lookup_short_link_guarded", { p_slug: slug, p_ip_hash: getRateLimitKey(request) });
  }
  const { data, error } = result;
  if (error) {
    return { status: "unavailable", retryAfterSeconds: 5 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as LookupRow | null;
  if (!row) return { status: "missing" };
  if (row.blocked) {
    return { status: "blocked", retryAfterSeconds: Math.max(Number(row.retry_after_seconds) || 60, 1) };
  }
  if (row.id === null || row.destination === null) return { status: "missing" };

  return {
    status: "found",
    link: {
      id: row.id,
      destination: row.destination,
      is_active: row.is_active ?? false,
      expires_at: row.expires_at,
      bundle_items: row.bundle_items,
    },
  };
}
