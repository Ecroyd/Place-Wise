"use client";
import {useEffect,useState} from 'react';
import {authHeaders} from '@/src/lib/supabase/browser';

type Credits={balance:number;enabled:boolean;prices:Record<string,number>;topups:{amount:number;estimatedFee:number}[];
 ledger:{delta:number;kind:string;sku?:string|null;units?:number|null;paid_pence?:number|null;fee_pence?:number|null;created_at:string}[]};

// Credit is stored in hundredths of a penny.
const pounds=(hundredthsOfPenny:number)=>'£'+(hundredthsOfPenny/10000).toFixed(2);
const pence=(hundredthsOfPenny:number)=>(hundredthsOfPenny/100).toLocaleString('en-GB',{maximumFractionDigits:2})+'p';
const SKU_LABEL:Record<string,string>={routes:'public transport, walking or cycling journey',matrix:'travel-time map point',geocoding:'place lookup','routes-pro':'traffic-aware drive','matrix-pro':'traffic-aware map point'};

// After Stripe sends someone back, the credit arrives a few seconds later (once Stripe
// reports its fee), so keep checking for up to a minute and confirm when it lands.
export function UsageCredit({awaitingTopUp=false}:{awaitingTopUp?:boolean}){
 const [credits,setCredits]=useState<Credits|null>(null);
 const [error,setError]=useState('');const [busy,setBusy]=useState<number|null>(null);
 const [arrived,setArrived]=useState<Credits['ledger'][number]|null>(null);const [waiting,setWaiting]=useState(awaitingTopUp);
 useEffect(()=>{
  let active=true;let timer:ReturnType<typeof setTimeout>|undefined;const since=Date.now()-10*60000;let attempts=0;
  const load=async()=>{
   const response=await fetch('/api/credits',{headers:await authHeaders(),cache:'no-store'});
   const payload=await response.json() as Credits&{error?:string};
   if(!active)return;
   if(!response.ok){setError(payload.error??'Usage credit is unavailable.');return;}
   setCredits(payload);
   if(!awaitingTopUp)return;
   const topUp=payload.ledger.find(row=>row.kind==='topup'&&Date.parse(row.created_at)>=since);
   if(topUp){setArrived(topUp);setWaiting(false);return;}
   if(++attempts<20)timer=setTimeout(()=>void load().catch(()=>{}),3000);else setWaiting(false);
  };
  void load().catch(()=>{if(active)setError('Usage credit is unavailable.');});
  return()=>{active=false;clearTimeout(timer);};
 },[awaitingTopUp]);
 async function topUp(amount:number){
  setBusy(amount);setError('');
  try{
   const response=await fetch('/api/credits/checkout',{method:'POST',headers:{'Content-Type':'application/json',...await authHeaders()},body:JSON.stringify({amount})});
   const payload=await response.json();
   if(!response.ok||!payload.url)throw new Error(payload.error??'Top-ups are unavailable right now.');
   window.location.assign(payload.url);
  }catch(cause){setError(cause instanceof Error?cause.message:'Top-ups are unavailable right now.');setBusy(null);}
 }
 return <div className="usage-credit">
  {arrived&&<p className="credit-confirmed" role="status"><strong>✓ {pounds(arrived.delta)} added to your credit.</strong> You paid £{((arrived.paid_pence??0)/100).toFixed(2)}; the card fee was £{((arrived.fee_pence??0)/100).toFixed(2)}. Thank you.</p>}
  {waiting&&<p className="credit-waiting" role="status">Payment received. Adding your credit… this usually takes a few seconds.</p>}
  {awaitingTopUp&&!waiting&&!arrived&&<p className="credit-waiting" role="status">Your payment went through, but the credit hasn&apos;t shown up yet. It will appear here shortly. If it hasn&apos;t within an hour, contact us and we&apos;ll sort it out.</p>}
  {credits&&<p className="credit-balance"><strong>{pounds(credits.balance)}</strong> usage credit</p>}
  <section aria-label="How usage credit works">
   <p><strong>Commutemap isn&apos;t run for profit.</strong> Google charges for every journey and place lookup. Everyone shares a free monthly allowance; when it runs out, you can keep going with your own usage credit.</p>
   <ul>
    <li>All of your money goes into your usage, charged at Google&apos;s own price{credits&&<> — {['routes','matrix','geocoding'].map((sku,i)=><span key={sku}>{i?', ':''}{pence(credits.prices[sku])} per {SKU_LABEL[sku]}</span>)}</>}.</li>
    <li>The only deduction is the card processor&apos;s fee (Stripe, about 1.5% + 20p), taken from your top-up. Commutemap keeps nothing.</li>
    <li>Credit is only used once the shared free allowance has run out, and it stays on your account until you use it.</li>
   </ul>
  </section>
  {credits&&!credits.enabled&&<p>Top-ups aren&apos;t switched on yet.</p>}
  {credits?.enabled&&<div className="credit-topups">{credits.topups.map(({amount,estimatedFee})=>
   <button key={amount} className="btn primary" disabled={busy!==null} onClick={()=>void topUp(amount)}>
    {busy===amount?'Opening checkout…':`Add £${(amount/100).toFixed(0)}`}<small>about £{((amount-estimatedFee)/100).toFixed(2)} of usage</small>
   </button>)}</div>}
  {credits&&credits.ledger.length>0&&<details><summary>Recent activity</summary><ul className="credit-ledger">{credits.ledger.map((row,i)=>
   <li key={i}>{new Date(row.created_at).toLocaleDateString('en-GB')}: {row.kind==='topup'?`Topped up £${((row.paid_pence??0)/100).toFixed(2)} (card fee £${((row.fee_pence??0)/100).toFixed(2)})`:row.kind==='refund'?'Refund':`${row.units} × ${SKU_LABEL[row.sku??'']??row.sku}`} <span>{row.delta>0?'+':'−'}{pounds(Math.abs(row.delta))}</span></li>)}</ul></details>}
  {!credits&&!error&&<p>Loading…</p>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
