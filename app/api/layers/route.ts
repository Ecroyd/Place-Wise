import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {inside,legacyGrade,matchesSchool,type SchoolFilter,type LayerData,type LayerPoint,type ViewBounds} from '@/src/lib/data/layers';
export const runtime='nodejs';
const schema=z.object({layer:z.enum(['schools','property','crime','parks','amenities','transport']),minimumPrice:z.coerce.number().nonnegative().default(0),maximumPrice:z.coerce.number().positive().default(1000000000),phase:z.string().max(50).default('All'),rating:z.enum(['all','legacy:1','legacy:2','legacy:3','legacy:4','new:Exceptional','new:Strong standard','new:Expected standard','new:Needs attention','new:Urgent improvement']).default('all'),reportArea:z.string().max(80).default('Achievement'),west:z.coerce.number().min(-180).max(180),east:z.coerce.number().min(-180).max(180),south:z.coerce.number().min(-85).max(85),north:z.coerce.number().min(-85).max(85)}).refine(b=>b.minimumPrice<=b.maximumPrice).refine(b=>b.east>b.west&&b.north>b.south&&b.east-b.west<=4&&b.north-b.south<=3);
const cache=new Map<string,{value:LayerData;expires:number}>();
async function json<T>(url:string,init:RequestInit={}):Promise<T>{const response=await fetch(url,{...init,signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error(`Data provider returned ${response.status}`);return response.json() as Promise<T>;}
interface School {id:string;name:string;phase:string;postcode:string;latitude:number;longitude:number;date?:string;grades:Record<string,string>;legacy?:string;legacyDate?:string;legacyGrades?:Record<string,string>}
let schoolData:Promise<{asOf:string;schools:School[]}>|undefined;
async function schools(bounds:ViewBounds & SchoolFilter):Promise<LayerData>{
  schoolData??=readFile(path.join(process.cwd(),'src/data/schools.json'),'utf8').then(text=>JSON.parse(text));
  const data=await schoolData;const matching=data.schools.filter(s=>inside(s,bounds)&&matchesSchool(s,bounds));
  const latitude=(bounds.north+bounds.south)/2,longitude=(bounds.east+bounds.west)/2;
  matching.sort((a,b)=>(a.latitude-latitude)**2+(a.longitude-longitude)**2-((b.latitude-latitude)**2+(b.longitude-longitude)**2));
  return {points:matching.slice(0,250).map(s=>({id:s.id,name:s.name,latitude:s.latitude,longitude:s.longitude,phase:s.phase,url:`https://reports.ofsted.gov.uk/provider/21/${s.id}`,details:[s.phase,s.postcode,'Approximate postcode location',...(Object.keys(s.grades).length?[`Report-card inspection: ${s.date??'date unavailable'}`,...Object.entries(s.grades).map(([k,v])=>`${k}: ${v}`)]:[`Legacy overall grade: ${legacyGrade(s.legacy)}`,`Graded inspection: ${s.legacyDate??'date unavailable'}`,...Object.entries(s.legacyGrades??{}).map(([name,value])=>`${name}: ${legacyGrade(value)}`)])]})),total:matching.length,note:`England state-funded schools · snapshot ${data.asOf}. Pins are postcode centres, not school entrances. Catchments and admission eligibility are not shown.${matching.length>250?' Nearest 250 shown; zoom in for more.':''}`,source:'Ofsted · OGL; postcode locations via Postcodes.io',sourceUrl:'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes'};
}
let osmQueue:Promise<unknown>=Promise.resolve();
async function osm(layer:'parks'|'amenities'|'transport',b:ViewBounds):Promise<LayerData>{
  const box=`(${b.south},${b.west},${b.north},${b.east})`;
  const selectors={parks:['[leisure~"^(park|nature_reserve|garden)$"]'],amenities:['[amenity~"^(doctors|pharmacy|clinic|hospital)$"]','[shop=supermarket]','[leisure=fitness_centre]'],transport:['[railway~"^(station|halt|tram_stop)$"]','[highway=bus_stop]']}[layer];
  const query=`[out:json][timeout:20];(${selectors.map(s=>`nwr${s}${box};`).join('')});out center tags 350;`;
  const load=()=>json<{elements:{type:string;id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}[]}>('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Placewise/1.0 (local area comparison map)'},body:new URLSearchParams({data:query})});
  const request=osmQueue.then(load,load);osmQueue=request.catch(()=>undefined);const payload=await request;
  if(!Array.isArray(payload.elements))throw new Error('Map data unavailable');
  const points=payload.elements.flatMap(item=>{const lat=item.lat??item.center?.lat,lon=item.lon??item.center?.lon;if(lat===undefined||lon===undefined)return [];const t=item.tags??{};return [{id:`${item.type}/${item.id}`,name:t.name??t.brand??t.ref??(layer==='transport'?'Transport stop':'Mapped place'),latitude:lat,longitude:lon,details:[(t.amenity??t.leisure??t.railway??t.shop??'Bus stop').replaceAll('_',' '),...[t.operator,t.opening_hours].filter((s):s is string=>!!s)],url:`https://www.openstreetmap.org/${item.type}/${item.id}`}];});
  return {points,note:`Mapped locations in this view; completeness varies.${points.length>=350?' First 350 shown; zoom in for more.':''} Click a pin for details.`,source:'© OpenStreetMap contributors · ODbL',sourceUrl:'https://www.openstreetmap.org/copyright'};
}
async function crime(b:ViewBounds):Promise<LayerData>{
  const latitude=(b.north+b.south)/2,longitude=(b.east+b.west)/2;
  const rows=await json<{category:string;month:string;location:{latitude:string;longitude:string;street:{name:string}}}[]>(`https://data.police.uk/api/crimes-street/all-crime?lat=${latitude}&lng=${longitude}`);
  if(!Array.isArray(rows))throw new Error('Crime data unavailable');
  const groups=new Map<string,{latitude:number;longitude:number;name:string;counts:Map<string,number>;total:number}>();
  for(const row of rows){if(!row.location)continue;const key=`${row.location.latitude},${row.location.longitude}`;const g=groups.get(key)??{latitude:Number(row.location.latitude),longitude:Number(row.location.longitude),name:row.location.street.name,counts:new Map(),total:0};g.total++;g.counts.set(row.category,(g.counts.get(row.category)??0)+1);groups.set(key,g);}
  return {points:[...groups].map(([id,g])=>({id,name:`${g.total} reported incidents · ${g.name}`,latitude:g.latitude,longitude:g.longitude,details:[`Month: ${rows[0]?.month??'latest available'}`,...[...g.counts].map(([name,count])=>`${name.replaceAll('-',' ')}: ${count}`),'Anonymised approximate location']})),note:`${rows.length} reports · ${rows[0]?.month??'latest available month'} · within 1 mile of map centre, not the whole view. These are reported counts, not population-adjusted risk. Scotland has limited coverage.`,source:'data.police.uk · OGL',sourceUrl:'https://data.police.uk/about/'};
}
async function property(b:ViewBounds & {minimumPrice:number;maximumPrice:number}):Promise<LayerData>{
  const lat=(b.north+b.south)/2,lon=(b.east+b.west)/2;
  const postcodes=await json<{result:{postcode:string;latitude:number;longitude:number}[]|null}>(`https://api.postcodes.io/postcodes?lat=${lat}&lon=${lon}&radius=1000&limit=100`);
  const codes=(postcodes.result??[]).filter(p=>/^[A-Z0-9 ]+$/.test(p.postcode));
  const source={source:'HM Land Registry Price Paid Data · OGL; Postcodes.io',sourceUrl:'https://www.gov.uk/government/collections/price-paid-data'};
  if(!codes.length)return {...source,points:[],note:'No UK postcodes found near the map centre. Price Paid Data covers England and Wales.'};
  const since=new Date();since.setUTCFullYear(since.getUTCFullYear()-2);
  const query=`PREFIX ppi: <http://landregistry.data.gov.uk/def/ppi/> PREFIX lr: <http://landregistry.data.gov.uk/def/common/> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> SELECT ?price ?date ?postcode WHERE { VALUES ?postcode { ${codes.map(p=>JSON.stringify(p.postcode)).join(' ')} } ?address lr:postcode ?postcode . ?sale ppi:propertyAddress ?address; ppi:pricePaid ?price; ppi:transactionDate ?date . FILTER(?price >= ${b.minimumPrice} && ?price <= ${b.maximumPrice}) FILTER(?date >= "${since.toISOString().slice(0,10)}"^^xsd:date) } ORDER BY DESC(?date) LIMIT 300`;
  const url=new URL('https://landregistry.data.gov.uk/landregistry/query');url.searchParams.set('query',query);url.searchParams.set('output','json');
  const data=await json<{results:{bindings:{price:{value:string};date:{value:string};postcode:{value:string}}[]}}>(url.toString(),{headers:{Accept:'application/sparql-results+json'}});
  const groups=new Map<string,{prices:number[];latest:string}>();
  for(const r of data.results.bindings){const group=groups.get(r.postcode.value)??{prices:[],latest:r.date.value};group.prices.push(Number(r.price.value));groups.set(r.postcode.value,group);}
  const points:LayerPoint[]=[];for(const [postcode,g] of groups){const p=codes.find(p=>p.postcode===postcode);if(!p)continue;const price=Math.round(g.prices.reduce((a,b)=>a+b,0)/g.prices.length);points.push({id:postcode,name:postcode,latitude:p.latitude,longitude:p.longitude,price,details:[`Mean matching sold price: £${price.toLocaleString('en-GB')}`,`${g.prices.length} matching sale(s) in this sample`,`Latest sale: ${g.latest.slice(0,10)}`,'Approximate postcode location; historical sales, not available listings']});}
  return {...source,points,note:`£${b.minimumPrice.toLocaleString('en-GB')}–£${b.maximumPrice.toLocaleString('en-GB')} per sale · last 2 years · up to 300 latest matching sales across the nearest 100 postcodes within 1 km of map centre. Postcode means are not valuations. Only sales within your selected price range are included. Contains HM Land Registry data © Crown copyright and database right 2021.`};
}
export async function GET(request:Request){const parsed=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!parsed.success)return Response.json({error:'Invalid map bounds'},{status:400});const b=parsed.data;
  if(b.layer!=='schools'&&(b.east-b.west>.22||b.north-b.south>.16))return Response.json({error:'Zoom in to load this layer.'},{status:422});
  const key=JSON.stringify(b);const cached=cache.get(key);if(cached&&cached.expires>Date.now())return Response.json(cached.value);
  try{const value=b.layer==='schools'?await schools(b):b.layer==='crime'?await crime(b):b.layer==='property'?await property(b):await osm(b.layer,b);if(cache.size>100)cache.delete(cache.keys().next().value!);cache.set(key,{value,expires:Date.now()+900000});return Response.json(value);}catch{return Response.json({error:'This data provider is temporarily unavailable. Try refreshing this layer.'},{status:502});}
}
