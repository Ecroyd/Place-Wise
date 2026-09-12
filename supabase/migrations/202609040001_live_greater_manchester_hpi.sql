set search_path to placewise, public, extensions;

alter table location_cells add column if not exists price_data_date date;
alter table location_cells add column if not exists price_data_source text;

insert into location_cells (
  h3_index,resolution,centre_lat,centre_lng,boundary,town,local_authority,region,
  typical_house_price,typical_detached_price,typical_semi_price,typical_flat_price,
  data_quality_score,price_data_date,price_data_source,last_updated
) values
('871951b33ffffff',7,53.578,-2.429,ST_GeomFromText('POLYGON((-2.4367331813 53.5874788091,-2.4519193464 53.5805255361,-2.4481895348 53.5684647997,-2.4292819350 53.5633580297,-2.4141002470 53.5703100878,-2.4178216815 53.5823701301,-2.4367331813 53.5874788091))',4326),'Bolton','Bolton','Greater Manchester',202770,377904,222072,116964,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b25ffffff',7,53.593,-2.298,ST_GeomFromText('POLYGON((-2.3003773359 53.5947742325,-2.3155673464 53.5878427420,-2.3118710402 53.5757848012,-2.2929930984 53.5706590575,-2.2778075978 53.5775893431,-2.2814955289 53.5896465768,-2.3003773359 53.5947742325))',4326),'Bury','Bury','Greater Manchester',238446,405531,266129,132500,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b75ffffff',7,53.4808,-2.2426,ST_GeomFromText('POLYGON((-2.2332054452 53.4880194419,-2.2483665590 53.4810842925,-2.2446942125 53.4690152787,-2.2258690923 53.4638821322,-2.2107124863 53.4708160838,-2.2143764925 53.4828843790,-2.2332054452 53.4880194419))',4326),'Manchester','Manchester','Greater Manchester',251250,478105,327725,195385,100,'2026-06-01','HM Land Registry UK HPI',now()),
('8719424c1ffffff',7,53.5409,-2.1114,ST_GeomFromText('POLYGON((-2.1306662326 53.5485348951,-2.1458453978 53.5416233115,-2.1421945194 53.5295626923,-2.1233728310 53.5244143819,-2.1081982071 53.5313247742,-2.1118407301 53.5433846676,-2.1306662326 53.5485348951))',4326),'Oldham','Oldham','Greater Manchester',214850,379768,244930,131245,100,'2026-06-01','HM Land Registry UK HPI',now()),
('8719424f5ffffff',7,53.617,-2.156,ST_GeomFromText('POLYGON((-2.1525876957 53.6208650526,-2.1677868052 53.6139595614,-2.1641255960 53.6019067944,-2.1452736554 53.5967602385,-2.1300790941 53.6036645353,-2.1337319250 53.6157165819,-2.1525876957 53.6208650526))',4326),'Rochdale','Rochdale','Greater Manchester',210083,364192,226622,115699,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b76ffffff',7,53.4875,-2.2901,ST_GeomFromText('POLYGON((-2.2897297058 53.5034096011,-2.3048943987 53.4964678181,-2.3012069416 53.4843996922,-2.2823631381 53.4792740612,-2.2672029425 53.4862146419,-2.2708820529 53.4982820554,-2.2897297058 53.5034096011))',4326),'Salford','Salford','Greater Manchester',231890,446646,287524,162008,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b68ffffff',7,53.4106,-2.1575,ST_GeomFromText('POLYGON((-2.1433416392 53.4191797462,-2.1584847084 53.4122493759,-2.1548393324 53.4001740053,-2.1360592034 53.3950297351,-2.1209206510 53.4019589156,-2.1245577107 53.4140335556,-2.1433416392 53.4191797462))',4326),'Stockport','Stockport','Greater Manchester',314495,548759,344461,173714,100,'2026-06-01','HM Land Registry UK HPI',now()),
('8719424c9ffffff',7,53.489,-2.095,ST_GeomFromText('POLYGON((-2.0972809163 53.4951372723,-2.1124455894 53.4882238329,-2.1088066004 53.4761577127,-2.0900112758 53.4710057630,-2.0748511426 53.4779180147,-2.0784817938 53.4899834033,-2.0972809163 53.4951372723))',4326),'Tameside','Tameside','Greater Manchester',211304,368498,241914,124201,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b50ffffff',7,53.424,-2.318,ST_GeomFromText('POLYGON((-2.3241404244 53.4463602401,-2.3392888451 53.4394057700,-2.3355966825 53.4273307032,-2.3167644294 53.4222108175,-2.3016204887 53.4291640838,-2.3053043209 53.4412384391,-2.3241404244 53.4463602401))',4326),'Trafford','Trafford','Greater Manchester',396811,800316,448945,218367,100,'2026-06-01','HM Land Registry UK HPI',now()),
('871951b86ffffff',7,53.5448,-2.6318,ST_GeomFromText('POLYGON((-2.6528589965 53.5571786060,-2.6680335739 53.5501883888,-2.6642519716 53.5381212359,-2.6453041655 53.5330449738,-2.6301340098 53.5400339607,-2.6339072382 53.5521004394,-2.6528589965 53.5571786060))',4326),'Wigan','Wigan','Greater Manchester',195557,319223,204176,106731,100,'2026-06-01','HM Land Registry UK HPI',now())
on conflict (h3_index) do update set
 typical_house_price=excluded.typical_house_price,typical_detached_price=excluded.typical_detached_price,
 typical_semi_price=excluded.typical_semi_price,typical_flat_price=excluded.typical_flat_price,
 price_data_date=excluded.price_data_date,price_data_source=excluded.price_data_source,last_updated=now();

grant usage on schema placewise to anon, authenticated, service_role;
grant select on placewise.location_cells to anon, authenticated, service_role;
grant all on placewise.travel_time_cache to service_role;
grant usage, select on all sequences in schema placewise to service_role;
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, placewise';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
