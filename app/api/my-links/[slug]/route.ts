import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/account-session";
import { decodeSlugParam } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLinkAccess, removeLinkAccess } from "@/lib/link-ownership";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const viewer = getViewer(request);
    if (viewer.isNewDevice && !viewer.userId) {
      return NextResponse.json({ error: "이 브라우저에서 만든 링크만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { slug: rawSlug } = await context.params;
    const slug = decodeSlugParam(rawSlug);
    const admin = createAdminClient();
    const { data: link, error: findError } = await admin
      .from("short_links").select("id, created_by").eq("slug", slug).maybeSingle();
    if (findError) throw findError;
    const access = link ? await getLinkAccess(admin, viewer, link) : null;
    if (!link || !access?.canManage) {
      return NextResponse.json({ error: "이 링크를 관리할 권한이 없습니다." }, { status: 403 });
    }
    if (!access.isOwner) {
      await removeLinkAccess(admin, viewer, link.id);
      return NextResponse.json({ deleted: false, removedAccess: true, slug });
    }
    const { data, error } = await admin
      .from("short_links")
      .delete()
      .eq("slug", slug)
      .eq("id", link.id)
      .select("slug")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "링크가 없거나 삭제할 권한이 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, slug: data.slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
