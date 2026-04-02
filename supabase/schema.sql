create table if not exists public.short_links (
  id bigint generated always as identity primary key,
  slug text not null unique,
  destination text not null,
  created_by text,
  expires_at timestamptz,
  click_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.short_links
add column if not exists expires_at timestamptz;

create index if not exists short_links_expires_at_idx
on public.short_links (expires_at);

create table if not exists public.short_link_stats (
  key text primary key,
  total_created integer not null default 0,
  total_deleted integer not null default 0
);

alter table public.short_link_stats
add column if not exists total_created integer not null default 0;

insert into public.short_link_stats (key, total_created, total_deleted)
values ('global', 0, 0)
on conflict (key) do nothing;

alter table public.short_links enable row level security;

drop policy if exists "allow public read active short links" on public.short_links;

create policy "allow public read active short links"
on public.short_links
for select
to anon
using (is_active = true);

create or replace function public.increment_click_count(link_id bigint)
returns void
language sql
security definer
as $$
  update public.short_links
  set click_count = click_count + 1
  where id = link_id;
$$;

create or replace function public.delete_expired_short_links()
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.short_links
  where expires_at is not null
    and expires_at <= timezone('utc', now());

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.increment_deleted_short_links(amount integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.short_link_stats
  set total_deleted = total_deleted + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0));
  end if;
end;
$$;

create or replace function public.increment_created_short_links(amount integer)
returns void
language plpgsql
security definer
as $$
begin
  update public.short_link_stats
  set total_created = total_created + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_created, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0), 0);
  end if;
end;
$$;
