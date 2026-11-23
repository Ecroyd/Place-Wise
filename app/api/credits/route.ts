import {userFromRequest} from '@/src/lib/server/payer';
import {getPlacewiseClient} from '@/src/lib/supabase/server';
import {creditPerUnit,GOOGLE_USD_PER_1000,type GoogleSku} from '@/src/lib/server/budget';
import {estimatedFeePence,TOPUP_AMOUNTS_PENCE} from '@/src/lib/server/stripe';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// The signed-in user's balance, recent activity and the at-cost prices.
export async function GET(request:Request){
 const payer=await userFromRequest(request).catch(()=>null);
 if(!payer)return Response.json({error:'Sign in to see your usage credit.'},{status:401});
 const client=getPlacewiseClient();
 const [balance,ledger]=await Promise.all([
  client.from('credit_balances').select('balance').eq('user_id',payer.userId).maybeSingle(),
  client.from('credit_ledger').select('delta,kind,sku,units,paid_pence,fee_pence,created_at').eq('user_id',payer.userId).order('created_at',{ascending:false}).limit(20),
 ]);
 if(balance.error||ledger.error)return Response.json({error:'Usage credit is temporarily unavailable.'},{status:503});
 const skus=Object.keys(GOOGLE_USD_PER_1000) as GoogleSku[];
 return Response.json({
  balance:balance.data?.balance??0,
  ledger:ledger.data??[],
  prices:Object.fromEntries(skus.map(sku=>[sku,creditPerUnit(sku)])),
  topups:TOPUP_AMOUNTS_PENCE.map(amount=>({amount,estimatedFee:estimatedFeePence(amount)})),
  enabled:Boolean(process.env.STRIPE_SECRET_KEY),
 },{headers:{'Cache-Control':'no-store'}});
}
