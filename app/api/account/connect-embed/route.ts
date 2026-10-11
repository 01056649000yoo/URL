import { NextRequest } from "next/server";
import { redeemAndConnect } from "@/lib/account-connect";

// 아지트 안(iframe) 자동 연결: 화면이 부모 창(아지트 출처)이 보낸 메시지의 연결표만 여기로 보낸다(account-bar.tsx).
// 샘링크.kr 직접 연결(/api/account/connect)과 달리 state 를 쓰지 않는다 — 남의 사이트가 자기 화면에 샘링크를 끼워 넣어도
// 부모 출처가 아지트가 아니라 메시지를 받지 않는다. 이 길은 /connect 화면에서 부르지 않는다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { ticket?: string };
  return redeemAndConnect(request, body.ticket);
}
