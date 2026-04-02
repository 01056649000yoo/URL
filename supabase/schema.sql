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

create table if not exists public.short_link_rate_limits (
  ip_hash text not null,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (ip_hash, bucket, window_start)
);

create index if not exists short_link_rate_limits_window_start_idx
on public.short_link_rate_limits (window_start);

create table if not exists public.short_link_daily_stats (
  day date primary key,
  created_count integer not null default 0,
  deleted_count integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.short_link_notifications (
  alert_key text primary key,
  kind text not null,
  title text not null,
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

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
declare
  today date := timezone('utc', now())::date;
begin
  update public.short_link_stats
  set total_deleted = total_deleted + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0));
  end if;

  insert into public.short_link_daily_stats (day, created_count, deleted_count, updated_at)
  values (today, 0, greatest(coalesce(amount, 0), 0), timezone('utc', now()))
  on conflict (day)
  do update set
    deleted_count = public.short_link_daily_stats.deleted_count + greatest(coalesce(amount, 0), 0),
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.increment_created_short_links(amount integer)
returns void
language plpgsql
security definer
as $$
declare
  today date := timezone('utc', now())::date;
  created_delta integer := greatest(coalesce(amount, 0), 0);
  today_created integer := 0;
  alert_key text := format('daily-spike-%s', today::text);
  alert_threshold constant integer := 50;
begin
  update public.short_link_stats
  set total_created = total_created + greatest(coalesce(amount, 0), 0)
  where key = 'global';

  if not found then
    insert into public.short_link_stats (key, total_created, total_deleted)
    values ('global', greatest(coalesce(amount, 0), 0), 0);
  end if;

  insert into public.short_link_daily_stats (day, created_count, deleted_count, updated_at)
  values (today, created_delta, 0, timezone('utc', now()))
  on conflict (day)
  do update set
    created_count = public.short_link_daily_stats.created_count + created_delta,
    updated_at = timezone('utc', now())
  returning created_count into today_created;

  if today_created >= alert_threshold then
    insert into public.short_link_notifications (alert_key, kind, title, message)
    values (
      alert_key,
      'daily_spike',
      '오늘 생성 수가 많습니다',
      format('오늘 생성된 단축 주소가 %s개를 넘었습니다. 남용 여부를 확인해 주세요.', today_created)
    )
    on conflict (alert_key) do nothing;
  end if;
end;
$$;

drop function if exists public.consume_short_link_rate_limit(text);

create or replace function public.consume_short_link_rate_limit(p_ip_hash text)
returns table (
  allowed boolean,
  minute_count integer,
  day_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
as $$
declare
  minute_bucket_start timestamptz;
  day_bucket_start timestamptz;
  minute_limit constant integer := 3;
  day_limit constant integer := 20;
  global_day_limit constant integer := 100;
  today_created integer := 0;
  today date := timezone('utc', now())::date;
  now_utc timestamptz := timezone('utc', now());
begin
  select coalesce(created_count, 0)
  into today_created
  from public.short_link_daily_stats
  where day = today;

  if today_created >= global_day_limit then
    allowed := false;
    minute_count := 0;
    day_count := today_created;
    retry_after_seconds := greatest(
      extract(epoch from ((today::timestamptz + interval '1 day') - now_utc))::integer,
      1
    );
    return next;
    return;
  end if;

  minute_bucket_start := timezone(
    'utc',
    to_timestamp(floor(extract(epoch from now_utc) / 60) * 60)
  );
  day_bucket_start := timezone('utc', date_trunc('day', now_utc));

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'minute', minute_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into minute_count;

  insert into public.short_link_rate_limits (ip_hash, bucket, window_start, request_count)
  values (p_ip_hash, 'day', day_bucket_start, 1)
  on conflict (ip_hash, bucket, window_start)
  do update set request_count = public.short_link_rate_limits.request_count + 1
  returning request_count into day_count;

  allowed := minute_count <= minute_limit and day_count <= day_limit;
  retry_after_seconds := 0;

  if minute_count > minute_limit then
    retry_after_seconds := greatest(60 - mod(floor(extract(epoch from now_utc))::integer, 60), 1);
  elsif day_count > day_limit then
    retry_after_seconds := greatest(
      extract(epoch from ((day_bucket_start + interval '1 day') - now_utc))::integer,
      1
    );
  end if;

  delete from public.short_link_rate_limits
  where (bucket = 'minute' and window_start < now_utc - interval '2 days')
     or (bucket = 'day' and window_start < now_utc - interval '90 days');

  return query
    select allowed, minute_count, day_count, retry_after_seconds;
end;
$$;

create or replace function public.enforce_short_link_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  max_rows constant integer := 3000;
  current_rows integer := 0;
begin
  select count(*) into current_rows
  from public.short_links;

  if current_rows >= max_rows then
    raise exception '단축 주소 저장 공간이 가득 찼습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists short_links_capacity_trigger on public.short_links;

create trigger short_links_capacity_trigger
before insert on public.short_links
for each row
execute function public.enforce_short_link_capacity();
