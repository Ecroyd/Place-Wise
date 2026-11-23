import {createHmac,timingSafeEqual} from 'node:crypto';

// Top-up amounts in pence. Stripe's processing fee is deducted from the credit.
export const TOPUP_AMOUNTS_PENCE=[300,500,1000] as const;
export type TopupAmount=typeof TOPUP_AMOUNTS_PENCE[number];
export function isTopupAmount(value:unknown):value is TopupAmount{return TOPUP_AMOUNTS_PENCE.includes(value as TopupAmount);}
// Stripe's standard UK card pricing, used only for the on-screen estimate and as a
// fallback when the real fee is not reported in GBP. The real fee is used otherwise.
export function estimatedFeePence(amountPence:number){return Math.round(amountPence*0.015)+20;}

function secretKey(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error('Top-ups are not configured yet.');return key;}
async function stripe<T>(path:string,init:{method?:'GET'|'POST';form?:Record<string,string>}={}):Promise<T>{
 const response=await fetch('https://api.stripe.com/v1/'+path,{method:init.method??'GET',signal:AbortSignal.timeout(15000),
  headers:{Authorization:'Bearer '+secretKey(),...(init.form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
  body:init.form?new URLSearchParams(init.form):undefined});
 const payload=await response.json() as T&{error?:{message?:string}};
 if(!response.ok)throw new Error(payload.error?.message??`Stripe request failed (${response.status})`);
 return payload;
}

export async function createCheckoutSession(userId:string,email:string|undefined,amount:TopupAmount,origin:string){
 const session=await stripe<{url:string}>('checkout/sessions',{method:'POST',form:{
  mode:'payment','client_reference_id':userId,'metadata[user_id]':userId,'payment_intent_data[metadata][user_id]':userId,
  'line_items[0][quantity]':'1','line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(amount),
  'line_items[0][price_data][product_data][name]':'Commutemap usage credit',
  'line_items[0][price_data][product_data][description]':'Pays Google for your own map lookups at cost. Not for profit; the card fee is deducted from the credit.',
  success_url:origin+'/?credits=success',cancel_url:origin+'/?credits=cancelled',
  ...(email?{customer_email:email}:{}),
 }});
 return session.url;
}

export type CompletedSession={id:string;client_reference_id?:string|null;metadata?:{user_id?:string}|null;amount_total?:number|null;currency?:string|null;payment_status?:string;payment_intent?:string|null};
// The actual Stripe fee for this payment, in pence.
export async function feeForSession(session:CompletedSession):Promise<number>{
 if(!session.payment_intent)throw new Error('Checkout session has no payment intent');
 const intent=await stripe<{latest_charge?:{balance_transaction?:{fee:number;currency:string}|null}|null}>(`payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge.balance_transaction`);
 const transaction=intent.latest_charge?.balance_transaction;
 if(!transaction)throw new Error('Stripe has not reported the fee yet; the webhook will be retried');
 return transaction.currency==='gbp'?transaction.fee:estimatedFeePence(session.amount_total??0);
}

// Verifies the Stripe-Signature header (HMAC-SHA256 of "timestamp.body").
export function verifyWebhook(body:string,header:string|null,secret:string,now=Date.now(),toleranceSeconds=300){
 if(!header)return false;
 const parts=header.split(',').map(part=>part.split('=') as [string,string]);
 const timestamp=Number(parts.find(([key])=>key==='t')?.[1]);
 if(!Number.isFinite(timestamp)||Math.abs(now/1000-timestamp)>toleranceSeconds)return false;
 const expected=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest();
 return parts.filter(([key])=>key==='v1').some(([,value])=>{const given=Buffer.from(value??'','hex');return given.length===expected.length&&timingSafeEqual(given,expected);});
}
