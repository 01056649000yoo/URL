import { NextResponse } from "next/server";
import { authorizeScheduler } from "@/lib/auth/scheduler";
import { describeThreat, findUnsafeUrls } from "@/lib/safe-browsing";
import { createAdminClient } from "@/lib/supabase/admin";

// 사용 중인 링크의 목적지를 Google Safe Browsing 으로 매일 다시 검사한다(2026-10-04, 선생님 결정).
// 걸린 링크는 곧바로 멈추고(is_active=false → 방문자는 /expired), 아지트 관리자 경고를 연다.
// 관리자 경고는 아지트 관리자 화면과 텔레그램 서버 점검(30분마다)에 함께 뜬다.
// cleanup 컨테이너가 하루 한 번 부른다(docker-compose.yml).
const ALERT_KEY = "samlink_unsafe_link";

type LinkRow = {
  id: number;
  slug: string;
  destination: string;
  bundle_items: { items?: { url?: string }[] } | null;
};

export async function POST(request: Request) {
  try {
    await authorizeScheduler(request);
  } catch {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("short_links")
    .select("id, slug, destination, bundle_items")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(5000);
  if (error) {
    return NextResponse.json({ error: "링크 목록을 읽지 못했습니다." }, { status: 500 });
  }

  const links = (data ?? []) as LinkRow[];
  const urlsOf = (link: LinkRow) => link.bundle_items?.items?.length
    ? link.bundle_items.items.map((item) => item.url).filter((url): url is string => Boolean(url))
    : [link.destination];

  const unsafe = await findUnsafeUrls(links.flatMap(urlsOf));
  if (!unsafe) {
    // 검사 자체를 못 한 날은 링크를 건드리지 않는다. 다음 날 다시 시도.
    return NextResponse.json({ error: "Safe Browsing 검사에 실패했습니다." }, { status: 502 });
  }

  const flagged = links
    .map((link) => ({ link, threat: urlsOf(link).map((url) => unsafe.get(url)).find(Boolean) }))
    .filter((row): row is { link: LinkRow; threat: string } => Boolean(row.threat));

  if (flagged.length) {
    const { error: updateError } = await admin
      .from("short_links")
      .update({ is_active: false })
      .in("id", flagged.map(({ link }) => link.id));
    if (updateError) {
      return NextResponse.json({ error: "위험 링크를 멈추지 못했습니다." }, { status: 500 });
    }

    const detail = `쌤링크 위험 링크 ${flagged.length}개 자동 중지: `
      + flagged.slice(0, 5).map(({ link, threat }) => `${link.slug}(${describeThreat(threat)})`).join(", ");
    await admin.schema("public").rpc("record_system_alert_v1", {
      p_alert_key: ALERT_KEY,
      p_is_problem: true,
      p_detail: detail,
    });
  } else {
    // 깨끗한 날에는 전날 연 경고를 닫는다(링크는 이미 멈췄으므로 하루 알리면 충분).
    await admin.schema("public").rpc("record_system_alert_v1", { p_alert_key: ALERT_KEY, p_is_problem: false });
  }

  return NextResponse.json({ checked: links.length, blocked: flagged.map(({ link }) => link.slug) });
}
