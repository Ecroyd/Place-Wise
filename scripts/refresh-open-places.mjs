// Builds the stored data behind the "Shops & services", "Parks" and "Transport stops" overlays,
// so they no longer depend on the public Overpass servers at request time.
//
// Inputs (download first; neither is kept in the repo):
//  1. Overture Maps places for Great Britain as CSV, e.g. with DuckDB (https://duckdb.org):
//     LOAD httpfs; LOAD spatial; SET s3_region='us-west-2';
//     COPY (SELECT round(ST_Y(ST_Centroid(geometry)),5) lat, round(ST_X(ST_Centroid(geometry)),5) lng,
//       names.primary name, taxonomy.primary tax, addresses[1].freeform street, addresses[1].postcode postcode,
//       round(confidence,2) conf
//     FROM read_parquet('s3://overturemaps-us-west-2/release/<release>/theme=places/type=place/*')
//     WHERE bbox.xmin>-8.7 AND bbox.xmax<1.9 AND bbox.ymin>49.8 AND bbox.ymax<60.95
//       AND coalesce(addresses[1].country,'GB') IN ('GB','UK')
//       AND coalesce(operating_status,'open') NOT IN ('permanently_closed','closed')
//       AND taxonomy.primary IN (<the categories listed in AMENITY and PARK below>))
//     TO 'gb-places.csv' (HEADER);
//  2. NaPTAN stops (DfT, OGL): https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv
//
// Run: node scripts/refresh-open-places.mjs <gb-places.csv> <access-nodes.csv> [overture release]
import fs from 'node:fs';

const [placesCsv,naptanCsv,release='2026-11-18.0']=process.argv.slice(2);
if(!placesCsv||!naptanCsv){console.error('Usage: node scripts/refresh-open-places.mjs <gb-places.csv> <access-nodes.csv> [release]');process.exit(1);}

// Minimal RFC 4180 CSV reader (quoted fields may contain commas, quotes and newlines).
function* rows(file){
 const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');let i=0,field='',row=[],quoted=false;
 for(;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;continue;}
  if(c==='"')quoted=true;else if(c===','){row.push(field);field='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';yield row;row=[];}else field+=c;}
 if(field||row.length){row.push(field);yield row;}
}
function table(file){const it=rows(file);const head=it.next().value;const out=[];for(const r of it){if(r.length<head.length)continue;out.push(Object.fromEntries(head.map((h,k)=>[h,r[k]])));}return out;}
const e5=v=>Math.round(Number(v)*1e5);
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();

const AMENITY={doctors_office:'GP surgery',family_practice:'GP surgery',pharmacy:'Pharmacy',drugstore:'Pharmacy',dental_clinic:'Dentist',general_dentistry:'Dentist',hospital:'Hospital',grocery_store:'Supermarket / grocer',supermarket:'Supermarket / grocer',hypermarket:'Supermarket / grocer',gym:'Gym'};
const PARK={park:'Park',nature_reserve:'Nature reserve',botanical_garden:'Garden',garden:'Garden',dog_park:'Dog park',national_park:'National park'};

// Each point is [latitude×1e5, longitude×1e5, type, name, extra?] sorted by latitude, with
// names and extras stored once in a shared string table (bus stop and town names repeat a lot).
function build(entries,typesOf,extra){
 const types=[...new Set(Object.values(typesOf))];const strings=[];const index=new Map();
 const ref=value=>{if(!index.has(value)){index.set(value,strings.length);strings.push(value);}return index.get(value);};
 const points=entries.map(e=>[e5(e.lat),e5(e.lng),types.indexOf(typesOf[e.tax]),ref(tidy(e.name)),...extra(e).map(ref)]);
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 return {types,strings,points};
}
// Overture: confidence of 0.6 or more weeds out most stale or mis-categorised listings.
const places=table(placesCsv).filter(p=>p.lat&&p.lng&&p.name&&Number(p.conf||0)>=0.6);
const amenities=build(places.filter(p=>p.tax in AMENITY),AMENITY,p=>{const address=[tidy(p.street),tidy(p.postcode)].filter(Boolean).join(', ');return address?[address]:[];});
// Overture's "park" category also catches car, retail, business and holiday parks.
const NOT_GREEN=/\b(car|retail|business|industrial|trading|trade|holiday|caravan|leisure|science|technology|tech|office|shopping|enterprise|distribution|home|lodge|paintball|trampoline|water|theme|safari|motor|cycle)\s*park\b|\bpaintball|trampoline|\bparking\b/i;
const parks=build(places.filter(p=>p.tax in PARK&&!NOT_GREEN.test(p.name)),PARK,()=>[]);

// NaPTAN: active stops only. Rail and metro stations have several entrances, so keep one per
// station name within ~300 m.
const STOP={BCT:'Bus stop',BCS:'Bus station',BCQ:'Bus station',RSE:'Rail station',TMU:'Tram / metro / underground',MET:'Tram / metro / underground',FER:'Ferry terminal',FBT:'Ferry terminal'};
const seen=new Map();const stops=[];
for(const s of table(naptanCsv)){
 if(s.Status!=='active'||!(s.StopType in STOP)||!s.Latitude||!s.Longitude)continue;
 const type=STOP[s.StopType];let name=tidy(s.CommonName);
 if(type==='Bus stop'&&s.Indicator&&!/^(o\/s|opp|adj|nr|near|by|before|after|o\/s\.)$/i.test(s.Indicator.trim())&&s.Indicator.length<=12)name+=` (${tidy(s.Indicator)})`;
 if(type!=='Bus stop'){const key=type+'|'+tidy(s.CommonName).toLowerCase().replace(/\b(rail|railway|station|entrance|main|tram|stop|metro|underground)\b/g,'').trim();const prev=seen.get(key);if(prev&&Math.abs(prev[0]-Number(s.Latitude))<0.003&&Math.abs(prev[1]-Number(s.Longitude))<0.005)continue;seen.set(key,[Number(s.Latitude),Number(s.Longitude)]);name=tidy(s.CommonName).replace(/\s+(Rail Station|Railway Station)?\s*(Entrance|Main Entrance)\b.*$/i,' Rail Station');}
 const locality=tidy(s.LocalityName);
 stops.push({lat:s.Latitude,lng:s.Longitude,tax:s.StopType,name,locality});
}
const transport=build(stops,STOP,s=>s.locality?[s.locality]:[]);

const write=(file,source,licence,sourceUrl,data)=>{fs.writeFileSync(file,JSON.stringify({source,licence,sourceUrl,builtAt:new Date().toISOString().slice(0,10),...data}));console.log(file,data.points.length,'points',(fs.statSync(file).size/1e6).toFixed(1),'MB');};
write('src/data/open-amenities.json',`Overture Maps places (${release})`,'CDLA-Permissive-2.0; includes OpenStreetMap data © OpenStreetMap contributors (ODbL)','https://overturemaps.org',amenities);
write('src/data/open-parks.json',`Overture Maps places (${release})`,'CDLA-Permissive-2.0; includes OpenStreetMap data © OpenStreetMap contributors (ODbL)','https://overturemaps.org',parks);
write('src/data/open-transport.json','NaPTAN (Department for Transport)','Open Government Licence v3.0','https://www.data.gov.uk/dataset/ff93ffc1-6656-47d8-9155-85ea0b8f2251/naptan',transport);
