import { NextResponse } from "next/server";

// 수호룡 퀴즈 아레나 입장용 짧은 주소(2026-11-05): 샘링크.kr/j/방코드 → 아레나 입장 화면.
// 방은 금방 사라지므로 링크를 저장하지 않고 바로 넘긴다. 한 칸짜리 링크(/j)와는 겹치지 않는다.
const ARENA_BASE_URL = "https://arena.xn--9y2br3k43n.kr";
const ROOM_CODE = /^[A-Za-z0-9]{4,8}$/;

type RouteContext = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  const target = ROOM_CODE.test(code) ? `${ARENA_BASE_URL}/j/${code.toUpperCase()}` : `${ARENA_BASE_URL}/`;
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
