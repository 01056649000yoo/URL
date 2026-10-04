-- 2026-10-05 만료 정리(매시간, cleanup 컨테이너)에서 아지트 계정 연결표(public.samlink_connect_tickets)의 만료분도 지운다.
CREATE OR REPLACE FUNCTION samlink.delete_expired_short_links()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'samlink'
AS $function$
declare
  deleted_count integer;
  grace constant interval := interval '30 days';
begin
  delete from samlink.short_links
  where expires_at is not null
    and expires_at <= timezone('utc', now()) - grace;

  get diagnostics deleted_count = row_count;

  -- 방문 기록·rate limit·페이지 방문은 90일 이후 보관 가치가 없으므로 함께 정리
  delete from samlink.short_link_visits
  where visited_at < timezone('utc', now()) - interval '90 days';

  delete from samlink.short_link_rate_limits
  where (bucket like '%minute%' and window_start < timezone('utc', now()) - interval '2 days')
     or (bucket like '%day%' and window_start < timezone('utc', now()) - interval '90 days');

  delete from samlink.page_visits
  where day_utc < (timezone('utc', now()) - interval '90 days')::date;

  -- 아지트 계정 연결표(1분짜리): 만료된 것은 매시간 지운다(개인정보처리방침 제4조, 2026-10-05).
  delete from public.samlink_connect_tickets
  where expires_at < timezone('utc', now());

  return deleted_count;
end;
$function$;

revoke execute on function samlink.delete_expired_short_links() from public, anon, authenticated;
grant execute on function samlink.delete_expired_short_links() to service_role;
