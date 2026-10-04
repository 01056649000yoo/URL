-- 2026-10-04 아지트 스택 이전(2026-08-28) 뒤 점검.
-- 1) 첫 화면 방문 기록용 rate limit 함수가 samlink 스키마로 옮겨지지 않아 8/28 이후 page_visits 가 0 이었다 → 되살린다(IP당 분당 30회, 원본 20260710090000).
-- 2) samlink 함수들이 PUBLIC·anon·authenticated 에 EXECUTE 로 열려 있었다(이전 때 revoke 가 빠짐). samlink 는 PostgREST 노출 스키마라
--    공개 anon 키로 SECURITY DEFINER 함수(admin_delete_short_links 등)를 부를 수 있었다 → service_role 만 남긴다. 앱은 service_role 로만 부른다.

create or replace function samlink.consume_page_visit_rate_limit(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = samlink
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
  insert into samlink.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'pv-minute', minute_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = samlink.short_link_rate_limits.request_count + 1
  returning request_count into minute_count;

  return minute_count <= minute_limit;
end;
$$;

revoke execute on all functions in schema samlink from public, anon, authenticated;
grant execute on all functions in schema samlink to service_role;
alter default privileges for role postgres in schema samlink revoke execute on functions from public, anon, authenticated;
