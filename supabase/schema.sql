create table if not exists public.short_links (
  id bigint generated always as identity primary key,
  slug text not null unique,
  destination text not null,
  created_by text,
  click_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.short_links enable row level security;

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
