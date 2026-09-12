set search_path to placewise, public;
alter table travel_time_cache add column if not exists distance_km numeric(8,1);
delete from travel_time_cache where distance_km is null;
notify pgrst, 'reload schema';
