import { NextResponse } from "next/server";
import { domainToUnicode } from "node:url";
import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/site-url";

const MAX_DATA_LENGTH = 2048;

function sanitizeSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 360;
  return Math.min(Math.max(parsed, 120), 1400);
}

// 이 서비스가 임의 데이터 QR 생성기로 남용되지 않도록
// 자체 단축 URL만 QR 생성 대상으로 허용합니다.
// SITE_URL 외에 지금 접속 중인 호스트(localhost·내부 IP)도 자기 주소로 인정해
// 맥미니 로컬 화면이나 LAN 접속에서도 QR이 나오도록 합니다.
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

  const allowedHosts = new Set<string>();
  try {
    const siteHost = new URL(getBaseUrl(request)).hostname;
    allowedHosts.add(domainToUnicode(siteHost) || siteHost);
  } catch {
    // SITE_URL이 잘못돼도 요청 호스트 기준 검증은 계속합니다.
  }
  try {
    const requestHost = new URL(request.url).hostname;
    allowedHosts.add(domainToUnicode(requestHost) || requestHost);
  } catch {
    // 요청 URL 파싱 실패 시 SITE_URL 기준만 사용합니다.
  }

  if (!allowedHosts.size) {
    return false;
  }

  const targetHost = domainToUnicode(target.hostname) || target.hostname;
  return allowedHosts.has(targetHost);
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
  // 기존 외부 API는 margin을 px로 받았으므로 모듈 단위(약 1/10)로 환산해 호환을 유지합니다.
  const marginPx = Math.min(Math.max(Number.parseInt(url.searchParams.get("margin") ?? "10", 10) || 10, 0), 40);
  const margin = Math.max(Math.round(marginPx / 10), 0);

  let png: Buffer;
  try {
    png = await QRCode.toBuffer(data, {
      type: "png",
      width: size,
      margin,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch {
    return NextResponse.json({ error: "QR 코드를 생성하지 못했습니다." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
