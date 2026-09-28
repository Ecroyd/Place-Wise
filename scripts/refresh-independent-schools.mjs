import fs from 'node:fs';
import path from 'node:path';
// Download Establishment fields CSV from the public GIAS Downloads page first.
const [file, asOf] = process.argv.slice(2);
if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) throw Error('Usage: node scripts/refresh-independent-schools.mjs GIAS.csv YYYY-MM-DD');
function csv(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r+$/,''));rows.push(row);row=[];cell='';}else cell+=c;}
  if(cell||row.length){row.push(cell.replace(/\r+$/,''));rows.push(row);}return rows;
}
const rows=csv(fs.readFileSync(file,'utf8'));const headers=rows.shift();
const schools=[];
for(const row of rows){const r=Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
  if(!r['TypeOfEstablishment (name)']?.toLowerCase().includes('independent')||!['Open','Open, but proposed to close'].includes(r['EstablishmentStatus (name)']))continue;
  const low=Number(r.StatutoryLowAge),high=Number(r.StatutoryHighAge);
  const special=r['TypeOfEstablishment (name)'].toLowerCase().includes('special');
  const phases=special?['Special']:[...(low<5?['Nursery']:[]),...(low<11&&high>=5?['Primary']:[]),...(low<18&&high>=11?['Secondary']:[])];
  schools.push({id:r.URN,name:r.EstablishmentName,sector:'independent',phase:special?'Special':r['PhaseOfEducation (name)']==='Not applicable'?'All-through':r['PhaseOfEducation (name)'],phases,postcode:r.Postcode,ageRange:low+'–'+high,inspectorate:r['InspectorateName (name)']||'Not recorded',grades:{},url:'https://www.get-information-schools.service.gov.uk/Establishments/Establishment/Details/'+r.URN});
}
const codes=[...new Set(schools.map(s=>s.postcode).filter(Boolean))];const locations=new Map();
for(let i=0;i<codes.length;i+=100){const r=await fetch('https://api.postcodes.io/postcodes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postcodes:codes.slice(i,i+100)}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Postcode lookup failed: '+r.status);for(const item of (await r.json()).result??[])if(item.result)locations.set(item.query,{latitude:item.result.latitude,longitude:item.result.longitude});}
const located=schools.filter(s=>locations.has(s.postcode)).map(s=>({...s,...locations.get(s.postcode)}));
if(located.length<1500)throw Error('Unexpectedly incomplete independent school data');
fs.writeFileSync(path.join(process.cwd(),'src/data/independent-schools.json'),JSON.stringify({asOf,source:'https://www.get-information-schools.service.gov.uk/Downloads',omitted:schools.length-located.length,schools:located}));
console.log('Saved',located.length,'independent schools;',schools.length-located.length,'without coordinates');
