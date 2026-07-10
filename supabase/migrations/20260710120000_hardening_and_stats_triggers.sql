-- 운영 보완: RPC 권한 제한, 통계 원자화, 내 링크 조회 인덱스

create index if not exists short_links_created_by_created_at_idx
on public.short_links (created_by, created_at desc);

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

revoke execute on function public.increment_click_count(bigint) from public, anon, authenticated;
revoke execute on function public.record_short_link_visit(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.delete_expired_short_links() from public, anon, authenticated;
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
grant execute on function public.increment_deleted_short_links(integer) to service_role;
grant execute on function public.increment_created_short_links(integer) to service_role;
grant execute on function public.consume_short_link_rate_limit(text) to service_role;
grant execute on function public.consume_page_visit_rate_limit(text) to service_role;
grant execute on function public.get_link_visit_stats(timestamptz, timestamptz, bigint) to service_role;
grant execute on function public.get_global_visit_stats(timestamptz, timestamptz) to service_role;
