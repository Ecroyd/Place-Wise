import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('node:fs/promises',()=>({readFile:vi.fn(async()=>JSON.stringify({asOf:'2026-08-31',schools:[{id:'modern',name:'Modern school',latitude:51.5,longitude:-0.15,phase:'Primary',postcode:'SW1',date:'01/02/2026',grades:{Achievement:'Strong standard'}},{id:'legacy',name:'Older school',latitude:51.49,longitude:-0.16,phase:'Secondary',postcode:'SW2',grades:{},legacy:'2',legacyDate:'02/03/2023',legacyGrades:{'quality of education':'1'}},{id:'far',name:'Manchester school',latitude:53.5,longitude:-2.2,grades:{}}]}))}));
import {GET} from '../app/api/layers/route';
import {GET as flood} from '../app/api/flood/[kind]/route';
afterEach(()=>vi.unstubAllGlobals());
const request=(layer:string,extra='')=>new Request(`http://localhost/api/layers?layer=${layer}&west=-0.2&east=-0.1&south=51.48&north=51.51${extra}`);
describe('map layers',()=>{
 it('limits school results to the view and keeps modern and dated legacy inspections distinct',async()=>{const r=await GET(request('schools'));const data=await r.json();expect(data.points).toHaveLength(2);expect(data.points.find((p:{id:string})=>p.id==='modern').details).toContain('Achievement: Strong standard');expect(data.points.find((p:{id:string})=>p.id==='legacy').details).toContain('Legacy overall grade: Good');expect(data.points.find((p:{id:string})=>p.id==='legacy').details).toContain('quality of education: Outstanding');});
 it('rejects invalid bounds and limits large external queries',async()=>{expect((await GET(request('crime','&west=10'))).status).toBe(400);expect((await GET(request('parks','&west=-1'))).status).toBe(422);});
 it('reports outages instead of returning an empty healthy layer',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));expect((await GET(request('crime'))).status).toBe(502);});
 it('groups crime counts at anonymised locations and preserves the reporting month',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json([{category:'burglary',month:'2026-07',location:{latitude:'51.5',longitude:'-0.15',street:{name:'Near a street'}}},{category:'burglary',month:'2026-07',location:{latitude:'51.5',longitude:'-0.15',street:{name:'Near a street'}}}])));const data=await (await GET(request('crime'))).json();expect(data.points).toHaveLength(1);expect(data.points[0].details).toContain('burglary: 2');expect(data.note).toContain('within 1 mile');});
 it('does not present XML service errors as flood tiles',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('<ServiceException/>',{headers:{'content-type':'text/xml'}})));expect((await flood(new Request('http://localhost/api/flood/river?bbox=0,0,100,100'),{params:Promise.resolve({kind:'river'})})).status).toBe(502);});
 it('validates flood kind and coordinates before fetching',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect((await flood(new Request('http://localhost/api/flood/river?bbox=100,0,0,100'),{params:Promise.resolve({kind:'river'})})).status).toBe(400);expect(fetch).not.toHaveBeenCalled();});
});

describe('price and Ofsted filters',()=>{
 it('matches new report-card grades without treating legacy grades as equivalent',async()=>{
   const modern=await (await GET(request('schools','&rating=new:Strong%20standard&reportArea=Achievement'))).json();
   expect(modern.points.map((p:{id:string})=>p.id)).toEqual(['modern']);
   const legacy=await (await GET(request('schools','&rating=legacy:2'))).json();
   expect(legacy.points.map((p:{id:string})=>p.id)).toEqual(['legacy']);
 });
 it('combines school phase and inspection filters, excluding missing judgments',async()=>{
   expect((await (await GET(request('schools','&rating=legacy:2&phase=Primary'))).json()).points).toEqual([]);
   expect((await (await GET(request('schools','&rating=new:Strong%20standard&reportArea=Inclusion'))).json()).points).toEqual([]);
 });
 it('rejects reversed and negative house-price ranges',async()=>{
   expect((await GET(request('property','&minimumPrice=600000&maximumPrice=500000'))).status).toBe(400);
   expect((await GET(request('property','&minimumPrice=-1'))).status).toBe(400);
 });
 it('filters individual sales in the upstream query before averaging',async()=>{
   const fetch=vi.fn().mockResolvedValueOnce(Response.json({result:[{postcode:'SW3 2NT',latitude:51.49,longitude:-0.16}]})).mockResolvedValueOnce(Response.json({results:{bindings:[{price:{value:'400000'},date:{value:'2026-07-03'},postcode:{value:'SW3 2NT'}}]}}));
   vi.stubGlobal('fetch',fetch);
   const data=await (await GET(request('property','&minimumPrice=300000&maximumPrice=500000'))).json();
   const query=new URL(String(fetch.mock.calls[1][0])).searchParams.get('query');
   expect(query).toContain('?price >= 300000 && ?price <= 500000');
   expect(data.points[0].price).toBe(400000);
   expect(data.note).toContain('Only sales within your selected price range');
 });
});
