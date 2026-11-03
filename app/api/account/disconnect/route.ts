import { NextRequest, NextResponse } from "next/server";
import { clearAccountSession, parseAccountSession, revokeAccountSession } from "@/lib/account-session";
import { serverError } from "@/lib/api-error";

// 이 브라우저에서만 연결을 끊는다. 계정에 담긴 링크 목록은 그대로 남아 다른 기기·다시 연결할 때 보인다.
// 이 세션은 서버에서도 폐기한다(2026-11-03 KISA 점검) — 쿠키를 복사해 둔 곳이 있어도 더는 계정으로 인정되지 않는다.
export async function POST(request: NextRequest) {
  try {
    const session = parseAccountSession(request);
    if (session) await revokeAccountSession(session);
    const response = NextResponse.json({ connected: false });
    clearAccountSession(response);
    return response;
  } catch (error) {
    return serverError(error, "account disconnect");
  }
}
