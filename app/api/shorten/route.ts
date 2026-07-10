import { NextRequest, NextResponse } from "next/server";
import { domainToUnicode } from "node:url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { generateSlug, normalizeSlug } from "@/lib/slug";
import { getRateLimitKey } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/site-url";

type CreateLinkPayload = {
  destination?: string;
  slug?: string;
  createdBy?: string;
  retentionPeriod?: "day" | "week" | "month" | "quarter";
};

function toDisplayUrl(shortUrl: string) {
  try {
    const parsed = new URL(shortUrl);
    const unicodeHost = domainToUnicode(parsed.hostname) || parsed.hostname;
    return `${parsed.protocol}//${unicodeHost}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return shortUrl;
  }
}

function retentionDaysFromPeriod(period: CreateLinkPayload["retentionPeriod"]) {
  switch (period) {
    case "day":
      return 1;
    case "week":
      return 7;
    case "month":
      return 30;
    case "quarter":
      return 90;
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateLinkPayload;
    const destination = body.destination?.trim();
    const suppliedSlug = body.slug?.trim();
    const { deviceId } = getOrCreateDeviceId(request);
    const createdBy = deviceId;
    const retentionDays = retentionDaysFromPeriod(body.retentionPeriod);

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

    if (!retentionDays) {
      return NextResponse.json(
        { error: "유지 기간은 1일, 1주일, 1개월, 3달 중 하나를 선택해 주세요." },
        { status: 400 },
      );
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
    const rateLimitKey = getRateLimitKey(request);
    const { data: rateLimitData, error: rateLimitError } = await admin.rpc(
      "consume_short_link_rate_limit",
      {
        p_ip_hash: rateLimitKey,
      },
    );

    if (rateLimitError) {
      return NextResponse.json(
        { error: `속도 제한을 확인하지 못했습니다. ${rateLimitError.message}` },
        { status: 500 },
      );
    }

    const rateLimit = Array.isArray(rateLimitData) ? rateLimitData[0] : rateLimitData;
    if (!rateLimit?.allowed) {
      const waitSeconds = Math.max(Number(rateLimit?.retry_after_seconds ?? 60), 1);
      return NextResponse.json(
        {
          error: `너무 자주 요청했습니다. ${waitSeconds}초 뒤에 다시 시도해 주세요.`,
          retryAfterSeconds: waitSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(waitSeconds),
          },
        },
      );
    }

    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

    // 자동 생성 슬러그는 충돌 시 재시도하고, 반복 충돌하면 길이를 늘려 확률을 낮춥니다.
    const maxAttempts = suppliedSlug ? 1 : 5;
    let data: { slug: string; destination: string; expires_at: string | null } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { data: inserted, error } = await admin
        .from("short_links")
        .insert({
          slug,
          destination: parsedUrl.toString(),
          created_by: createdBy,
          expires_at: expiresAt,
        })
        .select("slug, destination, expires_at")
        .single();

      if (!error) {
        data = inserted;
        break;
      }

      const duplicate = error.code === "23505";
      if (!duplicate) {
        return NextResponse.json(
          { error: `단축 링크를 저장하지 못했습니다. ${error.message}` },
          { status: 500 },
        );
      }

      if (suppliedSlug) {
        return NextResponse.json(
          { error: "이미 사용 중인 짧은 주소입니다. 다른 이름을 입력해 주세요." },
          { status: 409 },
        );
      }

      slug = generateSlug(attempt < 2 ? undefined : 6);
    }

    if (!data) {
      return NextResponse.json(
        { error: "짧은 주소 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      );
    }

    const shortUrl = `${getBaseUrl(request)}/${data.slug}`;

    const response = NextResponse.json({
      slug: data.slug,
      destination: data.destination,
      shortUrl,
      displayShortUrl: toDisplayUrl(shortUrl),
      expiresAt: data.expires_at,
      retentionPeriod: body.retentionPeriod,
    });
    setDeviceCookie(response, deviceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
