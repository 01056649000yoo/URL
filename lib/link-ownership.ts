import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/account-session";

type AdminClient = ReturnType<typeof createAdminClient>;
type ViewerIds = Pick<Viewer, "deviceId" | "userId">;

// 링크를 관리할 수 있는 사람: 그 링크에 접근이 있는 기기, 또는 연결된 아지트 계정(2026-10-05).
// 주인(지우기 가능): 만든 기기(created_by) 또는 그 계정에서 만든 링크(is_owner).

export async function getAccessibleLinkIds(admin: AdminClient, viewer: ViewerIds) {
  const { data, error } = await admin
    .from("short_link_device_access")
    .select("link_id")
    .eq("device_id", viewer.deviceId)
    .limit(1000);
  if (error) throw error;
  const ids = new Set((data ?? []).map((row) => row.link_id as number));
  for (const id of (await getAccountAccess(admin, viewer.userId)).keys()) ids.add(id);
  return [...ids];
}

/** 계정 접근: link_id → is_owner */
export async function getAccountAccess(admin: AdminClient, userId: string | null) {
  const access = new Map<number, boolean>();
  if (!userId) return access;
  const { data, error } = await admin
    .from("short_link_account_access")
    .select("link_id, is_owner")
    .eq("user_id", userId)
    .limit(2000);
  if (error) throw error;
  for (const row of data ?? []) access.set(row.link_id as number, Boolean(row.is_owner));
  return access;
}

export async function getLinkAccess(admin: AdminClient, viewer: ViewerIds, link: { id: number; created_by: string | null }) {
  const { data, error } = await admin
    .from("short_link_device_access")
    .select("link_id")
    .eq("device_id", viewer.deviceId)
    .eq("link_id", link.id)
    .maybeSingle();
  if (error) throw error;
  const account = viewer.userId ? (await getAccountAccess(admin, viewer.userId)).get(link.id) : undefined;
  return {
    canManage: Boolean(data) || account !== undefined,
    isOwner: link.created_by === viewer.deviceId || account === true,
  };
}

export async function deviceCanManageLink(admin: AdminClient, viewer: ViewerIds, link: { id: number; created_by: string | null }) {
  return (await getLinkAccess(admin, viewer, link)).canManage;
}

/** 주인이 아닌 사람이 지우면 자기 목록에서만 뺀다(기기·계정 둘 다). */
export async function removeLinkAccess(admin: AdminClient, viewer: ViewerIds, linkId: number) {
  const { error } = await admin.from("short_link_device_access").delete().eq("link_id", linkId).eq("device_id", viewer.deviceId);
  if (error) throw error;
  if (viewer.userId) {
    const { error: accountError } = await admin.from("short_link_account_access").delete().eq("link_id", linkId).eq("user_id", viewer.userId);
    if (accountError) throw accountError;
  }
}

/** 이 기기에서 보던 링크를 계정으로 옮겨 담는다(처음 연결할 때, 그리고 연결된 채로 링크를 만들 때). */
export async function grantAccountAccess(admin: AdminClient, userId: string, links: { id: number; isOwner: boolean }[]) {
  if (!links.length) return;
  const { error } = await admin
    .from("short_link_account_access")
    .upsert(links.map((link) => ({ link_id: link.id, user_id: userId, is_owner: link.isOwner })), { onConflict: "link_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
  // 이미 있던 줄이라도 주인 표시는 올려 준다(목록에서 받은 링크를 나중에 내가 만든 기기로 연결한 경우).
  const owned = links.filter((link) => link.isOwner).map((link) => link.id);
  if (owned.length) {
    const { error: ownerError } = await admin.from("short_link_account_access").update({ is_owner: true }).eq("user_id", userId).in("link_id", owned);
    if (ownerError) throw ownerError;
  }
}
