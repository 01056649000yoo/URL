// 다른 사이트가 방문자 브라우저를 빌려 보내는 바꾸는 요청(CSRF)을 가려내는 판정(2026-10-11 분리).
// proxy.ts 가 부른다. Next 에 기대지 않아 node 로 바로 검사할 수 있다(tests/cross-site.test.mjs).

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type CrossSiteInput = {
  method: string;
  /** 소문자 헤더 이름 → 값 */
  header: (name: string) => string | null;
  /** 이 요청이 도착한 호스트(들)와 SITE_URL 의 호스트 — www 는 같은 곳으로 본다 */
  allowedHosts: Set<string>;
};

export function siteHost(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function originAllowed(origin: string | null, allowedHosts: Set<string>) {
  if (!origin || origin === "null") return false;
  try {
    return allowedHosts.has(siteHost(new URL(origin).hostname));
  } catch {
    return false;
  }
}

/**
 * 막아야 하면 true.
 * - same-origin: 샘링크 자기 화면(http·https·www 포함)에서 온 것 — 통과
 * - same-site: 같은 사이트의 **다른 하위 주소**(예: app.샘링크.kr)도 여기 들어온다. 그 주소가 뚫리면 방문자 쿠키(SameSite=None)로
 *   변경 요청을 보낼 수 있어서, Origin 이 샘링크 자기 호스트일 때만 통과(2026-10-11 Codex 독립 검토 지적을 재현해 고침)
 * - cross-site·none: 막음
 * - Sec-Fetch-Site 가 없으면(옛 브라우저·서버 간 호출): Origin 이 있으면 호스트 비교, 둘 다 없으면 서버 간 호출(만료 정리 curl)이라 통과
 */
export function isCrossSiteRequest({ method, header, allowedHosts }: CrossSiteInput) {
  if (SAFE_METHODS.has(method)) return false;

  const fetchSite = header("sec-fetch-site");
  const origin = header("origin");
  if (fetchSite) {
    if (fetchSite === "same-origin") return false;
    if (fetchSite === "same-site") return !originAllowed(origin, allowedHosts);
    return true;
  }

  if (origin && origin !== "null") return !originAllowed(origin, allowedHosts);
  return origin === "null";
}
