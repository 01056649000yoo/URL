-- 관리자 수동 삭제는 링크의 만료 여부와 관계없이 즉시 완전 삭제합니다.
-- delete_expired_short_links()의 30일 유예 자동 정리와는 별도 동작입니다.

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

revoke execute on function public.admin_delete_short_links(bigint[]) from public, anon, authenticated;
grant execute on function public.admin_delete_short_links(bigint[]) to service_role;
