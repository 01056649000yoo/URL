-- 학교 공유 IP 대응: rate limit을 기기(쿠키)+IP 2층 구조로 개편
-- - 기기별: 분당 10 / 일 50 (교사 한 명 기준, 기존보다 여유)
-- - IP별:   분당 60 / 일 300 (학교 전체 천장 — 쿠키를 갈아치우는 남용 방지)
-- - 전역:   일 1,000 → 3,000 상향

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

-- 정리 함수가 새 dev-day 버킷도 청소하도록 조건 갱신
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
     or (bucket like '%day%' and window_start < timezone('utc', now()) - interval '90 days');

  delete from public.page_visits
  where day_utc < (timezone('utc', now()) - interval '90 days')::date;

  return deleted_count;
end;
$$;
