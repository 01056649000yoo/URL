import { createHash } from "node:crypto";

function pickClientIp(request: Request) {
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    return "unknown";
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const connectingIp = request.headers.get("cf-connecting-ip");
  const vercelIp = request.headers.get("x-vercel-forwarded-for");

  const raw = connectingIp ?? vercelIp ?? realIp ?? forwardedFor ?? "unknown";
  return raw.split(",")[0]?.trim() || "unknown";
}

export function getRateLimitKey(request: Request) {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-rate-limit-v1";
  const ip = pickClientIp(request);

  // User-Agent를 키에 섞으면 UA만 바꿔 제한을 우회할 수 있으므로 IP만 사용합니다.
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

// 학교처럼 여러 사용자가 공인 IP 하나를 공유하는 환경을 위해
// 기기 쿠키 기준의 세부 한도를 IP 한도와 별도로 적용합니다.
export function getDeviceRateLimitKey(deviceId: string) {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-rate-limit-v1";
  return createHash("sha256").update(`device|${deviceId}|${salt}`).digest("hex");
}
