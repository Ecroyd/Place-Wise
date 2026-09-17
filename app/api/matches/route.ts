import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {destinationSchema,coordinatesSchema} from '@/src/schemas/criteria';
import {POST as nearby} from '../areas/route';
import {GET as layers} from '../layers/route';
import {getLiveRoutingProvider} from '@/src/lib/routing/provider';
import {distanceKm} from '@/src/lib/routing/commute';
import {matchesSchool,type LayerData} from '@/src/lib/data/layers';
import {routeFits,type CombinedMatch} from '@/src/lib/data/combined';
import type {NearbyArea} from '@/src/lib/data/nearby';
const schema=z.object({destinations:z.array(destinationSchema).min(1).max(3),center:coordinatesSchema.optional(),minimumPrice:z.number().nonnegative(),maximumPrice:z.number().positive(),school:z.object({enabled:z.boolean(),phase:z.string().max(50),rating:z.enum(['all','legacy:1','legacy:2','legacy:3','legacy:4','new:Exceptional','new:Strong standard','new:Expected standard','new:Needs attention','new:Urgent improvement']),reportArea:z.string().max(80),maximumWalkMinutes:z.number().min(1).max(60)})}).refine(v=>v.minimumPrice<=v.maximumPrice);
interface School {id:string;name:string;latitude:number;longitude:number;phase:string;grades:Record<string,string>;legacy?:string}
export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:'Check your destinations, price range and school filters.'},{status:400});
 const {destinations,center,minimumPrice,maximumPrice,school}=parsed.data;
 try{
  const areaResponse=await nearby(new Request('http://localhost/api/areas',{method:'POST',signal:request.signal,body:JSON.stringify({destinations,destination:destinations[0],center,budget:maximumPrice})}));
  const areaData=await areaResponse.json() as {areas?:NearbyArea[];error?:string};if(!areaResponse.ok)throw Error(areaData.error??'Area discovery unavailable');
  const areas=(areaData.areas??[]).filter(a=>a.withinLimits).slice(0,4);
  const points=new Map<string,LayerData['points'][number]>();let priceFailures=0;
  for(const area of areas){if(request.signal.aborted)return new Response(null,{status:499});const params=new URLSearchParams({layer:'property',west:String(area.longitude-.005),east:String(area.longitude+.005),south:String(area.latitude-.005),north:String(area.latitude+.005),minimumPrice:String(minimumPrice),maximumPrice:String(maximumPrice)});const response=await layers(new Request(`http://localhost/api/layers?${params}`));if(!response.ok){priceFailures++;continue;}const data=await response.json() as LayerData;for(const point of data.points)if(point.price!==undefined&&point.price>=minimumPrice&&point.price<=maximumPrice)points.set(point.id,point);}
  let schools:School[]=[];if(school.enabled){const data=JSON.parse(await readFile(path.join(process.cwd(),'src/data/schools.json'),'utf8')) as {schools:School[]};schools=data.schools.filter(s=>matchesSchool(s,school));}
  const candidates=[...points.values()].sort((a,b)=>distanceKm(a,center??destinations[0])-distanceKm(b,center??destinations[0])).slice(0,12);
  const matches:CombinedMatch[]=[];let routeFailures=0;let next=0;let checked=0;
  await Promise.all(Array.from({length:2},async()=>{while(next<candidates.length){const point=candidates[next++];if(request.signal.aborted)return;checked++;const journeys:CombinedMatch['journeys']=[];let valid=true;
   for(const destination of destinations){try{const route=await getLiveRoutingProvider(destination.transportMode).getTravelTime(point,destination,{transportMode:destination.transportMode,departureTime:destination.departureTime});if(!routeFits(route,destination)){valid=false;break;}journeys.push({label:destination.label,minutes:route.minutes,mode:route.selectedMode??destination.transportMode});}catch{routeFailures++;valid=false;break;}}
   if(!valid)continue;
   let selectedSchool:CombinedMatch['school'];
   if(school.enabled){const local=schools.filter(s=>distanceKm(s,point)<=school.maximumWalkMinutes/60*8).sort((a,b)=>distanceKm(a,point)-distanceKm(b,point)).slice(0,3);for(const candidate of local){try{const route=await getLiveRoutingProvider('walk').getTravelTime(point,candidate,{transportMode:'walk'});if(route.minutes<=school.maximumWalkMinutes){selectedSchool={name:candidate.name,minutes:route.minutes,url:`https://reports.ofsted.gov.uk/provider/21/${candidate.id}`};break;}}catch{routeFailures++;}}if(!selectedSchool)continue;}
   matches.push({id:point.id,name:point.name,latitude:point.latitude,longitude:point.longitude,price:point.price!,details:point.details,journeys,school:selectedSchool});
  }}));
  matches.sort((a,b)=>Math.max(...a.journeys.map(j=>j.minutes))-Math.max(...b.journeys.map(j=>j.minutes)));
  return Response.json({matches,checked,areaCount:areas.length,priceFailures,routeFailures,note:`Checked ${checked} postcode locations across ${areas.length} sampled areas. Up to 12 postcodes and the 3 nearest matching schools per postcode are tested. Historic sales within your price range; postcode-centre and school-postcode routes are approximate. This is a bounded shortlist, not an exhaustive search or a guarantee of admissions or available homes.`});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Combined search unavailable'},{status:502});}
}
