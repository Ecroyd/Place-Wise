// Downloads published school catchment boundaries from councils that release them as open
// map data (Open Government Licence), simplifies them, links each one to a school pin, and
// writes src/data/catchments.json. England has no national dataset, so each council is listed.
// Run: node scripts/refresh-catchments.mjs
import fs from 'node:fs';

const ARC='/query?where=1%3D1&outFields=*&outSR=4326&f=geojson';
const wfs=(base,typeName,version='2.0.0')=>base+'?'+new URLSearchParams({service:'WFS',version,request:'GetFeature',[version==='2.0.0'?'typeNames':'typeName']:typeName,outputFormat:version==='2.0.0'?'application/json':'json',srsName:'EPSG:4326',[version==='2.0.0'?'count':'maxFeatures']:'5000'});
const first=(...keys)=>p=>keys.map(k=>p[k]).find(v=>v!=null&&String(v).trim()&&String(v).trim()!=='None');

const EU1='https://services-eu1.arcgis.com/';
const RC='Catholic catchment',GAELIC='Gaelic-medium catchment';
// [council, base URL, [[layer path, phase, category, name fields, SEED fields]], council page]
const SCOTLAND=[
 ['Highland',EU1+'tc4hh050NPZgWq0B/arcgis/rest/services/',[['Primary_School_Catchments_-_open_data/FeatureServer/0','Primary','Catchment','NAME','SEED_CODE'],['Secondary_School_Catchments_-_open_data/FeatureServer/0','Secondary','Catchment','SECONDARY|NAME','SEED_CODE'],['Gaelic_Medium_Primary_School_Catchments_-_open_data/FeatureServer/0','Primary',GAELIC,'NAME','SEED_CODE'],['Gaelic_Medium_Secondary_School_Catchments_-_open_data/FeatureServer/0','Secondary',GAELIC,'NAME','SEED_CODE']],'https://www.highland.gov.uk/'],
 ['Aberdeen',"https://services5.arcgis.com/0sktPVp3t1LvXc9z/ArcGIS/rest/services/",[['Primary_School_Catchments/FeatureServer/58','Primary','Catchment','NAME','SEED_CODE'],['Academy_School_Catchments/FeatureServer/5','Secondary','Catchment','NAME','SEED_CODE'],['RC_School_Catchments/FeatureServer/59','Primary',RC,'NAME','']],'https://www.aberdeencity.gov.uk/'],
 ['Aberdeenshire','https://services2.arcgis.com/VIguPNrHLCWUHr2B/arcgis/rest/services/',[['Primary_School_Catchments/FeatureServer/0','Primary','Catchment','school_name','seed'],['Secondary_School_Catchments/FeatureServer/0','Secondary','Catchment','school_name','seed']],'https://www.aberdeenshire.gov.uk/'],
 ['Dundee','https://services.arcgis.com/GlZ1P6ksdiXNYhvC/ArcGIS/rest/services/SchoolsAndCatchments/FeatureServer/',[['1','Secondary','Catchment','School','SEED'],['2','Primary',RC,'School','SEED'],['3','Primary','Catchment','School','SEED'],['4','Secondary',RC,'School','SEED']],'https://www.dundeecity.gov.uk/'],
 ['Edinburgh','https://edinburghcouncilmaps.info/arcgis/rest/services/Atlas/Atlas/MapServer/',[['117','Primary','Catchment','SCHOOL_NAM',''],['118','Primary',RC,'SCHOOL_NAM',''],['119','Secondary','Catchment','SCHOOL',''],['120','Secondary',RC,'SCH_NAME','']],'https://www.edinburgh.gov.uk/'],
 ['Glasgow','https://utility.arcgis.com/usrsvcs/servers/2bfa782d5da84302bf15219e19a05112/rest/services/OPEN_DATA/Schools_Catchments_Open/MapServer/',[['5','Primary',GAELIC,'NAME','SEEDCODE1|SEEDCODES'],['6','Primary','Catchment','NAME','SEEDCODE1|SEEDCODES'],['7','Secondary','Catchment','NAME','SEEDCODE1|SEEDCODES'],['8','Primary',RC,'NAME','SEEDCODE1|SEEDCODES'],['9','Secondary',RC,'LINKTEXT|NAME','SEEDCODE1|SEEDCODES']],'https://www.glasgow.gov.uk/'],
 ['Perth & Kinross',EU1+'WD0cvOmDKf7CA0Xy/arcgis/rest/services/',[['Primary_School_Catchments/FeatureServer/28','Primary','Catchment','NAME','SEED_CODE'],['Secondary_School_Catchments/FeatureServer/27','Secondary','Catchment','NAME','SEED_CODE'],['Roman_Catholic_Primary_School_Catchments/FeatureServer/6','Primary',RC,'NAME','SEED_CODE'],['Roman_Catholic_Secondary_School_Catchments/FeatureServer/27','Secondary',RC,'NAME','SEED_CODE'],['St_Ninians_Catchment/FeatureServer/6','Primary','Episcopal catchment','NAME','SEED_CODE']],'https://www.pkc.gov.uk/'],
 ['North Lanarkshire',EU1+'9edRUxcMgH07BEka/arcgis/rest/services/',[['Non_Denominational_Primary_Catchments_View/FeatureServer/0','Primary','Catchment','name','seed_code'],['Denominational_Primary_Catchments_View/FeatureServer/0','Primary',RC,'name','seed_code'],['Non_Denominational_Secondary_Catchments_View/FeatureServer/0','Secondary','Catchment','name','seedcode|seed_code'],['Denominational_Secondary_Catchments_View/FeatureServer/0','Secondary',RC,'name','seedcode|seed_code']],'https://www.northlanarkshire.gov.uk/'],
 ['North Ayrshire','https://www.maps.north-ayrshire.gov.uk/arcgis/rest/services/AGOL/Spatial_Hub/FeatureServer/',[['44','Primary','Catchment','NAME','SEED'],['45','Primary',RC,'NAME','SEED'],['46','Secondary','Catchment','NAME','SEED'],['47','Secondary',RC,'NAME','SEED']],'https://www.north-ayrshire.gov.uk/'],
 ['South Ayrshire','https://gisext.south-ayrshire.gov.uk/server/rest/services/Inspire/OpenData/MapServer/',[['24','Primary','Catchment','ndprimary|schoolname','seed'],['26','Secondary','Catchment','ndsecondar|schoolname','seed'],['27','Secondary',RC,'schoolname','seed']],'https://www.south-ayrshire.gov.uk/'],
 ['Stirling',EU1+'cECIr59LclpO818r/arcgis/rest/services/',[['open_data_primary_school_catchments/FeatureServer/0','Primary','Catchment','School_Name','Seed_Code'],['open_data_secondary_school_catchments/FeatureServer/0','Secondary','Catchment','School_Name','Seed_Code']],'https://www.stirling.gov.uk/'],
 ['Fife',EU1+'PDjKizfiWWTgpUeI/arcgis/rest/services/',[['Primary_School_Catchment/FeatureServer/30','Primary','Catchment','SCHOOL_NAM',''],['Secondary_School_Catchment/FeatureServer/31','Secondary','Catchment','SCHOOL_NAM','SEED_CODE'],['Denominational_Primary_School_Catchment/FeatureServer/32','Primary',RC,'SCHOOL_NAM','SEED_CODE'],['Denominational_Secondary_School_Catchment/FeatureServer/33','Secondary',RC,'SCHOOL_NAM','SEED_CODE']],'https://www.fife.gov.uk/'],
 ['Argyll & Bute','https://arcgis.argyll-bute.gov.uk/arcgis/rest/services/Open_Data/MapServer/',[['24','Primary','Catchment','NM','SEEDCODE'],['25','Secondary','Catchment','SEC','SEEDCODE']],'https://www.argyll-bute.gov.uk/'],
 ['Angus','https://angus.maps.xmap.cloud/angus_public/',[['primary_school_catchment/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=angus_public:primary_school_catchment&outputFormat=application/json&srsName=EPSG:4326','Primary','Catchment','school_name',''],['secondary_school_catchment/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=angus_public:secondary_school_catchment&outputFormat=application/json&srsName=EPSG:4326','Secondary','Catchment','school_name',''],['denominational_primary_school_catchment/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=angus_public:denominational_primary_school_catchment&outputFormat=application/json&srsName=EPSG:4326','Primary',RC,'school_name','']],'https://www.angus.gov.uk/'],
];
// Each source: council, layer URL, phase (fixed or from the feature), name/URN fields, category.
const SOURCES=[
 ...[['mv_primary_catchments','Primary','Catchment'],['mv_secondary_catchments','Secondary','Catchment'],['mv_catholic_primary_catchments','Primary','Catholic associated area'],['mv_catholic_secondary_catchments','Secondary','Catholic associated area']].map(([layer,phase,category])=>({
  council:'Stockport',url:wfs('https://spatial.stockport.gov.uk/geoserver/ows','education:'+layer),phase,category,name:first('school_name','name'),urn:first('urn'),id:p=>layer+':'+p.ogc_fid,sourceUrl:'https://www.stockport.gov.uk/find-your-catchment-area'})),
 {council:'Sheffield',url:'https://sheffieldcitycouncil.cloud.esriuk.com/server/rest/services/AGOL/OpenData/FeatureServer/1'+ARC,phase:'Primary',name:first('catchment'),sourceUrl:'https://data-sheffieldcitycouncil.opendata.arcgis.com/'},
 {council:'Sheffield',url:'https://sheffieldcitycouncil.cloud.esriuk.com/server/rest/services/AGOL/OpenData/FeatureServer/3'+ARC,phase:'Secondary',name:first('catchment'),sourceUrl:'https://data-sheffieldcitycouncil.opendata.arcgis.com/'},
 {council:'Cheshire',url:wfs('https://maps.cheshireeast.gov.uk/geoserver/CWaCOpenData/wfs','CWaCOpenData:AU_S_PrimaryCatchments_POLY_CURRENT','1.1.0'),phase:'Primary',name:first('SCHOOL'),sourceUrl:'https://opendata-cheshirewestandchester.hub.arcgis.com/'},
 {council:'Cheshire',url:wfs('https://maps.cheshireeast.gov.uk/geoserver/CWaCOpenData/wfs','CWaCOpenData:AU_S_SecondaryCatchments_POLY_CURRENT','1.1.0'),phase:'Secondary',name:first('SCHOOL','HIGHSCHOOL'),sourceUrl:'https://opendata-cheshirewestandchester.hub.arcgis.com/'},
 {council:'Wiltshire',url:'https://maps.wiltshire.gov.uk/arcgis/rest/services/OpenData/SchoolCatchmentAreas/FeatureServer/7'+ARC,phase:'Primary',name:first('Official_n','NAME'),urn:first('Checked'),sourceUrl:'https://www.wiltshire.gov.uk/'},
 {council:'Wiltshire',url:'https://maps.wiltshire.gov.uk/arcgis/rest/services/OpenData/SchoolCatchmentAreas/FeatureServer/6'+ARC,phase:'Secondary',name:first('Establishment_Name'),urn:first('URN'),sourceUrl:'https://www.wiltshire.gov.uk/'},
 ...[['School_Catchments_4_6','Primary'],['School_Catchments_7_10','Primary'],['School_Catchments_11_16','Secondary']].map(([layer,phase])=>({council:'Hampshire',url:`https://services-eu1.arcgis.com/JZryykSnmiY7YI6X/arcgis/rest/services/${layer}/FeatureServer/0`+ARC,phase,name:first('School'),sourceUrl:'https://www.hants.gov.uk/educationandlearning/admissions'})),
 {council:'Northumberland',url:'https://services2.arcgis.com/LrUbY6lLLgV3tEa5/arcgis/rest/services/School_Catchments_Master_View_/FeatureServer/0'+ARC,phase:p=>/first|primary/i.test(p.CATCHMENT_TYPE??'')?'Primary':'Secondary',name:first('SCHOOL_NAME'),sourceUrl:'https://www.northumberland.gov.uk/'},
 {council:'Nottingham',url:'https://services.arcgis.com/yvqphKcf9bBSnjX1/arcgis/rest/services/Primary_School_Catchments/FeatureServer/65'+ARC,phase:'Primary',name:first('Name'),sourceUrl:'https://www.nottinghamcity.gov.uk/'},
 {council:'Nottingham',url:'https://services.arcgis.com/yvqphKcf9bBSnjX1/arcgis/rest/services/Secondary_School_Catchments/FeatureServer/66'+ARC,phase:'Secondary',name:first('Name'),sourceUrl:'https://www.nottinghamcity.gov.uk/'},
 {council:'York',url:'https://maps.york.gov.uk/arcgis/rest/services/Public/EducationLearning/MapServer/3'+ARC,phase:'Primary',name:first('SchName','Schname'),sourceUrl:'https://www.york.gov.uk/'},
 {council:'York',url:'https://maps.york.gov.uk/arcgis/rest/services/Public/EducationLearning/MapServer/4'+ARC,phase:'Secondary',name:first('Schname','SchName'),sourceUrl:'https://www.york.gov.uk/'},
 {council:'Lancashire',url:'https://services-eu1.arcgis.com/9MmxkLJT84uEwsJx/arcgis/rest/services/Schools_Geographical_Priority_Areas/FeatureServer/0'+ARC,phase:'Secondary',category:'Geographical priority area',name:first('LONG_NAME'),sourceUrl:'https://www.lancashire.gov.uk/'},
 ...[[3,'Area of first priority'],[8,'Area of second priority']].map(([layer,category])=>({council:'Bristol',url:`https://maps2.bristol.gov.uk/server2/rest/services/ext/ll_education/MapServer/${layer}`+ARC,phase:'Secondary',category,name:first('SCHOOL_NAME'),urn:p=>String(p.ASSOCIATED_URN_LIST??'').split(/[,;\s]+/)[0],sourceUrl:'https://www.bristol.gov.uk/'})),
 {council:'East Sussex',url:'https://services7.arcgis.com/US7sVCsS6jE1eTXo/arcgis/rest/services/ESCC_ED_COMM_AREA_PRIMARY_view/FeatureServer/1'+ARC,phase:'Primary',category:'Community area',name:first('NAME'),sourceUrl:'https://www.eastsussex.gov.uk/'},
 {council:'East Sussex',url:'https://services7.arcgis.com/US7sVCsS6jE1eTXo/arcgis/rest/services/ESCC_ED_COMM_AREA_SEC_DIS_view/FeatureServer/0'+ARC,phase:'Secondary',category:'Community area',name:first('NAME'),sourceUrl:'https://www.eastsussex.gov.uk/'},
 {council:'Bracknell Forest',url:'https://services9.arcgis.com/5eO9hmsd8SoBl0Cj/arcgis/rest/services/PrimarySchoolsDesignatedAreas/FeatureServer/2'+ARC,phase:'Primary',category:'Designated area',name:first('School_1','Description'),sourceUrl:'https://www.bracknell-forest.gov.uk/'},

 // Scotland: councils that publish their own open catchments (Open Government Licence unless noted).
 // SEED codes link to Scottish school pins, stored as "scotland:<SEED>".
 ...SCOTLAND.flatMap(([council,base,layers,sourceUrl])=>layers.map(([path,phase,category,name,seed])=>({council,url:base+path+(path.includes('?')?'':ARC),phase,category,name:first(...name.split('|')),urn:p=>{const code=seed&&seed.split('|').map(k=>String(p[k]??'').trim()).find(v=>/^\d{5,8}$/.test(v));return code?'scotland:'+code:undefined;},sourceUrl}))),
];

