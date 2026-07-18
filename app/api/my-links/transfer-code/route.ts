import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { createAdminClient } from "@/lib/supabase/admin";

const CODE_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string) {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-transfer-v1";
  return createHash("sha256").update(`${code}|${salt}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      folders?: { id?: string; name?: string; slugs?: string[] }[];
      excludedSlugs?: string[];
    };
    const { deviceId, isNew } = getOrCreateDeviceId(request);
    if (isNew) {
      const response = NextResponse.json({ error: "이 브라우저에서 만든 링크가 없습니다." }, { status: 400 });
      setDeviceCookie(response, deviceId);
      return response;
    }

    const admin = createAdminClient();
    const { data: ownedLinks, error: countError } = await admin
      .from("short_links")
      .select("slug")
      .eq("created_by", deviceId);

    if (countError) throw countError;
    if (!ownedLinks?.length) {
      return NextResponse.json(
        { error: "복사 코드는 링크를 처음 만든 기기에서만 만들 수 있습니다. 이 기기가 링크를 복사받은 기기라면 원래 기기에서 코드를 만들어 주세요." },
        { status: 400 },
      );
    }

    const excludedSlugs = new Set(
      (Array.isArray(body.excludedSlugs) ? body.excludedSlugs : [])
        .filter((slug): slug is string => typeof slug === "string")
        .slice(0, 5000),
    );
    const transferableSlugs = ownedLinks.map((link) => link.slug).filter((slug) => !excludedSlugs.has(slug));
    if (!transferableSlugs.length) {
      return NextResponse.json(
        { error: "관리 가능한 링크가 모두 이 브라우저의 삭제·숨김 목록에 포함되어 있어 옮길 링크가 없습니다." },
        { status: 400 },
      );
    }
    const ownedSlugs = new Set(transferableSlugs);
    const folderState = (Array.isArray(body.folders) ? body.folders : [])
      .slice(0, 100)
      .map((folder, index) => ({
        id: typeof folder.id === "string" && folder.id.length <= 100 ? folder.id : `folder-${index + 1}`,
        name: typeof folder.name === "string" ? folder.name.trim().slice(0, 30) : "이름 없는 폴더",
        slugs: Array.isArray(folder.slugs)
          ? Array.from(new Set(folder.slugs.filter((slug) => typeof slug === "string" && ownedSlugs.has(slug)))).slice(0, 1000)
          : [],
      }));

    await admin.from("device_link_transfer_codes").delete().eq("source_device_id", deviceId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
      const { error } = await admin.from("device_link_transfer_codes").insert({
        code_hash: hashCode(code),
        source_device_id: deviceId,
        folder_state: folderState,
        link_slugs: transferableSlugs,
        expires_at: expiresAt,
      });
      if (!error) return NextResponse.json({ code, expiresAt, linkCount: transferableSlugs.length, folderCount: folderState.length });
      if (error.code !== "23505") throw error;
    }

    return NextResponse.json({ error: "이전 코드를 만들지 못했습니다." }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
