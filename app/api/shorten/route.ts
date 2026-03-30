import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlug, normalizeSlug } from "@/lib/slug";
import { getBaseUrl } from "@/lib/site-url";

type CreateLinkPayload = {
  destination?: string;
  slug?: string;
  adminToken?: string;
  createdBy?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateLinkPayload;
    const destination = body.destination?.trim();
    const suppliedSlug = body.slug?.trim();
    const adminToken = body.adminToken?.trim();
    const createdBy = body.createdBy?.trim() || null;

    if (!destination) {
      return NextResponse.json({ error: "원본 주소를 입력해 주세요." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(destination);
    } catch {
      return NextResponse.json({ error: "올바른 주소 형식이 아닙니다." }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: "http 또는 https 주소만 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    if (!process.env.SHORTENER_ADMIN_TOKEN) {
      return NextResponse.json(
        { error: "서버에 관리자 토큰이 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    if (adminToken !== process.env.SHORTENER_ADMIN_TOKEN) {
      return NextResponse.json({ error: "관리자 토큰이 올바르지 않습니다." }, { status: 401 });
    }

    let slug: string;
    try {
      slug = suppliedSlug ? normalizeSlug(suppliedSlug) : generateSlug();
    } catch {
      return NextResponse.json(
        { error: "짧은 주소 이름은 영문, 숫자, 하이픈, 밑줄만 사용할 수 있습니다." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("short_links")
      .insert({
        slug,
        destination: parsedUrl.toString(),
        created_by: createdBy,
      })
      .select("slug, destination")
      .single();

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "이미 사용 중인 짧은 주소입니다. 다른 이름을 입력해 주세요."
            : `단축 링크를 저장하지 못했습니다. ${error.message}`,
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    const shortUrl = `${getBaseUrl(request)}/${data.slug}`;

    return NextResponse.json({
      slug: data.slug,
      destination: data.destination,
      shortUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
