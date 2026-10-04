import { NextRequest, NextResponse } from "next/server";
import { readAccountSession } from "@/lib/account-session";

// 지금 이 브라우저가 아지트 선생님 계정에 연결돼 있는지(화면 표시용).
export async function GET(request: NextRequest) {
  const account = readAccountSession(request);
  return NextResponse.json(account ? { connected: true, displayName: account.displayName } : { connected: false });
}
