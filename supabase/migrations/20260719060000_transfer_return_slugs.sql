-- 새 기기에서 과거 숨김 처리된 링크도 다시 보이도록 이전된 슬러그 목록을 반환합니다.

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
  select source_device_id, folder_state, link_slugs into source_id, saved_folders, saved_slugs
  from public.device_link_transfer_codes
  where code_hash = p_code_hash and expires_at > timezone('utc', now())
  for update;

  if source_id is null then
    return jsonb_build_object('status', 'invalid', 'moved_count', 0, 'folders', '[]'::jsonb, 'moved_slugs', '[]'::jsonb);
  end if;
  if source_id = p_target_device_id then
    return jsonb_build_object('status', 'same_device', 'moved_count', 0, 'folders', '[]'::jsonb, 'moved_slugs', '[]'::jsonb);
  end if;

  update public.short_links set created_by = p_target_device_id
  where created_by = source_id and slug = any(saved_slugs);
  get diagnostics moved_count = row_count;
  delete from public.device_link_transfer_codes where code_hash = p_code_hash;

  return jsonb_build_object(
    'status', 'ok',
    'moved_count', moved_count,
    'folders', coalesce(saved_folders, '[]'::jsonb),
    'moved_slugs', to_jsonb(coalesce(saved_slugs, '{}'::text[]))
  );
end;
$$;

revoke execute on function public.claim_device_link_transfer(text, text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text, text) to service_role;