// ArcGIS layers page at their transfer limit; follow resultOffset until everything is in.
async function download(url){
 const out=[];
 for(let offset=0;;){
  const page=url.includes('f=geojson')?url+`&resultOffset=${offset}&resultRecordCount=1000`:url;
  const r=await fetch(page,{headers:{'User-Agent':'Commutemap/0.1 (https://commutemap.co.uk)'},signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Error(`Download failed (${r.status}) ${url}`);
  const data=await r.json();if(data.error)throw Error(`${data.error.message??'Error'} ${url}`);
  out.push(...(data.features??[]));
  if(data.numberMatched>out.length&&!url.includes('f=geojson'))throw Error('Incomplete download '+url);
  if(!url.includes('f=geojson')||!(data.exceededTransferLimit||data.properties?.exceededTransferLimit)||!data.features?.length)return out;
  offset=out.length;
 }
}

// Douglas–Peucker simplification (~15 m) and 5-decimal rounding keep the file small.
function simplify(ring,tolerance=0.00014){
 if(ring.length<=4)return ring;
 // A closed ring starts and ends on the same point, so anchor on the point farthest from it too.
 let far=0,best=-1;for(let i=1;i<ring.length-1;i++){const d=(ring[i][0]-ring[0][0])**2+(ring[i][1]-ring[0][1])**2;if(d>best){best=d;far=i;}}
 const keep=new Uint8Array(ring.length);keep[0]=keep[far]=keep[ring.length-1]=1;const stack=[[0,far],[far,ring.length-1]];
 while(stack.length){const [a,b]=stack.pop();let max=0,index=-1;const [ax,ay]=ring[a],[bx,by]=ring[b];const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-12;
  for(let i=a+1;i<b;i++){const d=Math.abs(dy*ring[i][0]-dx*ring[i][1]+bx*ay-by*ax)/len;if(d>max){max=d;index=i;}}
  if(max>tolerance){keep[index]=1;stack.push([a,index],[index,b]);}}
 const out=ring.filter((_,i)=>keep[i]).map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)]);
 return out.length>=4?out:ring.map(([x,y])=>[+x.toFixed(5),+y.toFixed(5)]);
}
// Tolerance grows with the boundary's size: ~15 m for a town catchment, up to ~150 m for a
// 50 km rural Highland one, where coastline detail would only add megabytes.
function tidy(g){
 let w=180,e=-180,so=90,n=-90;for(const ring of (g.type==='Polygon'?g.coordinates:g.coordinates.flat()))for(const [x,y] of ring){if(x<w)w=x;if(x>e)e=x;if(y<so)so=y;if(y>n)n=y;}
 const span=Math.max(e-w,n-so);
 const tolerance=Math.min(0.0014,Math.max(0.00014,span*0.002));
 return g.type==='Polygon'?{type:'Polygon',coordinates:g.coordinates.map(r=>simplify(r,tolerance))}:{type:'MultiPolygon',coordinates:g.coordinates.map(p=>p.map(r=>simplify(r,tolerance)))};
}

