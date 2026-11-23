import {userFromRequest} from '@/src/lib/server/payer';
import {apiLimit} from '@/src/lib/server/budget';
import {createCheckoutSession,isTopupAmount} from '@/src/lib/server/stripe';
export const runtime='nodejs';

export async function POST(request:Request){
 const limited=await apiLimit(request,'checkout',10);if(limited)return limited;
 const payer=await userFromRequest(request).catch(()=>null);
 if(!payer)return Response.json({error:'Sign in to add usage credit.'},{status:401});
 const body=await request.json().catch(()=>null) as {amount?:unknown}|null;
 if(!isTopupAmount(body?.amount))return Response.json({error:'Choose £3, £5 or £10.'},{status:400});
 const origin=process.env.NEXT_PUBLIC_SITE_URL??new URL(request.url).origin;
 try{return Response.json({url:await createCheckoutSession(payer.userId,payer.email,body.amount,origin)});}
 catch(error){return Response.json({error:error instanceof Error?error.message:'Top-ups are unavailable right now.'},{status:503});}
}
