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
