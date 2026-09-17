import fs from 'node:fs';
import path from 'node:path';
const source='https://assets.publishing.service.gov.uk/media/6aa0175392e72b8ac437ef37/Management_information_-_state-funded_schools_-_latest_inspections_as_at_31_August_2026.csv';
function csv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r+$/,''));rows.push(row);row=[];cell='';}else cell+=c;}return rows;}
(async()=>{
const response=await fetch(source);if(!response.ok)throw Error('School download failed');
const rows=csv(await response.text());const headers=rows.shift();
const records=rows.map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));
const clean=v=>v&&v!=='NULL'?v:undefined;
const fields=['Safeguarding standards','Inclusion','Curriculum and teaching','Achievement','Attendance and behaviour','Personal development and wellbeing','Early years (where applicable)','Post-16 provision (where applicable)','Leadership and governance'];
const schools=records.filter(r=>r.URN&&clean(r.Postcode)).map(r=>({id:r.URN,name:r['School name'],phase:r['Ofsted phase'],postcode:r.Postcode,date:clean(r['Inspection start date']),grades:Object.fromEntries(fields.filter(f=>clean(r[f])).map(f=>[f,r[f]])),legacy:clean(r['Latest OEIF overall effectiveness']),legacyGrades:Object.fromEntries(['quality of education','behaviour and attitudes','personal development','effectiveness of leadership and management'].filter(f=>clean(r['Latest OEIF '+f])).map(f=>[f,r['Latest OEIF '+f]])),legacyDate:clean(r['Inspection start date of latest OEIF graded inspection'])}));
const codes=[...new Set(schools.map(s=>s.postcode))];const locations=new Map();let next=0;
await Promise.all(Array.from({length:5},async()=>{while(next<codes.length){const start=next;next+=100;const batch=codes.slice(start,start+100);let success=false;for(let attempt=0;attempt<3&&!success;attempt++){try{const r=await fetch('https://api.postcodes.io/postcodes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postcodes:batch}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Postcode lookup failed');const p=await r.json();for(const item of p.result??[])if(item.result)locations.set(item.query,{latitude:item.result.latitude,longitude:item.result.longitude});success=true;}catch(e){if(attempt===2)throw e;}}if(start%2000===0)console.log('Located',start,'/',codes.length);}}));
const output=schools.filter(s=>locations.has(s.postcode)).map(s=>({...s,...locations.get(s.postcode)}));
fs.mkdirSync(path.join(process.cwd(),'src/data'),{recursive:true});
fs.writeFileSync(path.join(process.cwd(),'src/data/schools.json'),JSON.stringify({asOf:'2026-08-31',source,schools:output}));
console.log('Saved',output.length,'schools;',schools.length-output.length,'without postcode coordinates');
})();
