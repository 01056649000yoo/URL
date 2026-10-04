import { NextRequest, NextResponse } from "next/server";
import { getViewer, setAccountSession } from "@/lib/account-session";
import { setDeviceCookie } from "@/lib/device-cookie";
import { grantAccountAccess } from "@/lib/link-ownership";
import { createAdminClient } from "@/lib/supabase/admin";

// 아지트가 준 1분짜리 연결표로 선생님 계정을 연결한다(2026-10-05).
// 연결표는 아지트 DB 함수가 한 번만 바꿔 준다(쓰고 나면 끝). 바꾸면 이 기기에서 보던 링크를 계정으로 옮겨 담는다.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { ticket?: string };
    const ticket = body.ticket?.trim() ?? "";
    if (!/^[0-9a-f]{48}$/.test(ticket)) {
      return NextResponse.json({ error: "연결 정보가 올바르지 않습니다. 아지트에서 다시 시도해 주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    // 연결표는 48자리 무작위(192비트)·1분·한 번만이라 맞히기가 불가능하다. 학교는 여러 선생님이 IP 하나를 같이 써서
    // IP 횟수 제한을 걸면 같은 학교 선생님끼리 막히므로 걸지 않는다.
    const { data, error } = await admin.schema("public").rpc("redeem_samlink_connect_ticket_v1", { p_ticket: ticket });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.user_id) {
      return NextResponse.json({ error: "연결 시간이 지났거나 이미 쓴 연결입니다. 아지트에서 다시 시도해 주세요." }, { status: 401 });
    }

    const viewer = getViewer(request);
    const { data: deviceLinks, error: deviceError } = await admin
      .from("short_link_device_access")
      .select("link_id, short_links!inner(created_by)")
      .eq("device_id", viewer.deviceId)
      .limit(1000);
    if (deviceError) throw deviceError;
    const links = (deviceLinks ?? []).map((item) => {
      const owner = item.short_links as unknown as { created_by: string | null } | null;
      return { id: item.link_id as number, isOwner: owner?.created_by === viewer.deviceId };
    });
    await grantAccountAccess(admin, row.user_id, links);

    const response = NextResponse.json({ connected: true, displayName: row.display_name, moved: links.length });
    setAccountSession(response, { userId: row.user_id, displayName: row.display_name ?? "선생님" });
    setDeviceCookie(response, viewer.deviceId);
    return response;
  } catch {
    return NextResponse.json({ error: "연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
