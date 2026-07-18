import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getAccessibleLinkIds(admin: AdminClient, deviceId: string) {
  const { data, error } = await admin
    .from("short_link_device_access")
    .select("link_id")
    .eq("device_id", deviceId)
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => row.link_id as number);
}

export async function deviceCanManageLink(admin: AdminClient, deviceId: string, linkId: number) {
  const { data, error } = await admin
    .from("short_link_device_access")
    .select("link_id")
    .eq("device_id", deviceId)
    .eq("link_id", linkId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
