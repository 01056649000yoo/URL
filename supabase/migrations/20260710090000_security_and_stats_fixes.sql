-- 보안·통계 정확성 개선 마이그레이션
-- 1) 모든 security definer 함수에 search_path 고정 (search-path 하이재킹 방지)
-- 2) 방문 통계 집계 RPC 추가 (PostgREST 1,000행 제한 우회)
-- 3) 오래된 방문 기록·rate limit 행 정리를 시간당 cleanup으로 이동
-- 4) 페이지 방문 기록용 rate limit RPC 추가

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
begin
  delete from public.short_links
  where expires_at is not null
    and expires_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;

  -- 방문 기록·rate limit·페이지 방문은 90일 이후 보관 가치가 없으므로 함께 정리
  delete from public.short_link_visits
  where visited_at < timezone('utc', now()) - interval '90 days';

  delete from public.short_link_rate_limits
  where (bucket like '%minute%' and window_start < timezone('utc', now()) - interval '2 days')
     or (bucket = 'day' and window_start < timezone('utc', now()) - interval '90 days');

  delete from public.page_visits
  where day_utc < (timezone('utc', now()) - interval '90 days')::date;

  return deleted_count;
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

create or replace function public.consume_short_link_rate_limit(p_ip_hash text)
returns table (
  allowed boolean,
  minute_count integer,
  day_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_bucket_start timestamptz;
  day_bucket_start timestamptz;
  minute_limit constant integer := 5;
  day_limit constant integer := 20;
  global_day_limit constant integer := 1000;
  today_created integer := 0;
  today date := timezone('utc', now())::date;
  now_utc timestamptz := timezone('utc', now());
begin
  select coalesce(created_count, 0)
  into today_created
  from public.short_link_daily_stats
  where day = today;

  if today_created >= global_day_limit then
    allowed := false;
    minute_count := 0;
    day_count := today_created;
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
  returning request_count into minute_count;

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'day', day_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into day_count;

  allowed := minute_count <= minute_limit and day_count <= day_limit;
  retry_after_seconds := 0;

  if minute_count > minute_limit then
    retry_after_seconds := greatest(60 - mod(floor(extract(epoch from now_utc))::integer, 60), 1);
  elsif day_count > day_limit then
    retry_after_seconds := greatest(
      extract(epoch from ((day_bucket_start + interval '1 day') - now_utc))::integer,
      1
    );
  end if;

  return query
    select allowed, minute_count, day_count, retry_after_seconds;
end;
$$;

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
