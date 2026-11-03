import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/account-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLinkAccess } from "@/lib/link-ownership";
import { serverError } from "@/lib/api-error";

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { slug?: unknown; label?: unknown } | null;
    const slug = typeof body?.slug === "string" ? body.slug.trim().normalize("NFC") : "";
    if (body?.label !== undefined && body?.label !== null && typeof body.label !== "string") {
      return NextResponse.json({ error: "별명 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 40) || null : null;
    if (!slug) return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 400 });

    const viewer = await getViewer(request);
    if (viewer.isNewDevice && !viewer.userId) return NextResponse.json({ error: "이 링크를 관리할 권한이 없습니다." }, { status: 403 });

    const admin = createAdminClient();
    const { data: link, error: findError } = await admin
      .from("short_links").select("id, created_by").eq("slug", slug).maybeSingle();
    if (findError) throw findError;
    const access = link ? await getLinkAccess(admin, viewer, link) : null;
    if (!link || !access?.canManage) {
      return NextResponse.json({ error: "이 링크를 관리할 권한이 없습니다." }, { status: 403 });
    }
    // 별명은 링크 하나에 하나라 모두에게 보인다 — 만든 사람만 바꾼다(2026-11-03 KISA 점검: 공유받은 사람이 바꾸던 문제).
    if (!access.isOwner) {
      return NextResponse.json({ error: "별명은 이 링크를 만든 사람만 바꿀 수 있어요." }, { status: 403 });
    }
    const { error } = await admin
      .from("short_links")
      .update({ display_label: label })
      .eq("id", link.id);
    if (error) throw error;
    return NextResponse.json({ label });
  } catch (error) {
    return serverError(error, "my-links/label");
  }
}
