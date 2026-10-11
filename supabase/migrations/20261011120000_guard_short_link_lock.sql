-- 짧은 주소 찍어 보기 막기를 동시 요청에도 지킨다 (2026-10-11).
-- 20261010120000 은 "읽고 → 나중에 증가" 라 같은 주소가 한꺼번에 보내면 한도를 넘겨 통과했다(300개 동시 5번: 33~106개).
-- 접속 주소별 advisory lock 으로 확인·조회·증가를 한 줄로 세운다. 그 밖의 동작은 그대로.

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

  -- 같은 접속 주소의 요청은 한 줄로 세운다: 확인 → 조회 → 증가가 겹치지 않게(2026-10-11, Codex 독립 검토 지적을
  -- 재현해 고침: 300개 동시에 보내면 한도 30인데 33~106개가 "없는 주소"로 통과했다 — 읽고 나서 증가해서).
  -- 트랜잭션이 끝나면 저절로 풀리고, 다른 주소끼리는 서로 기다리지 않는다. 한 학교가 한꺼번에 열어도 요청당 약 1ms 다.
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

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