// Link a boundary to a school pin: by URN when given, otherwise the best name match that
// sits inside or near the boundary (catchments almost always contain their own school).
const schools=[...JSON.parse(fs.readFileSync('src/data/schools.json','utf8')).schools,...JSON.parse(fs.readFileSync('src/data/regional-schools.json','utf8')).schools.filter(s=>s.country==='Scotland')];
const byUrn=new Map(schools.map(s=>[s.id,s]));
const STOP=new Set('the school schools primary infant infants junior juniors academy community county high college church england ce c of e rc roman catholic voluntary aided controlled va vc and st saint first middle secondary upper lower federation trust free nursery &'.split(' '));
const tokens=name=>new Set(String(name).toLowerCase().replace(/\bst\.?\b/g,'st').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w&&!STOP.has(w)));
const similarity=(a,b)=>{const x=tokens(a),y=tokens(b);if(!x.size||!y.size)return 0;let n=0;for(const w of x)if(y.has(w))n++;return n/Math.min(x.size,y.size)*(2*n/(x.size+y.size)>=.5?1:.8);};
const rings=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
const inside=(pt,g)=>rings(g).some(poly=>{let c=false;const r=poly[0];for(let i=0,j=r.length-1;i<r.length;j=i++){const [xi,yi]=r[i],[xj,yj]=r[j];if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)c=!c;}return c;});
function bbox(g){let w=180,e=-180,s=90,n=-90;for(const poly of rings(g))for(const [x,y] of poly[0]){w=Math.min(w,x);e=Math.max(e,x);s=Math.min(s,y);n=Math.max(n,y);}return {w,e,s,n};}
function matchSchool(name,urn,phase,geometry){
 if(urn&&byUrn.has(String(urn)))return byUrn.get(String(urn));
 if(!name)return undefined;
 const b=bbox(geometry),pad=0.03;
 const near=schools.filter(s=>s.longitude>=b.w-pad&&s.longitude<=b.e+pad&&s.latitude>=b.s-pad&&s.latitude<=b.n+pad);
 let best,score=0;
 for(const s of near){let v=similarity(name,s.name);if(!v)continue;if(inside([s.longitude,s.latitude],geometry))v+=.3;if(s.phase===phase)v+=.1;if(v>score){score=v;best=s;}}
 return score>=.75?best:undefined;
}

