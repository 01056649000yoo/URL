import { randomBytes, timingSafeEqual } from "node:crypto";

// 계정 연결 확인표(state)의 순수 규칙 — Next·경로 별칭에 기대지 않아 node 로 바로 검사한다(tests/connect-state.test.mjs).
const STATE_PATTERN = /^[0-9a-f]{48}$/;

export function createConnectState() {
  return randomBytes(24).toString("hex");
}

export function isConnectState(value: unknown): value is string {
  return typeof value === "string" && STATE_PATTERN.test(value);
}

/** 주소로 돌아온 state 가 쿠키의 state 와 같은가(시간차 없이 비교). 둘 다 형식이 맞아야 한다. */
export function connectStateMatches(fromRequest: unknown, fromCookie: unknown) {
  if (!isConnectState(fromRequest) || !isConnectState(fromCookie)) return false;
  const a = Buffer.from(fromRequest);
  const b = Buffer.from(fromCookie);
  return a.length === b.length && timingSafeEqual(a, b);
}
