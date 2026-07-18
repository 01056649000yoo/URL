-- 가입 없이 6자리 일회용 코드로 링크 소유권과 별명을 다른 기기로 이전합니다.

alter table public.short_links
add column if not exists display_label text;

create table if not exists public.device_link_transfer_codes (
  code_hash text primary key,
  source_device_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_link_transfer_codes_expires_at_idx
on public.device_link_transfer_codes (expires_at);

alter table public.device_link_transfer_codes enable row level security;

create or replace function public.claim_device_link_transfer(
  p_code_hash text,
  p_target_device_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id text;
  moved_count integer;
begin
  delete from public.device_link_transfer_codes
  where expires_at <= timezone('utc', now());

  select source_device_id into source_id
  from public.device_link_transfer_codes
  where code_hash = p_code_hash
    and expires_at > timezone('utc', now())
  for update;

  if source_id is null then
    return -1;
  end if;

  if source_id = p_target_device_id then
    return -2;
  end if;

  update public.short_links
  set created_by = p_target_device_id
  where created_by = source_id;

  get diagnostics moved_count = row_count;

  delete from public.device_link_transfer_codes
  where code_hash = p_code_hash;

  return moved_count;
end;
$$;

revoke all on table public.device_link_transfer_codes from public, anon, authenticated;
grant all on table public.device_link_transfer_codes to service_role;
revoke execute on function public.claim_device_link_transfer(text, text) from public, anon, authenticated;
grant execute on function public.claim_device_link_transfer(text, text) to service_role;
