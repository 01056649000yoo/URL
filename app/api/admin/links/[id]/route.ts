import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdminUser(request);

    const { id } = await context.params;
    const linkId = Number(id);
    if (!Number.isInteger(linkId)) {
      return NextResponse.json({ error: "올바른 링크 ID가 아닙니다." }, { status: 400 });
    }

    const body = (await request.json()) as { isActive?: boolean };
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "수정할 값이 없습니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("short_links")
      .update({ is_active: body.isActive })
      .eq("id", linkId)
      .select("id, is_active")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ link: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdminUser(request);

    const { id } = await context.params;
    const linkId = Number(id);
    if (!Number.isInteger(linkId)) {
      return NextResponse.json({ error: "올바른 링크 ID가 아닙니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_delete_short_links", {
      p_ids: [linkId],
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedCount = typeof data === "number" ? data : 0;
    if (deletedCount === 0) {
      return NextResponse.json({ error: "이미 삭제됐거나 존재하지 않는 링크입니다." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
