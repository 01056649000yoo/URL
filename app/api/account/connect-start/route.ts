import { NextResponse } from "next/server";
import { createConnectState, setConnectStateCookie } from "@/lib/connect-state";
import { getBaseUrl } from "@/lib/site-url";

// 샘링크.kr 에서 "아지트 계정으로 연결" 을 누를 때 먼저 부른다: 일회용 state 를 쿠키에 심고 돌려준다(lib/connect-state.ts).
// 바꾸는 요청(POST)이라 proxy.ts 의 같은 출처 검사를 거친다 — 남의 사이트가 대신 시작할 수 없다.
export async function POST(request: Request) {
  const state = createConnectState();
  // 운영에서는 정식 주소(SITE_URL)도 알려 준다 — 아지트는 정식 주소로만 돌아오므로, www·다른 주소에서 시작하면 쿠키가 달라 확인이 어긋난다.
  const origin = process.env.NODE_ENV === "production" ? getBaseUrl(request) : undefined;
  const response = NextResponse.json({ state, origin });
  setConnectStateCookie(response, state);
  return response;
}
