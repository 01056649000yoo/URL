import { NextResponse } from "next/server";
import { createConnectState, setConnectStateCookie } from "@/lib/connect-state";

// 샘링크.kr 에서 "아지트 계정으로 연결" 을 누를 때 먼저 부른다: 일회용 state 를 쿠키에 심고 돌려준다(lib/connect-state.ts).
// 바꾸는 요청(POST)이라 proxy.ts 의 같은 출처 검사를 거친다 — 남의 사이트가 대신 시작할 수 없다.
export async function POST() {
  const state = createConnectState();
  const response = NextResponse.json({ state });
  setConnectStateCookie(response, state);
  return response;
}
