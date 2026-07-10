import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { useSecureCookies } from "@/lib/site-url";

export const DEVICE_COOKIE_NAME = "samlink_device_id";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function createDeviceId() {
  return `device_${randomUUID()}`;
}

export function getOrCreateDeviceId(request: NextRequest) {
  const existing = request.cookies.get(DEVICE_COOKIE_NAME)?.value?.trim();

  if (existing) {
    return {
      deviceId: existing,
      isNew: false,
    };
  }

  return {
    deviceId: createDeviceId(),
    isNew: true,
  };
}

export function setDeviceCookie(response: NextResponse, deviceId: string) {
  response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: useSecureCookies(),
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}
