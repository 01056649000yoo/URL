import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";
import { serverError, adminRouteError } from "@/lib/api-error";

type BulkDeletePayload = {
  ids?: number[];
};

export async function POST(request: Request) {
  try {
    await requireAdminUser(request);

    const body = (await request.json()) as BulkDeletePayload;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((value): value is number => Number.isInteger(value))
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "삭제할 링크를 선택해 주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("admin_delete_short_links", {
      p_ids: ids,
    });

    if (error) {
      return serverError(error, "admin/links/bulk-delete");
    }

    const deletedCount = typeof data === "number" ? data : 0;
    return NextResponse.json({ deleted: deletedCount });
  } catch (error) {
    return adminRouteError(error, "admin/links/bulk-delete");
  }
}
