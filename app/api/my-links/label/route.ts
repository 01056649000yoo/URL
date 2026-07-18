import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDeviceId } from "@/lib/device-cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { deviceCanManageLink } from "@/lib/link-ownership";

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { slug?: string; label?: string };
    const slug = body.slug?.trim().normalize("NFC");
    const label = body.label?.trim().slice(0, 40) || null;
    if (!slug) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 400 });

    const { deviceId, isNew } = getOrCreateDeviceId(request);
    if (isNew) return NextResponse.json({ error: "이 링크를 관리할 권한이 없습니다." }, { status: 403 });

    const admin = createAdminClient();
    const { data: link, error: findError } = await admin
      .from("short_links").select("id").eq("slug", slug).maybeSingle();
    if (findError) throw findError;
    if (!link || !(await deviceCanManageLink(admin, deviceId, link.id))) {
      return NextResponse.json({ error: "이 링크를 관리할 권한이 없습니다." }, { status: 403 });
    }
    const { error } = await admin
      .from("short_links")
      .update({ display_label: label })
      .eq("id", link.id);
    if (error) throw error;
    return NextResponse.json({ label });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
