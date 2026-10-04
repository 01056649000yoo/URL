-- 2026-10-05 아지트 선생님 계정 연결. 기기(device) 접근과 나란히 계정(user_id) 접근을 둔다.
-- 연결표 발급·확인은 아지트 DB 함수(public.issue/redeem_samlink_connect_ticket_v1, 아지트 migration 20261368).
-- is_owner: 그 계정에서 만든 링크(기기 created_by 와 같은 뜻) — 지우기는 주인만, 남은 사람은 목록에서 빼기만.
create table if not exists samlink.short_link_account_access (
  link_id bigint not null references samlink.short_links(id) on delete cascade,
  user_id uuid not null,
  is_owner boolean not null default false,
  granted_at timestamptz not null default timezone('utc', now()),
  primary key (link_id, user_id)
);
create index if not exists short_link_account_access_user_idx on samlink.short_link_account_access(user_id);

alter table samlink.short_link_account_access enable row level security;
revoke all on samlink.short_link_account_access from public, anon, authenticated;
grant select, insert, update, delete on samlink.short_link_account_access to service_role;
