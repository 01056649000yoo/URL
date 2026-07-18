drop policy if exists "allow public read active short links" on public.short_links;
revoke all on table public.short_links from anon, authenticated;

create or replace function public.consume_admin_login_rate_limit(p_ip_hash text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_utc timestamptz := timezone('utc', now());
  minute_start timestamptz;
  day_start timestamptz;
  minute_count integer;
  day_count integer;
begin
  minute_start := timezone('utc', to_timestamp(floor(extract(epoch from now_utc) / 60) * 60));
  day_start := timezone('utc', date_trunc('day', now_utc));

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'admin-login-minute', minute_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into minute_count;

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'admin-login-day', day_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into day_count;

  allowed := minute_count <= 5 and day_count <= 30;
  if minute_count > 5 then
    retry_after_seconds := greatest(60 - mod(floor(extract(epoch from now_utc))::integer, 60), 1);
  elsif day_count > 30 then
    retry_after_seconds := greatest(extract(epoch from ((day_start + interval '1 day') - now_utc))::integer, 1);
  else
    retry_after_seconds := 0;
  end if;
  return next;
end;
$$;

revoke execute on function public.consume_admin_login_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_rate_limit(text) to service_role;
