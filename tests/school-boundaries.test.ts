import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {matchesSchool} from '../src/lib/data/layers';
import {catchmentsInView,type CatchmentData} from '../src/lib/data/catchments';
const independent={phase:'All-through',phases:['Primary','Secondary'],sector:'independent',grades:{}};
describe('school sectors and published boundaries',()=>{
  it('includes independent all-through schools at both phases without assigning grades',()=>{
    expect(matchesSchool(independent,{sector:'independent',phase:'Primary'})).toBe(true);
    expect(matchesSchool(independent,{sector:'independent',phase:'Secondary'})).toBe(true);
    expect(matchesSchool(independent,{sector:'state'})).toBe(false);
    expect(matchesSchool(independent,{rating:'legacy:1'})).toBe(false);
    expect(matchesSchool(independent,{rating:'new:Strong standard'})).toBe(false);
    expect(matchesSchool({phase:'Primary',grades:{}},{sector:'state'})).toBe(true);
  });
  it('returns actual supplied geometry, including boundaries enclosing the view',()=>{
    const data:CatchmentData={type:'FeatureCollection',retrievedAt:'2026-09-28',coverage:'Fixture',sourceUrl:'https://example.test',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]]]},properties:{id:'one',urn:'123456',name:'Example',phase:'Primary',category:'Catchment',council:'Example',sourceUrl:'https://example.test'}}]};
    const b={west:1,east:2,south:1,north:2};
    expect(catchmentsInView(data,b).features[0].geometry).toEqual(data.features[0].geometry);
    expect(catchmentsInView(data,b,'Secondary').features).toHaveLength(0);
    expect(catchmentsInView(data,b,'All','999999').features).toHaveLength(0);
    expect(catchmentsInView(data,{west:10,east:11,south:10,north:11}).features).toHaveLength(0);
  });
  it('ships official independent records without manufactured catchments or ratings',()=>{
    const data=JSON.parse(readFileSync('src/data/independent-schools.json','utf8'));
    expect(data.schools.length).toBeGreaterThan(2000);
    expect(data.schools.some((s:{name:string})=>s.name.includes('Manchester Grammar'))).toBe(true);
    for(const s of data.schools){expect(s.sector).toBe('independent');expect(s.grades).toEqual({});expect(s.catchment).toBeUndefined();expect(Number.isFinite(s.latitude)).toBe(true);}
  });
});

vi.mock('node:fs/promises',()=>({readFile:vi.fn(async(file:string)=>JSON.stringify(file.includes('independent-schools')?{asOf:'2026-09-28',schools:[{id:'123456',name:'Private school',...independent,postcode:'M1',latitude:53.48,longitude:-2.24,ageRange:'4–18',inspectorate:'Independent Schools Inspectorate',url:'https://www.get-information-schools.service.gov.uk/Establishments/Establishment/Details/123456'}]}:{asOf:'2026-08-31',schools:[]}))}));
import {GET} from '../app/api/layers/route';
it('shows private records in the API and links to GIAS instead of inventing Ofsted ratings',async()=>{
  const response=await GET(new Request('http://localhost/api/layers?layer=schools&sector=independent&phase=Secondary&west=-2.3&east=-2.2&south=53.4&north=53.5'));
  const data=await response.json();expect(response.status).toBe(200);expect(data.points).toHaveLength(1);expect(data.points[0].urlLabel).toBe('View official school record');expect(data.points[0].details).toContain('Inspectorate: Independent Schools Inspectorate');
});
