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

  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}
