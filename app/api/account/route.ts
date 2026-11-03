import { NextRequest, NextResponse } from "next/server";
import { clearAccountSession, parseAccountSession, readAccountSession, setAccountSession } from "@/lib/account-session";
import { serverError } from "@/lib/api-error";

// 지금 이 브라우저가 아지트 선생님 계정에 연결돼 있는지(화면 표시용).
// 옛 쿠키(v1)는 여기서 같은 세션 id 의 v2 로 바꿔 준다(원래 만료보다 늘리지 않음).
export async function GET(request: NextRequest) {
  try {
    const account = await readAccountSession(request);
    if (!account) {
      const response = NextResponse.json({ connected: false });
      // 폐기된 세션 쿠키가 남아 있으면 지운다.
      if (parseAccountSession(request)) clearAccountSession(response);
      return response;
    }
    const response = NextResponse.json({ connected: true, displayName: account.displayName });
    if (account.legacy) setAccountSession(response, account, account.expires);
    return response;
  } catch (error) {
    return serverError(error, "account GET");
  }
}
