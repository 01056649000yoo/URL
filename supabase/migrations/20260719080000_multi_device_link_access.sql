-- 원본 소유권을 이동하지 않고 다른 기기에 관리 접근 권한을 복사합니다.

create table if not exists public.short_link_device_access (
  link_id bigint not null references public.short_links(id) on delete cascade,
  device_id text not null,
  granted_at timestamptz not null default timezone('utc', now()),
  primary key (link_id, device_id)
);

create index if not exists short_link_device_access_device_idx
on public.short_link_device_access(device_id, granted_at desc);

alter table public.short_link_device_access enable row level security;

insert into public.short_link_device_access(link_id, device_id)
select id, created_by from public.short_links where created_by is not null
on conflict do nothing;

create or replace function public.sync_original_link_device_access()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.created_by is not null then
    insert into public.short_link_device_access(link_id, device_id)
    values(new.id, new.created_by) on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists short_links_device_access_trigger on public.short_links;
create trigger short_links_device_access_trigger after insert on public.short_links
for each row execute function public.sync_original_link_device_access();

drop function if exists public.claim_device_link_transfer(text, text);
create function public.claim_device_link_transfer(p_code_hash text, p_target_device_id text)
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

revoke all on table public.short_link_device_access from public, anon, authenticated;
grant all on table public.short_link_device_access to service_role;
revoke execute on function public.sync_original_link_device_access() from public, anon, authenticated;
revoke execute on function public.claim_device_link_transfer(text,text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text,text) to service_role;
