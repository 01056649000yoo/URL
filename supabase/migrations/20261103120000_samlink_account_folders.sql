-- 2026-11-03 링크 폴더 구성을 아지트 계정에 저장한다(다른 기기에서도 같은 폴더).
-- 계정 하나에 한 줄: folders = [{id, name, slugs[]}] (정리 규칙은 lib/link-folders.ts, 서버 API 가 정리해서 넣는다).
-- version: 저장할 때마다 1씩 올린다. 서버 API 는 "읽었던 version 과 같을 때만" 바꿔서
-- 두 기기·두 탭이 동시에 고쳐도 한쪽이 몰래 덮어쓰지 않게 한다(외부 검토 반영).
-- 접근은 서버(service_role)만. 아지트 계정을 지우면 함께 지운다.
create table if not exists samlink.account_link_folders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  folders jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_link_folders_shape check (jsonb_typeof(folders) = 'array' and octet_length(folders::text) <= 262144)
);

alter table samlink.account_link_folders enable row level security;
revoke all on samlink.account_link_folders from public, anon, authenticated;
grant select, insert, update, delete on samlink.account_link_folders to service_role;
