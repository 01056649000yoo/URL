create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  visitor_hash text not null,
  path text not null default '/',
  day_utc date not null,
  visited_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists page_visits_unique_daily_visitor_idx
  on public.page_visits (visitor_hash, path, day_utc);

create index if not exists page_visits_visited_at_idx
  on public.page_visits (visited_at desc);

create index if not exists page_visits_day_utc_idx
  on public.page_visits (day_utc desc);

alter table public.page_visits enable row level security;
