import fs from 'node:fs';
import path from 'node:path';
// Welsh WFS GeoJSON and Scottish Open Schools JSON (see extract-scottish-schools.py).
const [welshFile,scottishFile,welshDate,scottishDate]=process.argv.slice(2);
if(!welshFile||!scottishFile||![welshDate,scottishDate].every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d??'')))throw Error('Usage: node scripts/refresh-regional-schools.mjs wales.geojson scotland.json YYYY-MM-DD YYYY-MM-DD');
const welsh=JSON.parse(fs.readFileSync(welshFile,'utf8'));
const scottish=JSON.parse(fs.readFileSync(scottishFile,'utf8'));
const schools=welsh.features.map(f=>{
 const p=f.properties;const phases=({Cynradd:['Primary'],Uwchradd:['Secondary'],Arbennig:['Special'],Meithrin:['Nursery'],Canol:['Primary','Secondary']})[p.sector];
 if(!phases)throw Error('Unknown Welsh sector: '+p.sector);
 const allPhases=[...phases];if((p.school_type.includes('Nursery')||p.school_type.includes('ages 3-'))&&!allPhases.includes('Nursery'))allPhases.push('Nursery');
 return {id:'wales:'+p.school_code,name:p.school_name,country:'Wales',sector:'state',phase:phases.length>1?'All-through':phases[0],phases:allPhases,postcode:p.postcode,latitude:f.geometry.coordinates[1],longitude:f.geometry.coordinates[0],locationLabel:'Official school location',inspectorate:'Estyn',grades:{},url:'https://estyn.gov.wales/latest-inspection-reports/'};
});
const codes=[...new Set(scottish.map(s=>s['Post Code']?.trim()).filter(Boolean))];const locations=new Map();
for(let i=0;i<codes.length;i+=100){const response=await fetch('https://api.postcodes.io/postcodes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postcodes:codes.slice(i,i+100)}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Postcode lookup failed: '+response.status);for(const item of (await response.json()).result??[])if(item.result)locations.set(item.query,{latitude:item.result.latitude,longitude:item.result.longitude});}
let omitted=0;
for(const s of scottish){const postcode=s['Post Code']?.trim();const location=locations.get(postcode);if(!location){omitted++;continue;}
 const phases=[['Special','Special Department'],['Primary','Primary Department'],['Secondary','Secondary Department'],['Nursery','Pre-school Department']].filter(([,key])=>s[key]==='Yes').map(([phase])=>phase);
 if(!phases.length)throw Error('No phase for Scottish school '+s['Seed Code']);
 schools.push({id:'scotland:'+s['Seed Code'],name:s['School Name'],country:'Scotland',sector:'state',phase:phases.includes('Special')?'Special':phases.includes('Primary')&&phases.includes('Secondary')?'All-through':phases[0],phases,postcode,...location,locationLabel:'Approximate postcode location',inspectorate:'HM Inspectorate of Education in Scotland',grades:{},url:'https://educationinspectorate.gov.scot/inspection-reports/find-an-inspection-report/'});
}
if(schools.filter(s=>s.country==='Wales').length<1300||schools.filter(s=>s.country==='Scotland').length<2200||new Set(schools.map(s=>s.id)).size!==schools.length||schools.some(s=>!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)))throw Error('Incomplete or invalid regional school data');
const data={sources:[{country:'Wales',asOf:welshDate,url:'https://datamap.gov.wales/layers/geonode:maintained_schools_wg',licence:'OGL v3'},{country:'Scotland',asOf:scottishDate,url:'https://www.gov.scot/publications/school-contact-details/',licence:'OGL v3',omitted}],schools};
fs.writeFileSync(path.join(process.cwd(),'src/data/regional-schools.json'),JSON.stringify(data));
console.log(JSON.stringify({Wales:schools.filter(s=>s.country==='Wales').length,Scotland:schools.filter(s=>s.country==='Scotland').length,omitted}));
