// 링크 폴더 구성(이름·담긴 링크)을 아지트 계정에 저장할 때 쓰는 규칙(2026-11-03).
// 서버(app/api/my-links/folders)와 화면(app/page.tsx)이 같은 정리·합치기 규칙을 쓴다.
// Next 에 기대지 않아 node 로 바로 검사할 수 있다(tests/link-folders.test.mjs).

export type LinkFolder = { id: string; name: string; slugs: string[] };

export const MAX_FOLDERS = 50;
export const MAX_FOLDER_NAME = 30;
export const MAX_SLUGS_PER_FOLDER = 500;
const MAX_SLUG_LENGTH = 64;
const FOLDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** 믿을 수 없는 값(요청 본문·브라우저 저장)을 폴더 목록으로 정리한다. 모양이 틀린 것은 버린다. */
export function sanitizeFolders(value: unknown): LinkFolder[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const folders: LinkFolder[] = [];
  for (const item of value) {
    if (folders.length >= MAX_FOLDERS) break;
    if (!item || typeof item !== "object") continue;
    const raw = item as { id?: unknown; name?: unknown; slugs?: unknown };
    if (typeof raw.id !== "string" || !FOLDER_ID.test(raw.id) || seenIds.has(raw.id)) continue;
    if (typeof raw.name !== "string") continue;
    const name = raw.name.trim().slice(0, MAX_FOLDER_NAME) || "이름 없는 폴더";
    const slugs: string[] = [];
    if (Array.isArray(raw.slugs)) {
      for (const slug of raw.slugs) {
        if (slugs.length >= MAX_SLUGS_PER_FOLDER) break;
        if (typeof slug !== "string") continue;
        const clean = slug.trim().normalize("NFC");
        // 링크 하나는 폴더 하나에만 — 먼저 나온 폴더가 가진다.
        if (!clean || clean.length > MAX_SLUG_LENGTH || seenSlugs.has(clean)) continue;
        seenSlugs.add(clean);
        slugs.push(clean);
      }
    }
    seenIds.add(raw.id);
    folders.push({ id: raw.id, name, slugs });
  }
  return folders;
}

/**
 * 계정에 저장된 폴더와 이 브라우저의 폴더를 합친다.
 * 같은 폴더(id)는 계정 쪽 이름을 쓰고 링크는 합친다. 이 브라우저에만 있던 폴더는 뒤에 붙인다.
 */
export function mergeFolders(account: LinkFolder[], local: LinkFolder[]): LinkFolder[] {
  const merged = account.map((folder) => ({ ...folder, slugs: [...folder.slugs] }));
  const byId = new Map(merged.map((folder) => [folder.id, folder]));
  for (const folder of local) {
    const existing = byId.get(folder.id);
    if (existing) {
      for (const slug of folder.slugs) if (!existing.slugs.includes(slug)) existing.slugs.push(slug);
    } else {
      const copy = { ...folder, slugs: [...folder.slugs] };
      merged.push(copy);
      byId.set(copy.id, copy);
    }
  }
  return sanitizeFolders(merged);
}

/**
 * 3방향 합치기: base(마지막으로 계정과 맞춘 상태)에서 mine(이 브라우저)과 theirs(계정 최신)가 각각 바꾼 것을 함께 살린다.
 * - 폴더: 한쪽이 새로 만든 것은 남기고, 한쪽이 지운 것은 지운다. 이름은 이 브라우저가 바꿨으면 그것, 아니면 계정 것.
 * - 링크 위치: 이 브라우저가 옮겼으면 그 자리, 아니면 계정 쪽 자리(없으면 미분류).
 */
export function rebaseFolders(base: LinkFolder[], mine: LinkFolder[], theirs: LinkFolder[]): LinkFolder[] {
  const b = new Map(base.map((folder) => [folder.id, folder]));
  const m = new Map(mine.map((folder) => [folder.id, folder]));
  const t = new Map(theirs.map((folder) => [folder.id, folder]));
  const ids: string[] = [];
  for (const folder of [...theirs, ...mine]) if (!ids.includes(folder.id)) ids.push(folder.id);
  const result: LinkFolder[] = [];
  for (const id of ids) {
    const inBase = b.has(id);
    const inMine = m.has(id);
    const inTheirs = t.has(id);
    const keep = inMine && inTheirs ? true : inMine || inTheirs ? !inBase : false;
    if (!keep) continue;
    const baseName = b.get(id)?.name;
    const mineName = m.get(id)?.name;
    const name = mineName !== undefined && mineName !== baseName ? mineName : (t.get(id)?.name ?? mineName ?? "이름 없는 폴더");
    result.push({ id, name, slugs: [] });
  }
  const where = (folders: LinkFolder[]) => {
    const map = new Map<string, string>();
    for (const folder of folders) for (const slug of folder.slugs) if (!map.has(slug)) map.set(slug, folder.id);
    return map;
  };
  const lb = where(base);
  const lm = where(mine);
  const lt = where(theirs);
  const byId = new Map(result.map((folder) => [folder.id, folder]));
  const order: string[] = [];
  for (const slug of [...lt.keys(), ...lm.keys(), ...lb.keys()]) if (!order.includes(slug)) order.push(slug);
  for (const slug of order) {
    const target = lm.get(slug) !== lb.get(slug) ? lm.get(slug) : lt.get(slug);
    if (target) byId.get(target)?.slugs.push(slug);
  }
  return sanitizeFolders(result);
}

/**
 * 계정에 연결됐을 때 이 브라우저가 쓸 폴더를 정한다(외부 검토 반영 — 지운 폴더 부활·옮긴 링크 되돌림·계정 섞임·저장 실패 유실 방지).
 * - 같은 계정과 맞춰 본 브라우저: 마지막으로 맞춘 상태(localBase) 이후 이 브라우저가 바꾼 것만 계정 최신 위에 다시 얹는다.
 *   맞춘 뒤 바꾼 게 없으면 계정 것 그대로(다른 기기에서 지운 폴더가 되살아나지 않는다).
 * - 처음 연결한 브라우저: 계정 것에 이 브라우저 폴더를 한 번 합친다.
 * - 다른 계정과 맞춰 본 폴더: 섞지 않고 계정 것만 쓴다.
 */
export function planFolderSync(input: {
  accountFolders: LinkFolder[];
  accountVersion: number;
  accountKey: string;
  localFolders: LinkFolder[];
  localOwner: string | null;
  localBase?: LinkFolder[] | null;
}) {
  const { accountVersion, accountKey, localOwner } = input;
  const accountFolders = sanitizeFolders(input.accountFolders);
  const local = sanitizeFolders(input.localFolders);
  let next: LinkFolder[];
  if (localOwner && localOwner !== accountKey) next = accountVersion > 0 ? accountFolders : [];
  else if (localOwner === accountKey) {
    if (accountVersion === 0) next = local;
    else next = input.localBase ? rebaseFolders(sanitizeFolders(input.localBase), local, accountFolders) : accountFolders;
  } else next = accountVersion > 0 ? mergeFolders(accountFolders, local) : local;
  next = sanitizeFolders(next);
  const needsPush = JSON.stringify(next) !== JSON.stringify(accountFolders) && (accountVersion > 0 || next.length > 0);
  return { next, needsPush };
}
