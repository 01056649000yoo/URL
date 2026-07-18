import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { deviceCanManageLink } from "@/lib/link-ownership";

type ExtendPayload = {
  slug?: string;
};

const EXTENSION_DAYS = 30;
// 생성 시 최대 유지 기간(3달)과 동일하게, 연장 후에도 만료가 지금부터 90일을 넘지 않도록 제한
const MAX_DAYS_AHEAD = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExtendPayload;
    const slug = body.slug?.trim().normalize("NFC");

    if (!slug) {
      return NextResponse.json({ error: "연장할 링크를 찾을 수 없습니다." }, { status: 400 });
    }

    const { deviceId, isNew } = getOrCreateDeviceId(request);
    if (isNew) {
      return NextResponse.json(
        { error: "이 브라우저에서 만든 링크만 연장할 수 있습니다." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    const { data: link, error } = await admin
      .from("short_links")
      .select("id, created_by, is_active, expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !link) {
      return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!(await deviceCanManageLink(admin, deviceId, link.id))) {
      return NextResponse.json(
        { error: "이 브라우저에서 만든 링크만 연장할 수 있습니다." },
        { status: 403 },
      );
    }

    if (!link.is_active) {
      return NextResponse.json({ error: "비활성화된 링크는 연장할 수 없습니다." }, { status: 400 });
    }

    const now = Date.now();
    const currentExpiry = link.expires_at ? new Date(link.expires_at).getTime() : now;
    const base = Math.max(Number.isFinite(currentExpiry) ? currentExpiry : now, now);
    const newExpiry = new Date(
      Math.min(base + EXTENSION_DAYS * DAY_MS, now + MAX_DAYS_AHEAD * DAY_MS),
    );

    const { data: updated, error: updateError } = await admin
      .from("short_links")
      .update({ expires_at: newExpiry.toISOString() })
      .eq("id", link.id)
      .select("expires_at")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: `만료 기간을 연장하지 못했습니다. ${updateError.message}` },
        { status: 500 },
      );
    }

    const response = NextResponse.json({ slug, expiresAt: updated.expires_at });
    setDeviceCookie(response, deviceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
