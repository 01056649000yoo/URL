import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase 환경변수가 비어 있습니다.");
  }

  return createClient(url, serviceRoleKey, {
  // 2026-08-28 샘링크를 아지트 스택으로 옮겼다. 자료는 아지트 DB 의 `samlink` 스키마에 있다.
  // 여기서 한 번 지정하면 `.from(...)`·`.rpc(...)` 호출부는 고치지 않아도 된다.
  db: { schema: "samlink" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
