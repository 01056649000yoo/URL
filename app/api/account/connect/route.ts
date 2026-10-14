import { NextRequest, NextResponse } from "next/server";
import { redeemAndConnect } from "@/lib/account-connect";
import { clearConnectStateCookie, connectStateMatches, readConnectStateCookie } from "@/lib/connect-state";

// 샘링크.kr 에서 직접 누른 연결: 주소로 돌아온 state 가 이 브라우저 쿠키의 state 와 같아야 한다(lib/connect-state.ts).
// 남이 자기 연결표로 만든 `/connect#ticket=…` 주소를 열게 하는 공격은 이 브라우저에 맞는 state 가 없어 여기서 멈춘다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { ticket?: string; state?: string };
  if (!connectStateMatches(body.state, readConnectStateCookie(request))) {
    const rejected = NextResponse.json(
      { error: "이 브라우저에서 시작한 연결이 아니에요. 샘링크.kr 첫 화면에서 '아지트 계정으로 연결'을 다시 눌러 주세요. (www가 붙은 주소나 다른 주소에서 시작했다면 샘링크.kr 에서 다시 눌러 주세요.)" },
      { status: 403 },
    );
    clearConnectStateCookie(rejected);
    return rejected;
  }
  const response = await redeemAndConnect(request, body.ticket, clearConnectStateCookie);
  if (!response.ok) clearConnectStateCookie(response); // 실패해도 한 번 쓴 state 는 버린다
  return response;
}
