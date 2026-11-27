import {z} from 'zod';
import {recordEvent} from '@/src/lib/server/analytics';

// Anonymous page-visit, search and sign-up events from the browser (see src/lib/server/analytics.ts).
// Top-ups are recorded by the Stripe webhook instead, so they can't be faked from here.
const schema=z.object({kind:z.enum(['visit','search','signup']),path:z.string().max(120).optional(),detail:z.string().max(80).optional()});

export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return new Response(null,{status:400});
 const {kind,path,detail}=parsed.data;
 await recordEvent(kind,{request,path:kind==='visit'?path:undefined,detail:kind==='search'?detail:undefined});
 return new Response(null,{status:204});
}
