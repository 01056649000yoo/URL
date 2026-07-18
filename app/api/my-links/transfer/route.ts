import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { getDeviceRateLimitKey, getRateLimitKey } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

function hashCode(code: string) {
  const salt = process.env.RATE_LIMIT_SALT?.trim() || "samlink-transfer-v1";
  return createHash("sha256").update(`${code}|${salt}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const { deviceId } = getOrCreateDeviceId(request);
    const deviceResponse = (body: Record<string, unknown>, init?: ResponseInit) => {
      const response = NextResponse.json(body, init);
      setDeviceCookie(response, deviceId);
      return response;
    };
    const body = (await request.json()) as { code?: string };
    const code = body.code?.replace(/\D/g, "") ?? "";
    if (code.length !== 6) {
      return deviceResponse({ error: "6자리 이전 코드를 입력해 주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: rateData, error: rateError } = await admin.rpc("consume_short_link_rate_limit", {
      p_ip_hash: `transfer:${getRateLimitKey(request)}`,
      p_device_hash: `transfer:${getDeviceRateLimitKey(deviceId)}`,
    });
    if (rateError) throw rateError;
    const rateLimit = Array.isArray(rateData) ? rateData[0] : rateData;
    if (!rateLimit?.allowed) {
      return deviceResponse({ error: "코드를 너무 자주 확인했습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    }

    const { data, error } = await admin.rpc("claim_device_link_transfer", {
      p_code_hash: hashCode(code),
      p_target_device_id: deviceId,
    });
    if (error) throw error;

    const result = data as {
      status?: string;
      moved_count?: number;
      folders?: { id: string; name: string; slugs: string[] }[];
      moved_slugs?: string[];
    } | null;
    if (result?.status === "invalid") return deviceResponse({ error: "코드가 틀렸거나, 이미 한 번 사용했거나, 10분이 지났습니다. 기존 기기에서 새 코드를 만들어 주세요." }, { status: 400 });
    if (result?.status === "same_device") return deviceResponse({ error: "같은 브라우저로는 옮길 수 없습니다." }, { status: 400 });
    if (result?.status !== "ok") throw new Error("이전 결과를 확인하지 못했습니다.");

    return deviceResponse({
      movedCount: Math.max(Number(result.moved_count ?? 0), 0),
      folders: Array.isArray(result.folders) ? result.folders : [],
      movedSlugs: Array.isArray(result.moved_slugs) ? result.moved_slugs : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
