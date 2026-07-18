create or replace function public.claim_device_link_transfer(p_code_hash text, p_target_device_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  source_id text; saved_folders jsonb; saved_slugs text[]; claimed_id text;
  saved_moved_count integer; actual_moved_count integer;
begin
  delete from public.device_link_transfer_codes where expires_at <= timezone('utc', now());
  select source_device_id, folder_state, link_slugs, claimed_device_id, moved_count
  into source_id, saved_folders, saved_slugs, claimed_id, saved_moved_count
  from public.device_link_transfer_codes
  where code_hash=p_code_hash and expires_at>timezone('utc',now()) for update;

  if source_id is null then
    return jsonb_build_object('status','invalid','moved_count',0,'folders','[]'::jsonb,'moved_slugs','[]'::jsonb);
  end if;
  if claimed_id is not null then
    if claimed_id=p_target_device_id then
      return jsonb_build_object('status','ok','moved_count',coalesce(saved_moved_count,0),'folders',coalesce(saved_folders,'[]'::jsonb),'moved_slugs',to_jsonb(coalesce(saved_slugs,'{}'::text[])));
    end if;
    return jsonb_build_object('status','invalid','moved_count',0,'folders','[]'::jsonb,'moved_slugs','[]'::jsonb);
  end if;
  if source_id=p_target_device_id then
    return jsonb_build_object('status','same_device','moved_count',0,'folders','[]'::jsonb,'moved_slugs','[]'::jsonb);
  end if;

  with inserted as (
    insert into public.short_link_device_access(link_id, device_id)
    select id, p_target_device_id from public.short_links
    where created_by=source_id and slug=any(saved_slugs)
    on conflict do nothing returning 1
  ) select count(*) into actual_moved_count from inserted;

  update public.device_link_transfer_codes set claimed_device_id=p_target_device_id,
    claimed_at=timezone('utc',now()), moved_count=actual_moved_count where code_hash=p_code_hash;
  return jsonb_build_object('status','ok','moved_count',actual_moved_count,'folders',coalesce(saved_folders,'[]'::jsonb),'moved_slugs',to_jsonb(coalesce(saved_slugs,'{}'::text[])));
end; $$;

revoke execute on function public.claim_device_link_transfer(text,text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text,text) to service_role;
