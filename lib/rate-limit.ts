import { createHash } from "node:crypto";

function pickClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const connectingIp = request.headers.get("cf-connecting-ip");
  const vercelIp = request.headers.get("x-vercel-forwarded-for");

  const raw = forwardedFor ?? realIp ?? connectingIp ?? vercelIp ?? "unknown";
  return raw.split(",")[0]?.trim() || "unknown";
}

export function getRateLimitKey(request: Request) {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-rate-limit-v1";
  const ip = pickClientIp(request);

  // User-Agent를 키에 섞으면 UA만 바꿔 제한을 우회할 수 있으므로 IP만 사용합니다.
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}
