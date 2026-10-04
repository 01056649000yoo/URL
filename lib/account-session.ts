import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { cookieSecret, getOrCreateDeviceId } from "@/lib/device-cookie";
import { useSecureCookies } from "@/lib/site-url";

// 아지트 선생님 계정 연결 세션(2026-10-05). 아지트가 준 1분짜리 연결표를 쌤링크 서버가
// 아지트 DB 함수로 바꿔 "누구인지(user_id)" 만 받고, 이 서명 쿠키에 담는다. 아지트 로그인 토큰은 들고 있지 않는다.
// 값: v1.<user_id>.<만료 초>.<이름 base64url>.<서명>
export const ACCOUNT_COOKIE_NAME = "samlink_account";
const ACCOUNT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AccountSession = { userId: string; displayName: string };

function sign(payload: string) {
  return createHmac("sha256", cookieSecret()).update(`account|${payload}`).digest("base64url");
}

export function readAccountSession(request: NextRequest): AccountSession | null {
  const value = request.cookies.get(ACCOUNT_COOKIE_NAME)?.value?.trim() ?? "";
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const [, userId, expires, name, signature] = parts;
  if (!UUID.test(userId) || !/^\d+$/.test(expires) || Number(expires) * 1000 < Date.now()) return null;
  const expected = Buffer.from(sign(`${userId}.${expires}.${name}`));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let displayName = "선생님";
  try {
    displayName = Buffer.from(name, "base64url").toString("utf8").slice(0, 40) || "선생님";
  } catch {
    // 이름을 못 읽어도 연결은 유지한다.
  }
  return { userId, displayName };
}

function cookieOptions(maxAge: number) {
  const secure = useSecureCookies();
  // 기기 쿠키와 같이 아지트 iframe 안에서도 실리도록 SameSite=None(로컬 HTTP 개발은 Lax).
  return { httpOnly: true, sameSite: secure ? ("none" as const) : ("lax" as const), secure, path: "/", maxAge };
}

export function setAccountSession(response: NextResponse, session: AccountSession) {
  const expires = Math.floor(Date.now() / 1000) + ACCOUNT_MAX_AGE_SECONDS;
  const name = Buffer.from(session.displayName.slice(0, 40), "utf8").toString("base64url");
  const payload = `${session.userId}.${expires}.${name}`;
  response.cookies.set(ACCOUNT_COOKIE_NAME, `v1.${payload}.${sign(payload)}`, cookieOptions(ACCOUNT_MAX_AGE_SECONDS));
}

export function clearAccountSession(response: NextResponse) {
  response.cookies.set(ACCOUNT_COOKIE_NAME, "", cookieOptions(0));
}

/** 요청한 사람: 기기(늘 있음) + 연결된 아지트 계정(있으면). */
export function getViewer(request: NextRequest) {
  const { deviceId, isNew } = getOrCreateDeviceId(request);
  const account = readAccountSession(request);
  return { deviceId, isNewDevice: isNew, userId: account?.userId ?? null, account };
}

export type Viewer = ReturnType<typeof getViewer>;
