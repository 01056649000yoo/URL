import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  void request;

  try {
    return NextResponse.json(
      {
        error: "자동 배포가 비활성화되어 있습니다. 서버에서 수동으로 배포해 주세요.",
      },
      { status: 410 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[GitHub Sync Webhook] Disabled endpoint error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
