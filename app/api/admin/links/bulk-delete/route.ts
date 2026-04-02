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
    const { error } = await admin.from("short_links").delete().in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: ids.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
