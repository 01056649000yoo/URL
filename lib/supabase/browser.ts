import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase 환경변수가 비어 있습니다.");
  }

  return createClient(url, anonKey);
}
