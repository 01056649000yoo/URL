import { NextResponse } from "next/server";
import { clearAccountSession } from "@/lib/account-session";

// 이 브라우저에서만 연결을 끊는다. 계정에 담긴 링크 목록은 그대로 남아 다른 기기·다시 연결할 때 보인다.
export async function POST() {
  const response = NextResponse.json({ connected: false });
  clearAccountSession(response);
  return response;
}
