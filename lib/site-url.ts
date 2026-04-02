import { domainToUnicode } from "node:url";

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  const hostname = domainToUnicode(parsed.hostname) || parsed.hostname;
  return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
}

export function getBaseUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return normalizeUrl(configured.replace(/\/$/, ""));
  }

  if (request) {
    return normalizeUrl(new URL(request.url).origin);
  }

  return "http://localhost:3000";
}
