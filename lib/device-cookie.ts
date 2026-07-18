import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { useSecureCookies } from "@/lib/site-url";

export const DEVICE_COOKIE_NAME = "samlink_device_id";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function createDeviceId() {
  return `device_${randomUUID()}`;
}

function cookieSecret() {
  const secret = process.env.DEVICE_COOKIE_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Device cookie signing secret is not configured.");
  return secret;
}

function signDeviceId(deviceId: string) {
  return createHmac("sha256", cookieSecret()).update(deviceId).digest("base64url");
}

function encodeDeviceCookie(deviceId: string) {
  return `v1.${deviceId}.${signDeviceId(deviceId)}`;
}

function readSignedDeviceId(value: string) {
  const match = /^v1\.(device_[0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const [, deviceId, signature] = match;
  const expected = signDeviceId(deviceId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return deviceId;
}

export function getOrCreateDeviceId(request: NextRequest) {
  const existing = request.cookies.get(DEVICE_COOKIE_NAME)?.value?.trim() ?? "";
  const signedDeviceId = readSignedDeviceId(existing);

  if (signedDeviceId) {
    return {
      deviceId: signedDeviceId,
      isNew: false,
    };
  }

  // 기존 브라우저의 UUID 쿠키는 권한을 유지한 채 다음 응답에서 서명 쿠키로 교체합니다.
  if (/^device_[0-9a-f-]{36}$/.test(existing)) return { deviceId: existing, isNew: false };

  return {
    deviceId: createDeviceId(),
    isNew: true,
  };
}

export function setDeviceCookie(response: NextResponse, deviceId: string) {
  response.cookies.set(DEVICE_COOKIE_NAME, encodeDeviceCookie(deviceId), {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookies(),
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
