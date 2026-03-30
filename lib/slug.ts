const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const DEFAULT_SLUG_LENGTH = 4;

export function normalizeSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new Error("slug 형식이 올바르지 않습니다.");
  }

  return normalized;
}

export function generateSlug(length = DEFAULT_SLUG_LENGTH) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ALPHABET.length);
    output += ALPHABET[randomIndex];
  }
  return output;
}
