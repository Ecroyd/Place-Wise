// Anonymous, cookie-free usage events (see src/lib/server/analytics.ts). Respects Do Not Track.
type Event={kind:'visit';path:string}|{kind:'search';detail:string}|{kind:'signup'};
export function track(event:Event){
 try{
  if(typeof navigator==='undefined'||navigator.doNotTrack==='1')return;
  const body=JSON.stringify(event);
  if(navigator.sendBeacon&&navigator.sendBeacon('/api/track',new Blob([body],{type:'application/json'})))return;
  void fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
 }catch{/* never let analytics break the page */}
}
