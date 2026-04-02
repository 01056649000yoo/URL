import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminUser } from "@/lib/auth/admin";

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
    const { data, error } = await admin.from("short_links").delete().in("id", ids).select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedCount = data?.length ?? 0;
    if (deletedCount > 0) {
      await admin.rpc("increment_deleted_short_links", { amount: deletedCount });
    }

    return NextResponse.json({ deleted: deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
