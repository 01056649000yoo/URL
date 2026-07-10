import { NextResponse } from "next/server";
import { domainToUnicode } from "node:url";
import { getBaseUrl } from "@/lib/site-url";

const MAX_DATA_LENGTH = 2048;
const REMOTE_TIMEOUT_MS = 5000;

function sanitizeSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 360;
  return Math.min(Math.max(parsed, 120), 1400);
}

// 외부 QR 서비스를 임의 데이터 프록시로 남용하지 못하도록
// 이 서비스의 단축 URL만 QR 생성 대상으로 허용합니다.
function isOwnShortUrl(data: string, request: Request) {
  let target: URL;
  try {
    target = new URL(data);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return false;
  }

  let siteHost: string;
  try {
    siteHost = new URL(getBaseUrl(request)).hostname;
  } catch {
    return false;
  }

  const targetHost = domainToUnicode(target.hostname) || target.hostname;
  const allowedHost = domainToUnicode(siteHost) || siteHost;
  return targetHost === allowedHost;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = url.searchParams.get("data");

  if (!data) {
    return NextResponse.json({ error: "QR 코드 데이터를 찾을 수 없습니다." }, { status: 400 });
  }

  if (data.length > MAX_DATA_LENGTH || !isOwnShortUrl(data, request)) {
    return NextResponse.json(
      { error: "이 서비스의 단축 주소만 QR 코드로 만들 수 있습니다." },
      { status: 400 },
    );
  }

  const size = sanitizeSize(url.searchParams.get("size"));
  const margin = Math.min(Math.max(Number.parseInt(url.searchParams.get("margin") ?? "10", 10) || 10, 0), 40);
  const remoteUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(data)}`;

  let response: Response;
  try {
    response = await fetch(remoteUrl, {
      headers: {
        accept: "image/png,image/*;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ error: "QR 코드를 생성하지 못했습니다." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "QR 코드를 생성하지 못했습니다." }, { status: 502 });
  }

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
