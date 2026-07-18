import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const DEFAULT_SLUG_LENGTH = 4;
const MAX_SLUG_LENGTH = 30;

// 앱 라우트·정적 파일과 겹치는 이름은 링크가 만들어져도 절대 접속할 수 없으므로 생성 단계에서 거부합니다.
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "b",
  "present",
  "expired",
  "_next",
  "assets",
  "public",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
]);

export function isReservedSlug(value: string) {
  return RESERVED_SLUGS.has(value.toLowerCase());
}

// URL 경로로 들어온 슬러그는 인코딩·유니코드 정규화 상태가 제각각이므로
// 조회 전에 반드시 같은 형태(NFC)로 맞춥니다.
export function decodeSlugParam(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 잘못된 인코딩이면 원본 그대로 조회합니다.
  }
  return decoded.normalize("NFC");
}

export function normalizeSlug(value: string) {
  const normalized = value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized || normalized.length > MAX_SLUG_LENGTH) {
    throw new Error("slug 형식이 올바르지 않습니다.");
  }

  return normalized;
}

export function generateSlug(length = DEFAULT_SLUG_LENGTH) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += ALPHABET[randomInt(ALPHABET.length)];
  }
  return output;
}
