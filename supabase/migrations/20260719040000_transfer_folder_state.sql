-- 기기 이전 코드에 브라우저 폴더 구조와 링크 배치 상태를 함께 임시 보관합니다.

alter table public.device_link_transfer_codes
add column if not exists folder_state jsonb not null default '[]'::jsonb;

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
  moved_count integer;
begin
  delete from public.device_link_transfer_codes
  where expires_at <= timezone('utc', now());

  select source_device_id, folder_state into source_id, saved_folders
  from public.device_link_transfer_codes
  where code_hash = p_code_hash
    and expires_at > timezone('utc', now())
  for update;

  if source_id is null then
    return jsonb_build_object('status', 'invalid', 'moved_count', 0, 'folders', '[]'::jsonb);
  end if;

  if source_id = p_target_device_id then
    return jsonb_build_object('status', 'same_device', 'moved_count', 0, 'folders', '[]'::jsonb);
  end if;

  update public.short_links
  set created_by = p_target_device_id
  where created_by = source_id;
  get diagnostics moved_count = row_count;

  delete from public.device_link_transfer_codes where code_hash = p_code_hash;

  return jsonb_build_object(
    'status', 'ok',
    'moved_count', moved_count,
    'folders', coalesce(saved_folders, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.claim_device_link_transfer(text, text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text, text) to service_role;
