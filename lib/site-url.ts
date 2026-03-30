export function getBaseUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}
