import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin";
import { useSecureCookies } from "@/lib/site-url";

type LoginPayload = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey || !adminEmail) {
      return NextResponse.json({ error: "인증 환경변수가 비어 있습니다." }, { status: 500 });
    }

    if (!email || !password) {
      return NextResponse.json({ error: "이메일과 비밀번호를 입력해 주세요." }, { status: 400 });
    }

    const supabase = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const signedInEmail = data.user.email?.trim().toLowerCase();
    if (signedInEmail !== adminEmail) {
      return NextResponse.json({ error: "관리자 계정이 아닙니다." }, { status: 403 });
    }

    const response = NextResponse.json({ email: data.user.email });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: data.session.access_token,
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies(),
      path: "/",
      maxAge: 60 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
