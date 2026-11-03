import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { cookieSecret, getOrCreateDeviceId } from "@/lib/device-cookie";
import { useSecureCookies } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

// 아지트 선생님 계정 연결 세션(2026-10-05). 아지트가 준 1분짜리 연결표를 쌤링크 서버가
// 아지트 DB 함수로 바꿔 "누구인지(user_id)" 만 받고, 이 서명 쿠키에 담는다. 아지트 로그인 토큰은 들고 있지 않는다.
// 값(v2, 2026-11-03 KISA 점검): v2.<user_id>.<만료 초>.<세션 id>.<이름 base64url>.<서명>
//   세션 id 가 있어 '연결 해제' 때 서버에서 그 세션을 폐기한다(쿠키를 다른 곳에 복사해 둬도 못 쓴다). 기간은 90일.
// 옛 값(v1, 세션 id 없음)은 서명에서 고정 세션 id 를 뽑아 쓴다 — v1 도 폐기되고, /api/account 가 같은 id 의 v2 로 바꿔 준다
// (외부 검토 반영: 복사해 둔 v1 이 연결 해제 뒤에도 살아 있던 문제, 동시 교체 때 세션이 여러 개 생기던 문제).
export const ACCOUNT_COOKIE_NAME = "samlink_account";
const ACCOUNT_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{22}$/;

export type AccountSession = { userId: string; displayName: string; sessionId: string; expires: number; legacy?: boolean };

function sign(payload: string) {
  return createHmac("sha256", cookieSecret()).update(`account|${payload}`).digest("base64url");
}

function signatureMatches(payload: string, signature: string) {
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decodeName(name: string) {
  try {
    return Buffer.from(name, "base64url").toString("utf8").slice(0, 40) || "선생님";
  } catch {
    return "선생님";
  }
}

/** 쿠키 모양·서명·만료만 본다(폐기 여부는 readAccountSession 이 DB 로 확인). */
export function parseAccountSession(request: NextRequest): AccountSession | null {
  const value = request.cookies.get(ACCOUNT_COOKIE_NAME)?.value?.trim() ?? "";
  const parts = value.split(".");
  const now = Date.now();
  if (parts.length === 6 && parts[0] === "v2") {
    const [, userId, expires, sessionId, name, signature] = parts;
    if (!UUID.test(userId) || !/^\d+$/.test(expires) || Number(expires) * 1000 < now || !SESSION_ID.test(sessionId)) return null;
    if (!signatureMatches(`v2.${userId}.${expires}.${sessionId}.${name}`, signature)) return null;
    return { userId, displayName: decodeName(name), sessionId, expires: Number(expires) };
  }
  if (parts.length === 5 && parts[0] === "v1") {
    const [, userId, expires, name, signature] = parts;
    if (!UUID.test(userId) || !/^\d+$/.test(expires) || Number(expires) * 1000 < now) return null;
    if (!signatureMatches(`${userId}.${expires}.${name}`, signature)) return null;
    const sessionId = createHash("sha256").update(`samlink-v1-session|${signature}`).digest("base64url").slice(0, 22);
    return { userId, displayName: decodeName(name), sessionId, expires: Number(expires), legacy: true };
  }
  return null;
}

/** 연결된 계정 세션. 연결 해제로 폐기된 세션이면 null. 폐기 여부를 못 읽으면(DB 오류) 계정 없이 둔다 — 기기 기능은 계속 쓴다. */
export async function readAccountSession(request: NextRequest): Promise<AccountSession | null> {
  const session = parseAccountSession(request);
  if (!session) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("account_session_revocations")
      .select("session_id")
      .eq("session_id", session.sessionId)
      .maybeSingle();
    if (error) throw error;
    return data ? null : session;
  } catch (error) {
    console.error("[account-session] revocation check failed", error instanceof Error ? error.message.slice(0, 200) : "");
    return null;
  }
}

function cookieOptions(maxAge: number) {
  const secure = useSecureCookies();
  // 기기 쿠키와 같이 아지트 iframe 안에서도 실리도록 SameSite=None(로컬 HTTP 개발은 Lax).
  return { httpOnly: true, sameSite: secure ? ("none" as const) : ("lax" as const), secure, path: "/", maxAge };
}

/** 새 세션 쿠키(v2). expiresAt 을 주면 그때까지만(옛 v1 을 바꿀 때 원래 만료보다 늘리지 않는다). */
export function setAccountSession(
  response: NextResponse,
  session: { userId: string; displayName: string; sessionId?: string },
  expiresAt?: number,
) {
  const maxExpires = Math.floor(Date.now() / 1000) + ACCOUNT_MAX_AGE_SECONDS;
  const expires = Math.min(expiresAt ?? maxExpires, maxExpires);
  const sessionId = session.sessionId ?? randomBytes(16).toString("base64url");
  const name = Buffer.from(session.displayName.slice(0, 40), "utf8").toString("base64url");
  const payload = `v2.${session.userId}.${expires}.${sessionId}.${name}`;
  response.cookies.set(ACCOUNT_COOKIE_NAME, `${payload}.${sign(payload)}`, cookieOptions(Math.max(expires - Math.floor(Date.now() / 1000), 0)));
}

export function clearAccountSession(response: NextResponse) {
  response.cookies.set(ACCOUNT_COOKIE_NAME, "", cookieOptions(0));
}

/** 연결 해제: 이 세션을 서버에서 폐기한다(만료가 지난 폐기 기록은 함께 정리). */
export async function revokeAccountSession(session: AccountSession) {
  const admin = createAdminClient();
  const { error } = await admin.from("account_session_revocations").upsert(
    { session_id: session.sessionId, user_id: session.userId, expires_at: new Date(session.expires * 1000).toISOString() },
    { onConflict: "session_id" },
  );
  if (error) throw error;
  await admin.from("account_session_revocations").delete().lt("expires_at", new Date().toISOString());
}

/** 요청한 사람: 기기(늘 있음) + 연결된 아지트 계정(있으면, 폐기되지 않은 것). */
export async function getViewer(request: NextRequest) {
  const { deviceId, isNew } = getOrCreateDeviceId(request);
  const account = await readAccountSession(request);
  return { deviceId, isNewDevice: isNew, userId: account?.userId ?? null, account };
}

export type Viewer = Awaited<ReturnType<typeof getViewer>>;
