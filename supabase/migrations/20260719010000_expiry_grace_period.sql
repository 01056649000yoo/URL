-- 만료 유예 기간(30일) 도입
-- 만료된 링크는 즉시 삭제하지 않고 30일간 "복구 가능" 상태로 보관합니다.
-- - 방문자에게는 만료 안내만 표시 (작동 안 함)
-- - 만든 사람은 유예 기간 안에 내 링크에서 복구(+30일) 가능
-- - 유예 기간이 지나면 청소 작업이 완전 삭제

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
