import { NextRequest, NextResponse } from "next/server";
import { domainToUnicode } from "node:url";
import { getOrCreateDeviceId, setDeviceCookie } from "@/lib/device-cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/site-url";

function toDisplayUrl(shortUrl: string) {
  try {
    const parsed = new URL(shortUrl);
    const unicodeHost = domainToUnicode(parsed.hostname) || parsed.hostname;
    return `${parsed.protocol}//${unicodeHost}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return shortUrl;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { deviceId } = getOrCreateDeviceId(request);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("short_links")
      .select("slug, destination, expires_at, is_active, created_at")
      .eq("created_by", deviceId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const baseUrl = getBaseUrl(request);
    const links = (data ?? []).map((link) => {
      const shortUrl = `${baseUrl}/${link.slug}`;
      return {
        slug: link.slug,
        destination: link.destination,
        shortUrl,
        displayShortUrl: toDisplayUrl(shortUrl),
        expiresAt: link.expires_at,
        isActive: link.is_active,
        createdAt: link.created_at,
      };
    });

    const response = NextResponse.json({ links });
    setDeviceCookie(response, deviceId);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
