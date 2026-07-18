create table if not exists public.short_links (
  id bigint generated always as identity primary key,
  slug text not null unique,
  destination text not null,
  created_by text,
  expires_at timestamptz,
  click_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.short_links
add column if not exists expires_at timestamptz;

-- 링크 묶음(수업 세트): null이면 일반 링크, 값이 있으면 {"title", "items":[{"label","url"}]}
alter table public.short_links
add column if not exists bundle_items jsonb;

alter table public.short_links
add column if not exists display_label text;

create table if not exists public.device_link_transfer_codes (
  code_hash text primary key,
  source_device_id text not null,
  folder_state jsonb not null default '[]'::jsonb,
  link_slugs text[] not null default '{}'::text[],
  claimed_device_id text,
  claimed_at timestamptz,
  moved_count integer,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_link_transfer_codes_expires_at_idx
on public.device_link_transfer_codes (expires_at);

alter table public.device_link_transfer_codes enable row level security;

create table if not exists public.short_link_device_access (
  link_id bigint not null references public.short_links(id) on delete cascade,
  device_id text not null,
  granted_at timestamptz not null default timezone('utc', now()),
  primary key (link_id, device_id)
);

create index if not exists short_link_device_access_device_idx
on public.short_link_device_access(device_id, granted_at desc);

alter table public.short_link_device_access enable row level security;

insert into public.short_link_device_access(link_id, device_id)
select id, created_by from public.short_links where created_by is not null
on conflict do nothing;

alter table public.device_link_transfer_codes
add column if not exists folder_state jsonb not null default '[]'::jsonb;

alter table public.device_link_transfer_codes
add column if not exists link_slugs text[] not null default '{}'::text[];

alter table public.device_link_transfer_codes
add column if not exists claimed_device_id text,
add column if not exists claimed_at timestamptz,
add column if not exists moved_count integer;

create index if not exists short_links_expires_at_idx
on public.short_links (expires_at);

create index if not exists short_links_created_by_created_at_idx
on public.short_links (created_by, created_at desc);

create table if not exists public.short_link_stats (
  key text primary key,
  total_created integer not null default 0,
  total_deleted integer not null default 0
);

alter table public.short_link_stats enable row level security;

alter table public.short_link_stats
add column if not exists total_created integer not null default 0;

insert into public.short_link_stats (key, total_created, total_deleted)
values ('global', 0, 0)
on conflict (key) do nothing;

create table if not exists public.short_link_rate_limits (
  ip_hash text not null,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (ip_hash, bucket, window_start)
);

create index if not exists short_link_rate_limits_window_start_idx
on public.short_link_rate_limits (window_start);

alter table public.short_link_rate_limits enable row level security;

create table if not exists public.short_link_daily_stats (
  day date primary key,
  created_count integer not null default 0,
  deleted_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.short_link_daily_stats enable row level security;

create table if not exists public.short_link_visits (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.short_links (id) on delete cascade,
  visitor_hash text not null,
  referrer text,
  visited_at timestamptz not null default timezone('utc', now())
);

create index if not exists short_link_visits_link_id_visited_at_idx
on public.short_link_visits (link_id, visited_at desc);

create index if not exists short_link_visits_visited_at_idx
on public.short_link_visits (visited_at desc);

alter table public.short_link_visits enable row level security;

create table if not exists public.short_link_notifications (
  alert_key text primary key,
  kind text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.short_link_notifications enable row level security;

create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  visitor_hash text not null,
  path text not null default '/',
  day_utc date not null,
  visited_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists page_visits_unique_daily_visitor_idx
  on public.page_visits (visitor_hash, path, day_utc);

create index if not exists page_visits_visited_at_idx
  on public.page_visits (visited_at desc);

create index if not exists page_visits_day_utc_idx
  on public.page_visits (day_utc desc);

alter table public.page_visits enable row level security;

alter table public.short_links enable row level security;

drop policy if exists "allow public read active short links" on public.short_links;
revoke all on table public.short_links from anon, authenticated;

create or replace function public.increment_click_count(link_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.short_links
  set click_count = click_count + 1
  where id = link_id;
$$;

create or replace function public.record_short_link_visit(
  p_link_id bigint,
  p_visitor_hash text,
  p_referrer text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.short_link_visits (link_id, visitor_hash, referrer)
  values (p_link_id, p_visitor_hash, nullif(trim(p_referrer), ''));
$$;

create or replace function public.delete_expired_short_links()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  grace constant interval := interval '30 days';
begin
  -- 만료 후 30일 유예: 유예 기간이 지난 링크만 완전 삭제 (그동안은 소유자가 복구 가능)
  delete from public.short_links
  where expires_at is not null
    and expires_at <= timezone('utc', now()) - grace;

  get diagnostics deleted_count = row_count;

  -- 방문 기록·rate limit·페이지 방문은 90일 이후 보관 가치가 없으므로 함께 정리
  delete from public.short_link_visits
  where visited_at < timezone('utc', now()) - interval '90 days';

  delete from public.short_link_rate_limits
  where (bucket like '%minute%' and window_start < timezone('utc', now()) - interval '2 days')
     or (bucket like '%day%' and window_start < timezone('utc', now()) - interval '90 days');

  delete from public.page_visits
  where day_utc < (timezone('utc', now()) - interval '90 days')::date;

  return deleted_count;
end;
$$;

-- 관리자 수동 삭제는 만료 여부와 관계없이 선택한 링크를 즉시 완전 삭제합니다.
-- 자동 정리의 30일 유예 규칙과 분리해 두 동작이 서로 영향을 주지 않게 합니다.
create or replace function public.admin_delete_short_links(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  delete from public.short_links
  where id = any(p_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.sync_original_link_device_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.created_by is not null then
    insert into public.short_link_device_access(link_id, device_id)
    values(new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists short_links_device_access_trigger on public.short_links;
create trigger short_links_device_access_trigger after insert on public.short_links
for each row execute function public.sync_original_link_device_access();

drop function if exists public.claim_device_link_transfer(text, text);

create function public.claim_device_link_transfer(
  p_code_hash text,
  p_target_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text;
  saved_folders jsonb;
  saved_slugs text[];
  claimed_id text;
  saved_moved_count integer;
  actual_moved_count integer;
begin
  delete from public.device_link_transfer_codes
  where expires_at <= timezone('utc', now());

  select source_device_id, folder_state, link_slugs, claimed_device_id, moved_count
  into source_id, saved_folders, saved_slugs, claimed_id, saved_moved_count
  from public.device_link_transfer_codes
  where code_hash = p_code_hash
    and expires_at > timezone('utc', now())
  for update;

  if source_id is null then
    return jsonb_build_object('status', 'invalid', 'moved_count', 0, 'folders', '[]'::jsonb, 'moved_slugs', '[]'::jsonb);
  end if;

  if claimed_id is not null then
    if claimed_id = p_target_device_id then
      return jsonb_build_object('status', 'ok', 'moved_count', coalesce(saved_moved_count, 0), 'folders', coalesce(saved_folders, '[]'::jsonb), 'moved_slugs', to_jsonb(coalesce(saved_slugs, '{}'::text[])));
    end if;
    return jsonb_build_object('status', 'invalid', 'moved_count', 0, 'folders', '[]'::jsonb, 'moved_slugs', '[]'::jsonb);
  end if;

  if source_id = p_target_device_id then
    return jsonb_build_object('status', 'same_device', 'moved_count', 0, 'folders', '[]'::jsonb, 'moved_slugs', '[]'::jsonb);
  end if;

  with inserted as (
    insert into public.short_link_device_access(link_id, device_id)
    select id, p_target_device_id from public.short_links
    where created_by = source_id and slug = any(saved_slugs)
    on conflict do nothing returning 1
  ) select count(*) into actual_moved_count from inserted;

  update public.device_link_transfer_codes
  set claimed_device_id = p_target_device_id,
      claimed_at = timezone('utc', now()),
      moved_count = actual_moved_count
  where code_hash = p_code_hash;
  return jsonb_build_object(
    'status', 'ok',
    'moved_count', actual_moved_count,
    'folders', coalesce(saved_folders, '[]'::jsonb),
    'moved_slugs', to_jsonb(coalesce(saved_slugs, '{}'::text[]))
  );
end;
$$;

create or replace function public.increment_deleted_short_links(amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := timezone('utc', now())::date;
begin
  update public.short_link_stats
  set total_deleted = total_deleted + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0));
  end if;

  insert into public.short_link_daily_stats (day, created_count, deleted_count, updated_at)
  values (today, 0, greatest(coalesce(amount, 0), 0), timezone('utc', now()))
  on conflict (day)
  do update set
    deleted_count = public.short_link_daily_stats.deleted_count + greatest(coalesce(amount, 0), 0),
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.increment_created_short_links(amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := timezone('utc', now())::date;
  created_delta integer := greatest(coalesce(amount, 0), 0);
  today_created integer := 0;
  alert_key text := format('daily-spike-%s', today::text);
  alert_threshold constant integer := 300;
begin
  update public.short_link_stats
  set total_created = total_created + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_created, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0), 0);
  end if;

  insert into public.short_link_daily_stats (day, created_count, deleted_count, updated_at)
  values (today, created_delta, 0, timezone('utc', now()))
  on conflict (day)
  do update set
    created_count = public.short_link_daily_stats.created_count + created_delta,
    updated_at = timezone('utc', now())
  returning created_count into today_created;

  if today_created >= alert_threshold then
    insert into public.short_link_notifications (alert_key, kind, title, message)
    values (
      alert_key,
      'daily_spike',
      '오늘 생성 수가 많습니다',
      format('오늘 생성된 단축 주소가 %s개를 넘었습니다. 남용 여부를 확인해 주세요.', today_created)
    )
    on conflict (alert_key) do nothing;
  end if;
end;
$$;

drop function if exists public.consume_short_link_rate_limit(text);

create or replace function public.consume_short_link_rate_limit(
  p_ip_hash text,
  p_device_hash text default null
)
returns table (
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  dev_minute_limit constant integer := 10;
  dev_day_limit constant integer := 50;
  ip_minute_limit constant integer := 60;
  ip_day_limit constant integer := 300;
  global_day_limit constant integer := 3000;
  today_created integer := 0;
  today date := timezone('utc', now())::date;
  now_utc timestamptz := timezone('utc', now());
  minute_bucket_start timestamptz;
  day_bucket_start timestamptz;
  ip_minute_count integer := 0;
  ip_day_count integer := 0;
  dev_minute_count integer := 0;
  dev_day_count integer := 0;
  minute_exceeded boolean := false;
  day_exceeded boolean := false;
begin
  select coalesce(created_count, 0)
  into today_created
  from public.short_link_daily_stats
  where day = today;

  if today_created >= global_day_limit then
    allowed := false;
    retry_after_seconds := greatest(
      extract(epoch from ((today::timestamptz + interval '1 day') - now_utc))::integer,
      1
    );
    return next;
    return;
  end if;

  minute_bucket_start := timezone(
    'utc',
    to_timestamp(floor(extract(epoch from now_utc) / 60) * 60)
  );
  day_bucket_start := timezone('utc', date_trunc('day', now_utc));

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'minute', minute_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into ip_minute_count;

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'day', day_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into ip_day_count;

  if p_device_hash is not null then
    insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
    values (p_device_hash, 'dev-minute', minute_bucket_start, 1)
    on conflict (ip_hash, bucket, window_start)
    do update set request_count = public.short_link_rate_limits.request_count + 1
    returning request_count into dev_minute_count;

    insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
    values (p_device_hash, 'dev-day', day_bucket_start, 1)
    on conflict (ip_hash, bucket, window_start)
    do update set request_count = public.short_link_rate_limits.request_count + 1
    returning request_count into dev_day_count;
  end if;

  minute_exceeded := ip_minute_count > ip_minute_limit or dev_minute_count > dev_minute_limit;
  day_exceeded := ip_day_count > ip_day_limit or dev_day_count > dev_day_limit;

  allowed := not minute_exceeded and not day_exceeded;
  retry_after_seconds := 0;

  if minute_exceeded then
    retry_after_seconds := greatest(60 - mod(floor(extract(epoch from now_utc))::integer, 60), 1);
  elsif day_exceeded then
    retry_after_seconds := greatest(
      extract(epoch from ((day_bucket_start + interval '1 day') - now_utc))::integer,
      1
    );
  end if;

  return next;
end;
$$;

revoke execute on function public.consume_short_link_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_short_link_rate_limit(text, text) to service_role;

create or replace function public.enforce_short_link_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_rows constant integer := 50000;
  current_rows integer := 0;
begin
  select count(*) into current_rows
  from public.short_links;

  if current_rows >= max_rows then
    raise exception '단축 주소 저장 공간이 가득 찼습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists short_links_capacity_trigger on public.short_links;

create trigger short_links_capacity_trigger
before insert on public.short_links
for each row
execute function public.enforce_short_link_capacity();

-- 페이지 방문 기록용 rate limit (IP당 분당 30회)
create or replace function public.consume_page_visit_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_limit constant integer := 30;
  minute_count integer := 0;
  now_utc timestamptz := timezone('utc', now());
  minute_bucket_start timestamptz := timezone(
    'utc',
    to_timestamp(floor(extract(epoch from now_utc) / 60) * 60)
  );
begin
  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'pv-minute', minute_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into minute_count;

  return minute_count <= minute_limit;
end;
$$;

-- 링크별 방문자 수 집계 (관리자 대시보드·링크 통계용, 행 제한 없이 DB에서 distinct 집계)
create or replace function public.get_link_visit_stats(
  p_recent_after timestamptz,
  p_today_after timestamptz,
  p_link_id bigint default null
)
returns table (
  link_id bigint,
  recent_visitors integer,
  today_visitors integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.link_id,
    (count(distinct v.visitor_hash) filter (where v.visited_at >= p_recent_after))::integer,
    (count(distinct v.visitor_hash) filter (where v.visited_at >= p_today_after))::integer
  from public.short_link_visits v
  where v.visited_at >= least(p_recent_after, p_today_after)
    and (p_link_id is null or v.link_id = p_link_id)
  group by v.link_id;
$$;

-- 전역 고유 방문자 수 집계
create or replace function public.get_global_visit_stats(
  p_recent_after timestamptz,
  p_today_after timestamptz
)
returns table (
  recent_visitors integer,
  today_visitors integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (count(distinct v.visitor_hash) filter (where v.visited_at >= p_recent_after))::integer,
    (count(distinct v.visitor_hash) filter (where v.visited_at >= p_today_after))::integer
  from public.short_link_visits v
  where v.visited_at >= least(p_recent_after, p_today_after);
$$;

-- 생성·삭제 카운터는 링크 테이블 변경과 같은 트랜잭션에서 갱신합니다.
create or replace function public.sync_short_link_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.increment_created_short_links(1);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.increment_deleted_short_links(1);
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists short_links_stats_insert_trigger on public.short_links;
create trigger short_links_stats_insert_trigger
after insert on public.short_links
for each row execute function public.sync_short_link_stats();

drop trigger if exists short_links_stats_delete_trigger on public.short_links;
create trigger short_links_stats_delete_trigger
after delete on public.short_links
for each row execute function public.sync_short_link_stats();

-- RPC는 앱 서버의 service_role만 호출합니다.
create or replace function public.consume_admin_login_rate_limit(p_ip_hash text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path=public as $$
declare
  now_utc timestamptz := timezone('utc', now());
  minute_start timestamptz; day_start timestamptz;
  minute_count integer; day_count integer;
begin
  minute_start := timezone('utc', to_timestamp(floor(extract(epoch from now_utc) / 60) * 60));
  day_start := timezone('utc', date_trunc('day', now_utc));
  insert into public.short_link_rate_limits(ip_hash,bucket,window_start,request_count)
  values(p_ip_hash,'admin-login-minute',minute_start,1)
  on conflict(ip_hash,bucket,window_start) do update set request_count=public.short_link_rate_limits.request_count+1
  returning request_count into minute_count;
  insert into public.short_link_rate_limits(ip_hash,bucket,window_start,request_count)
  values(p_ip_hash,'admin-login-day',day_start,1)
  on conflict(ip_hash,bucket,window_start) do update set request_count=public.short_link_rate_limits.request_count+1
  returning request_count into day_count;
  allowed := minute_count <= 5 and day_count <= 30;
  if minute_count > 5 then retry_after_seconds := greatest(60-mod(floor(extract(epoch from now_utc))::integer,60),1);
  elsif day_count > 30 then retry_after_seconds := greatest(extract(epoch from ((day_start+interval '1 day')-now_utc))::integer,1);
  else retry_after_seconds := 0; end if;
  return next;
end; $$;

revoke execute on function public.increment_click_count(bigint) from public, anon, authenticated;
revoke execute on function public.record_short_link_visit(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.delete_expired_short_links() from public, anon, authenticated;
revoke execute on function public.admin_delete_short_links(bigint[]) from public, anon, authenticated;
revoke execute on function public.claim_device_link_transfer(text, text) from public, anon, authenticated;
revoke execute on function public.increment_deleted_short_links(integer) from public, anon, authenticated;
revoke execute on function public.increment_created_short_links(integer) from public, anon, authenticated;
revoke execute on function public.consume_short_link_rate_limit(text) from public, anon, authenticated;
revoke execute on function public.consume_page_visit_rate_limit(text) from public, anon, authenticated;
revoke execute on function public.get_link_visit_stats(timestamptz, timestamptz, bigint) from public, anon, authenticated;
revoke execute on function public.get_global_visit_stats(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.sync_short_link_stats() from public, anon, authenticated;

grant execute on function public.increment_click_count(bigint) to service_role;
grant execute on function public.record_short_link_visit(bigint, text, text) to service_role;
grant execute on function public.delete_expired_short_links() to service_role;
grant execute on function public.admin_delete_short_links(bigint[]) to service_role;
grant execute on function public.claim_device_link_transfer(text, text) to service_role;

revoke all on table public.device_link_transfer_codes from public, anon, authenticated;
grant all on table public.device_link_transfer_codes to service_role;
revoke all on table public.short_link_device_access from public, anon, authenticated;
grant all on table public.short_link_device_access to service_role;
revoke execute on function public.sync_original_link_device_access() from public, anon, authenticated;
revoke execute on function public.consume_admin_login_rate_limit(text) from public, anon, authenticated;
grant execute on function public.increment_deleted_short_links(integer) to service_role;
grant execute on function public.increment_created_short_links(integer) to service_role;
grant execute on function public.consume_short_link_rate_limit(text) to service_role;
grant execute on function public.consume_page_visit_rate_limit(text) to service_role;
grant execute on function public.get_link_visit_stats(timestamptz, timestamptz, bigint) to service_role;
grant execute on function public.get_global_visit_stats(timestamptz, timestamptz) to service_role;
grant execute on function public.consume_admin_login_rate_limit(text) to service_role;
