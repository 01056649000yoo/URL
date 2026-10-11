import type { NextRequest, NextResponse } from "next/server";
import { useSecureCookies } from "@/lib/site-url";

// 샘링크.kr 에서 직접 누르는 "아지트 계정으로 연결" 확인 장치(2026-10-11 보안 점검, 계정 연결 CSRF).
// 전에는 `/connect#ticket=` 만 있으면 곧바로 연결돼서, 남이 자기 연결표로 만든 주소를 열게 하면 내 기기의 링크가
// 그 사람 계정으로 넘어갔다. 이제 연결을 누를 때 서버가 일회용 state 를 만들어 **HttpOnly 쿠키**와 주소에 함께 넣고,
// 돌아온 /connect 가 둘이 같을 때만 연결한다 — 남이 만든 주소에는 내 브라우저의 쿠키 값이 없다.
export const CONNECT_STATE_COOKIE = "samlink_connect_state";
const STATE_MAX_AGE_SECONDS = 10 * 60;

export { connectStateMatches, createConnectState, isConnectState } from "@/lib/connect-state-core";

export function readConnectStateCookie(request: NextRequest) {
  return request.cookies.get(CONNECT_STATE_COOKIE)?.value ?? "";
}

function options(maxAge: number) {
  // Strict: 연결은 샘링크 자기 화면(/connect)에서 보내는 요청이라 같은 사이트 안에서만 쿠키가 실리면 된다.
  return { httpOnly: true, sameSite: "strict" as const, secure: useSecureCookies(), path: "/api/account", maxAge };
}

export function setConnectStateCookie(response: NextResponse, state: string) {
  response.cookies.set(CONNECT_STATE_COOKIE, state, options(STATE_MAX_AGE_SECONDS));
}

/** 한 번 쓰면 지운다(재사용 금지). */
export function clearConnectStateCookie(response: NextResponse) {
  response.cookies.set(CONNECT_STATE_COOKIE, "", options(0));
}