const features=[];const report=[];
for(const source of SOURCES){
 let raw;try{raw=await download(source.url);}catch(error){report.push(`${source.council}: FAILED ${error.message}`);continue;}
 let linked=0,count=0;
 raw.forEach((f,i)=>{
  if(!['Polygon','MultiPolygon'].includes(f.geometry?.type))return;
  const p=f.properties??{};const name=String(source.name(p)??'').trim();if(!name)return;
  const phase=typeof source.phase==='function'?source.phase(p):source.phase;
  const geometry=tidy(f.geometry);const school=matchSchool(name,source.urn?.(p),phase,geometry);if(school)linked++;count++;
  features.push({type:'Feature',geometry,properties:{id:source.id?.(p)??`${source.council}:${phase}:${source.category??'Catchment'}:${i}`,urn:school?.id??'',name:school?.name??name,phase,category:source.category??'Catchment',council:source.council,sourceUrl:source.sourceUrl}});
 });
 report.push(`${source.council} ${phase(source)}: ${count} boundaries, ${linked} linked to a school`);
}
function phase(source){return typeof source.phase==='function'?'all phases':source.phase;}
if(!features.some(f=>f.properties.council==='Stockport'))throw Error('Stockport download failed; keeping the previous file');
const councils=[...new Set(features.map(f=>f.properties.council))];
fs.writeFileSync('src/data/catchments.json',JSON.stringify({type:'FeatureCollection',retrievedAt:new Date().toISOString().slice(0,10),coverage:`Published catchment and priority-area boundaries from ${councils.join(', ')}`,councils,sourceUrl:'https://www.gov.uk/schools-admissions',features}));
console.log(report.join('\n'));
console.log('Saved',features.length,'boundaries from',councils.length,'councils');
