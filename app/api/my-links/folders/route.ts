import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/account-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/api-error";
import { sanitizeFolders, type LinkFolder } from "@/lib/link-folders";

// 링크 폴더 구성을 아지트 계정에 저장·읽기(2026-11-03). 계정에 연결된 브라우저만 쓸 수 있다.
// 바꾸는 요청(PUT)은 proxy.ts 가 샘링크 자기 주소에서 온 것만 통과시킨다.
// 저장은 "읽었던 version 과 같을 때만"(두 기기·두 탭 동시 수정 때 몰래 덮어쓰기 방지) — 다르면 409 와 최신 폴더를 준다.
const MAX_BODY_BYTES = 128 * 1024;

type AdminClient = ReturnType<typeof createAdminClient>;
type Viewer = ReturnType<typeof getViewer>;

/**
 * 이 계정(과 이 브라우저)이 볼 수 있는 링크만 폴더에 남긴다 — 지워진·남의 링크 주소는 저장하지 않는다.
 * 폴더에 담긴 주소만 골라 확인한다(전체 접근 목록을 상한까지만 읽어 정상 링크를 빼는 일이 없게, 외부 검토 반영).
 */
async function keepAccessibleSlugs(admin: AdminClient, viewer: Viewer, folders: LinkFolder[]) {
  const wanted = [...new Set(folders.flatMap((folder) => folder.slugs))];
  if (!wanted.length) return folders;
  const allowed = new Set<string>();
  for (let start = 0; start < wanted.length; start += 200) {
    const { data: links, error } = await admin.from("short_links").select("id, slug").in("slug", wanted.slice(start, start + 200));
    if (error) throw error;
    const slugById = new Map((links ?? []).map((row) => [row.id as number, row.slug as string]));
    const ids = [...slugById.keys()];
    if (!ids.length) continue;
    const [byDevice, byAccount] = await Promise.all([
      admin.from("short_link_device_access").select("link_id").eq("device_id", viewer.deviceId).in("link_id", ids),
      viewer.userId
        ? admin.from("short_link_account_access").select("link_id").eq("user_id", viewer.userId).in("link_id", ids)
        : Promise.resolve({ data: [] as { link_id: number }[], error: null }),
    ]);
    if (byDevice.error) throw byDevice.error;
    if (byAccount.error) throw byAccount.error;
    for (const row of [...(byDevice.data ?? []), ...(byAccount.data ?? [])]) {
      const slug = slugById.get(row.link_id as number);
      if (slug) allowed.add(slug);
    }
  }
  return folders.map((folder) => ({ ...folder, slugs: folder.slugs.filter((slug) => allowed.has(slug)) }));
}

/** 브라우저가 "이 폴더가 어느 계정 것인지" 기억하는 데 쓰는 짧은 표시(계정 id 를 그대로 주지 않는다). */
function accountKey(userId: string) {
  return createHash("sha256").update(`samlink-folders|${userId}`).digest("base64url").slice(0, 16);
}

async function readCurrent(admin: AdminClient, viewer: Viewer, userId: string) {
  const { data, error } = await admin
    .from("account_link_folders")
    .select("folders, version")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const folders = await keepAccessibleSlugs(admin, viewer, sanitizeFolders(data?.folders ?? []));
  return { folders, version: (data?.version as number | undefined) ?? 0 };
}

/** 본문을 읽으면서 바이트 수를 세어, 상한을 넘으면 더 읽지 않는다. */
async function readLimitedText(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function GET(request: NextRequest) {
  try {
    const viewer = getViewer(request);
    if (!viewer.userId) return NextResponse.json({ error: "아지트 계정에 연결해 주세요." }, { status: 401 });
    const admin = createAdminClient();
    const current = await readCurrent(admin, viewer, viewer.userId);
    return NextResponse.json({ ...current, accountKey: accountKey(viewer.userId) });
  } catch (error) {
    return serverError(error, "my-links/folders GET");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const viewer = getViewer(request);
    if (!viewer.userId) return NextResponse.json({ error: "아지트 계정에 연결해 주세요." }, { status: 401 });
    const rawBody = await readLimitedText(request);
    if (rawBody === null) return NextResponse.json({ error: "폴더 정보가 너무 큽니다." }, { status: 413 });
    let body: { folders?: unknown; baseVersion?: unknown; accountKey?: unknown };
    try {
      body = JSON.parse(rawBody) as { folders?: unknown; baseVersion?: unknown; accountKey?: unknown };
    } catch {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const baseVersion = body.baseVersion;
    if (!Array.isArray(body.folders) || typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 0) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const admin = createAdminClient();
    // 화면이 읽었던 계정과 지금 연결된 계정이 다르면(그 사이 계정을 바꿈) 저장하지 않고 다시 읽게 한다.
    if (body.accountKey !== accountKey(viewer.userId)) {
      const current = await readCurrent(admin, viewer, viewer.userId);
      return NextResponse.json({ error: "연결된 계정이 바뀌었습니다.", accountChanged: true, ...current }, { status: 409 });
    }
    const folders = await keepAccessibleSlugs(admin, viewer, sanitizeFolders(body.folders));
    let saved = false;
    if (baseVersion === 0) {
      const { error } = await admin.from("account_link_folders").insert({ user_id: viewer.userId, folders, version: 1 });
      if (error && error.code !== "23505") throw error;
      saved = !error;
    } else {
      const { data, error } = await admin
        .from("account_link_folders")
        .update({ folders, version: baseVersion + 1, updated_at: new Date().toISOString() })
        .eq("user_id", viewer.userId)
        .eq("version", baseVersion)
        .select("version");
      if (error) throw error;
      saved = Boolean(data?.length);
    }

    if (!saved) {
      const current = await readCurrent(admin, viewer, viewer.userId);
      return NextResponse.json({ error: "다른 기기에서 폴더가 바뀌었습니다.", ...current }, { status: 409 });
    }
    return NextResponse.json({ folders, version: baseVersion + 1 });
  } catch (error) {
    return serverError(error, "my-links/folders PUT");
  }
}
