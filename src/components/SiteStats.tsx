"use client";
import {useEffect,useState} from 'react';
import {authHeaders} from '@/src/lib/supabase/browser';

type Totals={visitors:number;visits:number;searches:number;signups:number;topups:number;topup_pence:number;mobile_visitors:number};
type Stats={totals:Partial<Record<'today'|'7d'|'30d',Totals>>|null;daily:{day:string;visitors:number;searches:number}[];places:{place:string;searches:number}[];pages:{path:string;visits:number}[];accounts:number;generatedAt:string};
const EMPTY:Totals={visitors:0,visits:0,searches:0,signups:0,topups:0,topup_pence:0,mobile_visitors:0};
const PERIODS=[['today','Today'],['7d','Last 7 days'],['30d','Last 30 days']] as const;

// Owner-only overview of anonymous site usage (cookie-free; see src/lib/server/analytics.ts).
export function SiteStats(){
 const [stats,setStats]=useState<Stats>();const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  void (async()=>{
   const response=await fetch('/api/admin/stats',{headers:await authHeaders(),cache:'no-store'});
   const payload=await response.json();
   if(!active)return;
   if(!response.ok)setError(payload.error??'Site stats are unavailable.');else setStats(payload);
  })().catch(()=>{if(active)setError('Site stats are unavailable.');});
  return()=>{active=false;};
 },[]);
 if(error)return <p role="alert">{error}</p>;
 if(!stats)return <p>Loading site stats…</p>;
 const t=(k:'today'|'7d'|'30d')=>stats.totals?.[k]??EMPTY;
 const peak=Math.max(1,...stats.daily.map(d=>Math.max(d.visitors,d.searches)));
 return <div className="site-stats">
  <div className="stats-grid" role="table" aria-label="Visitors and activity">
   <div role="row" className="stats-row stats-head"><span role="columnheader"/>{PERIODS.map(([,label])=><span role="columnheader" key={label}>{label}</span>)}</div>
   {([['Visitors','visitors'],['Page views','visits'],['Searches','searches'],['Sign-ups','signups'],['Top-ups','topups']] as const).map(([label,key])=>
    <div role="row" className="stats-row" key={key}><span role="rowheader">{label}</span>{PERIODS.map(([p])=><b role="cell" key={p}>{t(p)[key].toLocaleString('en-GB')}</b>)}</div>)}
   <div role="row" className="stats-row"><span role="rowheader">Top-up income</span>{PERIODS.map(([p])=><b role="cell" key={p}>£{(t(p).topup_pence/100).toFixed(2)}</b>)}</div>
  </div>
  <p className="stats-note">{t('30d').visitors?`${Math.round(t('30d').mobile_visitors/t('30d').visitors*100)}% of visitors in the last 30 days were on a phone. `:''}{stats.accounts.toLocaleString('en-GB')} accounts in total.</p>
  <h3>Daily visitors and searches (30 days)</h3>
  <div className="stats-chart" role="img" aria-label="Daily visitors and searches over the last 30 days">
   {stats.daily.map(d=><div key={d.day} className="stats-day" title={`${new Date(d.day).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}: ${d.visitors} visitors, ${d.searches} searches`}>
    <i className="bar-visitors" style={{height:`${d.visitors/peak*100}%`}}/><i className="bar-searches" style={{height:`${d.searches/peak*100}%`}}/>
   </div>)}
  </div>
  <p className="stats-legend"><span className="key-visitors"/>Visitors <span className="key-searches"/>Searches</p>
  {stats.places.length>0&&<><h3>Most searched places (30 days)</h3><ol className="stats-list">{stats.places.map(p=><li key={p.place}><span>{p.place}</span><b>{p.searches}</b></li>)}</ol></>}
  {stats.pages.length>0&&<><h3>Pages visited (30 days)</h3><ol className="stats-list">{stats.pages.map(p=><li key={p.path}><span>{p.path}</span><b>{p.visits}</b></li>)}</ol></>}
  <p className="stats-note">Anonymous and cookie-free: a visitor is counted once per day from a one-way hash; no IP addresses or personal details are stored. Visitors with Do Not Track switched on aren&apos;t counted.</p>
 </div>;
}
