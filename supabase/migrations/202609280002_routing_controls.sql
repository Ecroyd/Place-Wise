begin;
create table if not exists placewise.route_response_cache(key text primary key,payload jsonb not null,expires_at timestamptz not null);
create index if not exists route_response_cache_expiry_idx on placewise.route_response_cache(expires_at);
create table if not exists placewise.request_buckets(key text primary key,used integer not null,expires_at timestamptz not null);
alter table placewise.route_response_cache enable row level security;
alter table placewise.request_buckets enable row level security;
revoke all on placewise.route_response_cache,placewise.request_buckets from anon,authenticated;
grant select,insert,update,delete on placewise.route_response_cache to service_role;
create or replace function placewise.consume_request_budget(bucket text,maximum integer,window_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare consumed integer;
begin
 if maximum<1 or window_seconds<1 then return false; end if;
 delete from placewise.route_response_cache where expires_at<now();
 delete from placewise.request_buckets where expires_at<now();
 insert into placewise.request_buckets as existing(key,used,expires_at) values(bucket,1,now()+make_interval(secs=>window_seconds))
 on conflict(key) do update set used=existing.used+1 where existing.used<maximum
 returning used into consumed;
 return consumed is not null;
end; $$;
revoke all on function placewise.consume_request_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function placewise.consume_request_budget(text,integer,integer) to service_role;
commit;
