import { NextResponse } from "next/server";
import { AdminAuthError } from "@/lib/auth/admin";

// 서버 오류 응답(2026-10-11 보안 점검): DB 오류 문구(표·칸 이름 등)를 방문자에게 그대로 보내지 않는다.
// 자세한 내용은 서버 기록에만 남기고 응답은 일반 문구로 준다.
/** 관리자 API: 인증 실패는 401 과 그 문구, 나머지는 일반 문구(2026-11-03 KISA 점검 — 내부 오류 문구 노출 막기). */
export function adminRouteError(error: unknown, where: string) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  return serverError(error, where);
}

export function serverError(error: unknown, where: string) {
  const detail = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  console.error(`[${where}]`, detail.slice(0, 300));
  return NextResponse.json({ error: "서버 오류가 발생했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
}
