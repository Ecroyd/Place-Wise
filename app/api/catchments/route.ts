import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {catchmentsInView,type CatchmentData} from '@/src/lib/data/catchments';
export const runtime='nodejs';
const schema=z.object({west:z.coerce.number().min(-180).max(180),east:z.coerce.number().min(-180).max(180),south:z.coerce.number().min(-85).max(85),north:z.coerce.number().min(-85).max(85),phase:z.enum(['All','Primary','Secondary','Nursery','Special','Pupil referral unit']).default('All'),school:z.string().regex(/^(?:\d{6}|(?:wales|scotland):\d{6,8})$/).or(z.literal('')).default('')}).refine(b=>b.west<b.east&&b.south<b.north);
let dataset:Promise<CatchmentData>|undefined;
export async function GET(request:Request){
  const parsed=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)return Response.json({error:'Invalid catchment request'},{status:400});
  try{dataset??=readFile(path.join(process.cwd(),'src/data/catchments.json'),'utf8').then(JSON.parse);const b=parsed.data;return Response.json(catchmentsInView(await dataset,b,b.phase,b.school));}
  catch{dataset=undefined;return Response.json({error:'Published catchment data is unavailable.'},{status:503});}
}
