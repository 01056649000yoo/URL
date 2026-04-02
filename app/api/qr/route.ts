import { NextResponse } from "next/server";

function sanitizeSize(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 360;
  return Math.min(Math.max(parsed, 120), 1400);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = url.searchParams.get("data");

  if (!data) {
    return NextResponse.json({ error: "QR 코드 데이터를 찾을 수 없습니다." }, { status: 400 });
  }

  const size = sanitizeSize(url.searchParams.get("size"));
  const margin = Math.min(Math.max(Number.parseInt(url.searchParams.get("margin") ?? "10", 10) || 10, 0), 40);
  const remoteUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=${margin}&data=${encodeURIComponent(data)}`;

  const response = await fetch(remoteUrl, {
    headers: {
      accept: "image/png,image/*;q=0.9,*/*;q=0.8",
    },
  });

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
