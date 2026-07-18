-- 이전 코드 생성 시 선택된(브라우저에서 숨기지 않은) 링크만 옮깁니다.

alter table public.device_link_transfer_codes
add column if not exists link_slugs text[] not null default '{}'::text[];

-- 이전 방식으로 만들어진 아직 사용되지 않은 코드는 전체 링크를 옮길 수 있으므로 무효화합니다.
delete from public.device_link_transfer_codes;

drop function if exists public.claim_device_link_transfer(text, text);

create function public.claim_device_link_transfer(
  p_code_hash text,
  p_target_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text;
  saved_folders jsonb;
  saved_slugs text[];
  moved_count integer;
begin
  delete from public.device_link_transfer_codes where expires_at <= timezone('utc', now());

  select source_device_id, folder_state, link_slugs
  into source_id, saved_folders, saved_slugs
  from public.device_link_transfer_codes
  where code_hash = p_code_hash and expires_at > timezone('utc', now())
  for update;

  if source_id is null then
    return jsonb_build_object('status', 'invalid', 'moved_count', 0, 'folders', '[]'::jsonb);
  end if;
  if source_id = p_target_device_id then
    return jsonb_build_object('status', 'same_device', 'moved_count', 0, 'folders', '[]'::jsonb);
  end if;

  update public.short_links
  set created_by = p_target_device_id
  where created_by = source_id
    and slug = any(saved_slugs);
  get diagnostics moved_count = row_count;

  delete from public.device_link_transfer_codes where code_hash = p_code_hash;

  return jsonb_build_object('status', 'ok', 'moved_count', moved_count, 'folders', coalesce(saved_folders, '[]'::jsonb));
end;
$$;

revoke execute on function public.claim_device_link_transfer(text, text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text, text) to service_role;
