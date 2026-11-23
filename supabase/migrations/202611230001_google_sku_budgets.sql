begin;
-- Atomically consume several units (e.g. Route Matrix elements) from a bucket:
-- all or nothing, never exceeding the maximum.
create or replace function placewise.consume_request_units(bucket text,maximum integer,window_seconds integer,amount integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare consumed integer;
begin
 if maximum<1 or window_seconds<1 or amount<1 or amount>maximum then return false; end if;
 delete from placewise.request_buckets where expires_at<now();
 insert into placewise.request_buckets as existing(key,used,expires_at) values(bucket,amount,now()+make_interval(secs=>window_seconds))
 on conflict(key) do update set used=existing.used+amount where existing.used+amount<=maximum
 returning used into consumed;
 return consumed is not null;
end; $$;
revoke all on function placewise.consume_request_units(text,integer,integer,integer) from public,anon,authenticated;
grant execute on function placewise.consume_request_units(text,integer,integer,integer) to service_role;
commit;
