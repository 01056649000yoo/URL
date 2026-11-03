-- 2026-11-03 KISA 점검 반영.
-- 1) 계정 연결 해제 때 그 세션(쿠키 속 세션 id)을 서버에서 폐기한다. 만료가 지난 줄은 연결 해제 때 함께 지운다.
create table if not exists samlink.account_session_revocations (
  session_id text primary key check (session_id ~ '^[A-Za-z0-9_-]{22}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  revoked_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);
create index if not exists account_session_revocations_expires_idx on samlink.account_session_revocations(expires_at);
alter table samlink.account_session_revocations enable row level security;
revoke all on samlink.account_session_revocations from public, anon, authenticated;
grant select, insert, update, delete on samlink.account_session_revocations to service_role;

-- 2) 방어 겹치기: samlink 표는 서버(service_role)만 쓴다. 브라우저 역할(anon·authenticated)에 남은 표 권한을 거둔다.
--    (지금도 RLS 정책이 없어 읽기 [] · 쓰기 거절이지만, RLS 하나에만 기대지 않게)
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'samlink' and c.relkind in ('r', 'v', 'm', 'p')
  loop
    execute format('revoke all on samlink.%I from anon, authenticated', t.relname);
  end loop;
end $$;
alter default privileges in schema samlink revoke all on tables from anon, authenticated;
