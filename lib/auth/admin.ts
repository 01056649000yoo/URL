import { createClient } from "@supabase/supabase-js";

export const ADMIN_SESSION_COOKIE = "samlink_admin_session";

function getCookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const pair = cookies
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}

export async function requireAdminUser(request: Request) {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!url || !anonKey) {
    throw new Error("Supabase 환경변수가 비어 있습니다.");
  }

  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL 이 설정되지 않았습니다.");
  }

  const headerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = headerToken || getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token) {
    throw new Error("로그인이 필요합니다.");
  }

  const supabase = createClient(url, anonKey, {
  // 2026-08-28 샘링크를 아지트 스택으로 옮겼다. 자료는 아지트 DB 의 `samlink` 스키마에 있다.
  // 여기서 한 번 지정하면 `.from(...)`·`.rpc(...)` 호출부는 고치지 않아도 된다.
  db: { schema: "samlink" },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("인증에 실패했습니다.");
  }

  const email = data.user.email?.trim().toLowerCase();
  if (email !== adminEmail) {
    throw new Error("관리자 계정이 아닙니다.");
  }

  return data.user;
}
