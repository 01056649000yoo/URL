import { NextRequest, NextResponse } from "next/server";
import { domainToUnicode } from "node:url";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { generateSlug, isReservedSlug, normalizeSlug } from "@/lib/slug";
import { getDeviceRateLimitKey, getRateLimitKey } from "@/lib/rate-limit";
import { checkUrlsSafety, describeThreat } from "@/lib/safe-browsing";
import { getBaseUrl } from "@/lib/site-url";

type BundleItemPayload = {
  label?: string;
  url?: string;
};

type CreateLinkPayload = {
  destination?: string;
  slug?: string;
  createdBy?: string;
  retentionPeriod?: "day" | "week" | "month" | "quarter";
  bundleTitle?: string;
  bundleItems?: BundleItemPayload[];
};

const BUNDLE_MIN_ITEMS = 2;
const BUNDLE_MAX_ITEMS = 8;

function toDisplayUrl(shortUrl: string) {
  try {
    const parsed = new URL(shortUrl);
    const unicodeHost = domainToUnicode(parsed.hostname) || parsed.hostname;
    let pathname = parsed.pathname;
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // 인코딩 해제가 안 되면 원본 경로를 그대로 보여줍니다.
    }
    return `${parsed.protocol}//${unicodeHost}${parsed.port ? `:${parsed.port}` : ""}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return shortUrl;
  }
}

// 링크 묶음 항목을 검증해 jsonb에 저장할 형태로 만듭니다. 문제가 있으면 에러 메시지를 반환합니다.
function buildBundlePayload(title: string | undefined, items: BundleItemPayload[]) {
  if (items.length < BUNDLE_MIN_ITEMS || items.length > BUNDLE_MAX_ITEMS) {
    return { error: `링크 묶음은 ${BUNDLE_MIN_ITEMS}개 이상 ${BUNDLE_MAX_ITEMS}개 이하로 만들 수 있습니다.` } as const;
  }

  const cleanItems: { label: string; url: string }[] = [];
  for (const item of items) {
    const rawUrl = item.url?.trim();
    if (!rawUrl) {
      return { error: "묶음에 포함된 주소를 모두 입력해 주세요." } as const;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { error: `올바른 주소 형식이 아닙니다: ${rawUrl.slice(0, 80)}` } as const;
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { error: "묶음에는 http 또는 https 주소만 넣을 수 있습니다." } as const;
    }

    cleanItems.push({
      label: (item.label ?? "").trim().slice(0, 40),
      url: parsed.toString(),
    });
  }

  return {
    payload: {
      title: (title ?? "").trim().slice(0, 60),
      items: cleanItems,
    },
  } as const;
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
    const bundleItems = Array.isArray(body.bundleItems) ? body.bundleItems : [];
    const isBundle = bundleItems.length > 0;

    let bundlePayload: { title: string; items: { label: string; url: string }[] } | null = null;
    let parsedUrl: URL | null = null;

    if (isBundle) {
      const bundleResult = buildBundlePayload(body.bundleTitle, bundleItems);
      if ("error" in bundleResult) {
        return NextResponse.json({ error: bundleResult.error }, { status: 400 });
      }
      bundlePayload = bundleResult.payload;
    } else {
      if (!destination) {
        return NextResponse.json({ error: "원본 주소를 입력해 주세요." }, { status: 400 });
      }

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
        { error: "짧은 주소 이름은 한글, 영문, 숫자, 하이픈(-), 밑줄(_)만 사용할 수 있습니다 (최대 30자)." },
        { status: 400 },
      );
    }

    if (isReservedSlug(slug)) {
      return NextResponse.json(
        { error: "이 이름은 서비스에서 사용하는 예약어라 쓸 수 없습니다. 다른 이름을 입력해 주세요." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: rateLimitData, error: rateLimitError } = await admin.rpc(
      "consume_short_link_rate_limit",
      {
        p_ip_hash: getRateLimitKey(request),
        p_device_hash: getDeviceRateLimitKey(deviceId),
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

    // 피싱·멀웨어 목적지 차단 (API 키가 설정된 경우에만 검사)
    const urlsToCheck = isBundle
      ? (bundlePayload?.items ?? []).map((item) => item.url)
      : [(parsedUrl as URL).toString()];
    const safety = await checkUrlsSafety(urlsToCheck);
    if (!safety.safe) {
      return NextResponse.json(
        {
          error: `이 주소는 Google Safe Browsing에서 ${describeThreat(safety.threatType)} 사이트로 분류되어 단축할 수 없습니다.`,
        },
        { status: 400 },
      );
    }

    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const baseUrl = getBaseUrl(request);

    // 자동 생성 슬러그는 충돌 시 재시도하고, 반복 충돌하면 길이를 늘려 확률을 낮춥니다.
    const maxAttempts = suppliedSlug ? 1 : 5;
    let data: { slug: string; destination: string; expires_at: string | null } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      // 묶음 링크는 자체 목록 페이지(/b/슬러그)를 목적지로 사용해
      // 리다이렉트 로직을 바꾸지 않고도 동작합니다.
      const attemptDestination = isBundle
        ? `${baseUrl}/b/${encodeURIComponent(slug)}`
        : (parsedUrl as URL).toString();

      const { data: inserted, error } = await admin
        .from("short_links")
        .insert({
          slug,
          destination: attemptDestination,
          created_by: createdBy,
          expires_at: expiresAt,
          ...(isBundle ? { bundle_items: bundlePayload } : {}),
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

    const shortUrl = `${baseUrl}/${encodeURIComponent(data.slug)}`;

    const response = NextResponse.json({
      slug: data.slug,
      destination: data.destination,
      shortUrl,
      displayShortUrl: toDisplayUrl(shortUrl),
      expiresAt: data.expires_at,
      retentionPeriod: body.retentionPeriod,
      isBundle,
      bundleTitle: bundlePayload?.title ?? undefined,
    });
    setDeviceCookie(response, deviceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
