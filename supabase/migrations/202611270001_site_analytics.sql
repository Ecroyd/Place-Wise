-- Cookie-free site analytics for the owner's "Site stats" panel.
-- Events are anonymous: a visitor is a salted hash that changes every day, so nobody can be
-- followed across days and no IP address or user id is stored. Only the server (service role)
-- can write or read; browsers have no access.
begin;

create table if not exists placewise.site_events(
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 day date not null default (now() at time zone 'Europe/London')::date,
 kind text not null check (kind in ('visit','search','signup','topup')),
 visitor text,            -- daily salted hash, not reversible
 path text,               -- page path for visits
 detail text,             -- searched area name, or top-up amount in pence
 device text check (device in ('mobile','desktop'))
);
create index if not exists site_events_day_kind on placewise.site_events(day,kind);
alter table placewise.site_events enable row level security;
revoke all on placewise.site_events from public,anon,authenticated;

-- Who may see the stats. Add yourself once (see the instructions you were given).
create table if not exists placewise.site_admins(user_id uuid primary key references auth.users(id) on delete cascade);
alter table placewise.site_admins enable row level security;
revoke all on placewise.site_admins from public,anon,authenticated;
-- Only the server (service role) reads and writes these tables.
grant select,insert,delete on placewise.site_events to service_role;
grant select on placewise.site_admins to service_role;

-- Everything the panel shows, in one call. p_days is the length of the daily chart.
create or replace function placewise.site_stats(p_days integer default 30) returns jsonb
language sql stable security definer set search_path='' as $$
 with today as (select (now() at time zone 'Europe/London')::date as d),
 span as (select e.* from placewise.site_events e,today where e.day>today.d-p_days),
 totals as (
  select label,
   count(distinct visitor) filter (where kind='visit') as visitors,
   count(*) filter (where kind='visit') as visits,
   count(*) filter (where kind='search') as searches,
   count(*) filter (where kind='signup') as signups,
   count(*) filter (where kind='topup') as topups,
   coalesce(sum(nullif(detail,'')::integer) filter (where kind='topup'),0) as topup_pence,
   count(distinct visitor) filter (where kind='visit' and device='mobile') as mobile_visitors
  from (select 'today' as label,e.* from span e,today where e.day=today.d
        union all select '7d',e.* from span e,today where e.day>today.d-7
        union all select '30d',e.* from span e,today where e.day>today.d-30) t
  group by label),
 daily as (
  select g.day::date as day,
   count(distinct e.visitor) filter (where e.kind='visit') as visitors,
   count(*) filter (where e.kind='search') as searches
  from today,generate_series(today.d-(p_days-1),today.d,interval '1 day') g(day)
  left join placewise.site_events e on e.day=g.day::date
  group by g.day order by g.day),
 places as (
  select detail as place,count(*) as searches from span where kind='search' and detail is not null and detail<>''
  group by detail order by count(*) desc limit 10),
 pages as (
  select path,count(*) as visits from span where kind='visit' and path is not null group by path order by count(*) desc limit 8)
 select jsonb_build_object(
  'totals',(select jsonb_object_agg(label,to_jsonb(totals)-'label') from totals),
  'daily',(select coalesce(jsonb_agg(to_jsonb(daily)),'[]'::jsonb) from daily),
  'places',(select coalesce(jsonb_agg(to_jsonb(places)),'[]'::jsonb) from places),
  'pages',(select coalesce(jsonb_agg(to_jsonb(pages)),'[]'::jsonb) from pages),
  'accounts',(select count(*) from auth.users),
  'generatedAt',now());
$$;
revoke all on function placewise.site_stats(integer) from public,anon,authenticated;
grant execute on function placewise.site_stats(integer) to service_role;

-- Keep a year of events.
create or replace function placewise.prune_site_events() returns void language sql security definer set search_path='' as $$
 delete from placewise.site_events where day<(now() at time zone 'Europe/London')::date-366;
$$;
revoke all on function placewise.prune_site_events() from public,anon,authenticated;
grant execute on function placewise.prune_site_events() to service_role;
commit;
