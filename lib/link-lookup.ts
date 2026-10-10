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
  | { status: "blocked"; retryAfterSeconds: number };

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
  const { data, error } = await admin.rpc("lookup_short_link_guarded", {
    p_slug: slug,
    p_ip_hash: getRateLimitKey(request),
  });

  if (error) {
    // 막기 확인이 실패해도 진짜 링크 열기는 멈추지 않는다 — 예전처럼 바로 조회한다.
    const { data: link } = await admin
      .from("short_links")
      .select("id, destination, is_active, expires_at, bundle_items")
      .eq("slug", slug)
      .maybeSingle<GuardedLink>();
    return link ? { status: "found", link } : { status: "missing" };
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
