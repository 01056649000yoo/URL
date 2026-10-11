import { NextResponse } from "next/server";

// 서버 오류 응답(2026-10-11 보안 점검): DB 오류 문구(표·칸 이름 등)를 방문자에게 그대로 보내지 않는다.
// 자세한 내용은 서버 기록에만 남기고 응답은 일반 문구로 준다.
export function serverError(error: unknown, where: string) {
  const detail = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  console.error(`[${where}]`, detail.slice(0, 300));
  return NextResponse.json({ error: "서버 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
}
