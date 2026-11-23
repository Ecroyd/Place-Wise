import {getPlacewiseClient} from '@/src/lib/supabase/server';
import {feeForSession,STRIPE_APP_TAG,verifyWebhook,type CompletedSession} from '@/src/lib/server/stripe';
export const runtime='nodejs';

// Stripe calls this after a successful Checkout. The user is credited with what they
// paid minus Stripe's actual fee, once per session (replays are ignored).
export async function POST(request:Request){
 const secret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret)return Response.json({error:'Webhook not configured'},{status:503});
 const body=await request.text();
 if(!verifyWebhook(body,request.headers.get('stripe-signature'),secret))return Response.json({error:'Invalid signature'},{status:400});
 const event=JSON.parse(body) as {type:string;data:{object:CompletedSession}};
 if(event.type!=='checkout.session.completed'&&event.type!=='checkout.session.async_payment_succeeded')return Response.json({received:true});
 const session=event.data.object;
 // Ignore other sites' payments on a shared Stripe account (200 so Stripe doesn't retry).
 if(session.metadata?.app!==STRIPE_APP_TAG)return Response.json({received:true,ignored:true});
 if(session.payment_status!=='paid')return Response.json({received:true});
 const userId=session.metadata?.user_id;
 const paid=session.amount_total??0;
 if(!userId||session.currency!=='gbp'||paid<=0)return Response.json({error:'Unexpected session'},{status:400});
 try{
  const fee=await feeForSession(session);
  const credit=Math.max(0,paid-fee)*100;
  const {error}=await getPlacewiseClient().rpc('credit_topup',{p_user:userId,p_credit:credit,p_paid_pence:paid,p_fee_pence:fee,p_session:session.id});
  if(error)throw error;
  return Response.json({received:true});
 }catch(error){
  // A 500 makes Stripe retry later (e.g. when the fee is not reported yet).
  console.error('credit top-up failed',session.id,error);
  return Response.json({error:'Top-up could not be recorded yet'},{status:500});
 }
}
