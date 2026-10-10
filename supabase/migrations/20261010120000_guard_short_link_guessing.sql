-- 2026-10-10 짧은 주소 찍어 보기 막기 (선생님 결정).
-- 자동 주소는 4글자(32^4 ≈ 100만)라, 틀린 주소를 막지 않으면 컴퓨터로 차례로 열어 남의 링크를 찾을 수 있다.
-- 열기(/슬러그, /b/슬러그)에서 **없는 주소만** IP별로 세고, 넘으면 그 IP 의 열기를 잠시 막는다.
-- - IP별: 틀린 주소 1분 30번 / 10분 100번 초과 → 남은 시간 동안 열기 429
--   학교는 학생 여럿이 공인 IP 하나를 함께 쓴다. 맞는 주소는 세지 않으니 한 반이 동시에 열어도 걸리지 않고,
--   오타 몇 번으로는 닿지 않는 숫자다. 찍어 보기는 하루 1만 4천 번 정도로 줄어든다.
-- - 버킷 이름에 minute 을 넣어 기존 정리(delete_expired_short_links: '%minute%' 2일)가 그대로 지운다.
-- 조회·막기·세기를 함수 하나로 해서 왕복이 한 번이다.

create or replace function samlink.lookup_short_link_guarded(
  p_slug text,
  p_ip_hash text
)
returns table (
  blocked boolean,
  retry_after_seconds integer,
  id bigint,
  destination text,
  is_active boolean,
  expires_at timestamptz,
  bundle_items jsonb
)
language plpgsql
security definer
set search_path = samlink
as $$
declare
  minute_limit constant integer := 30;
  ten_minute_limit constant integer := 100;
  now_utc timestamptz := timezone('utc', now());
  epoch_now integer := floor(extract(epoch from now_utc))::integer;
  minute_start timestamptz := to_timestamp(epoch_now - mod(epoch_now, 60));
  ten_minute_start timestamptz := to_timestamp(epoch_now - mod(epoch_now, 600));
  minute_count integer := 0;
  ten_minute_count integer := 0;
  link samlink.short_links%rowtype;
begin
  blocked := false;
  retry_after_seconds := 0;

  select coalesce(sum(r.request_count) filter (where r.bucket = 'miss-minute'), 0),
         coalesce(sum(r.request_count) filter (where r.bucket = 'miss-10minute'), 0)
  into minute_count, ten_minute_count
  from samlink.short_link_rate_limits r
  where r.ip_hash = p_ip_hash
    and ((r.bucket = 'miss-minute' and r.window_start = minute_start)
      or (r.bucket = 'miss-10minute' and r.window_start = ten_minute_start));

  if ten_minute_count >= ten_minute_limit then
    blocked := true;
    retry_after_seconds := greatest(600 - mod(epoch_now, 600), 1);
    return next;
    return;
  elsif minute_count >= minute_limit then
    blocked := true;
    retry_after_seconds := greatest(60 - mod(epoch_now, 60), 1);
    return next;
    return;
  end if;

  select * into link from samlink.short_links s where s.slug = p_slug;

  if not found then
    insert into samlink.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
    values (p_ip_hash, 'miss-minute', minute_start, 1),
           (p_ip_hash, 'miss-10minute', ten_minute_start, 1)
    on conflict (ip_hash, bucket, window_start)
    do update set request_count = samlink.short_link_rate_limits.request_count + 1;
    return next;
    return;
  end if;

  id := link.id;
  destination := link.destination;
  is_active := link.is_active;
  expires_at := link.expires_at;
  bundle_items := link.bundle_items;
  return next;
end;
$$;

revoke execute on function samlink.lookup_short_link_guarded(text, text) from public, anon, authenticated;
grant execute on function samlink.lookup_short_link_guarded(text, text) to service_role;
