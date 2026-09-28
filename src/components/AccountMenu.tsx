"use client";
import {useEffect,useRef,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {getBrowserClient} from '@/src/lib/supabase/browser';
import {restoreCriteria,savedCriteriaSchema,type SavedCriteria,type SavedSearch} from '@/src/lib/account/searches';

export function AccountMenu({criteria,onLoad}:{criteria?:SavedCriteria;onLoad:(criteria:SavedCriteria)=>void}){
 const [session,setSession]=useState<Session|null>(null);
 const [ready,setReady]=useState(false);
 const [panel,setPanel]=useState<'signin'|'signup'|'saved'|'save'|'forgot'|'resend'|'reset'|null>(null);
 const [confirmation,setConfirmation]=useState('');
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [name,setName]=useState('');const [searches,setSearches]=useState<SavedSearch[]>([]);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 const generation=useRef(0);
 useEffect(()=>{
  let active=true;let unsubscribe:()=>void=()=>{};
  void Promise.resolve().then(async()=>{
   if(!active)return;
   const client=getBrowserClient();
   const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{if(active){generation.current++;setSession(next);setReady(true);if(_event==='PASSWORD_RECOVERY'){setPassword('');setConfirmation('');setPanel('reset');}if(!next)setSearches([]);if(!next)setPanel(p=>p==='save'||p==='saved'?'signin':p);}});
   unsubscribe=()=>subscription.unsubscribe();
   const {data,error}=await client.auth.getSession();
   if(active){setSession(data.session);setReady(true);if(error)setError(error.message);
    if(new URLSearchParams(window.location.search).get('account')==='recovery'){setPanel(data.session?'reset':'forgot');if(!data.session)setError('This recovery link has expired or is invalid. Request a new one below.');}
    const authError=new URLSearchParams(window.location.hash.slice(1)).get('error_description');if(authError){setError(authError);setPanel('forgot');}
   }
  }).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:'Sign-in unavailable');setReady(true);}});
  return()=>{active=false;unsubscribe();};
 },[]);
 useEffect(()=>{if(panel&&!dialog.current?.open)dialog.current?.showModal();else if(!panel&&dialog.current?.open)dialog.current?.close();},[panel]);
 async function loadSearches(){
  const current=generation.current;
  const {data,error}=await getBrowserClient().from('saved_searches').select('id,name,criteria,created_at').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  if(current===generation.current)setSearches((data??[]) as SavedSearch[]);
 }
 async function perform(task:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await task();}catch(cause){setError(cause instanceof Error?cause.message:(cause as {message?:string})?.message??'Something went wrong. Please try again.');}finally{setBusy(false);}}
 function open(next:'signin'|'saved'|'save'){
  setError('');setMessage('');setPassword('');setPanel(session?next:'signin');
  if(next==='save')setName(criteria?.destinations.map(d=>d.label).join(' + ').slice(0,120)??'My search');
  if(session&&next==='saved')void perform(loadSearches);
 }
 async function authenticate(){
  const client=getBrowserClient();
  if(panel==='signup'){
   const {data,error}=await client.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin+'/'}});if(error)throw error;
   setPassword('');if(data.session){setSession(data.session);setPanel('saved');await loadSearches();}else setMessage('Check your email to confirm your account, then sign in here.');
  }else{
   const {data,error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;
   setSession(data.session);setPassword('');setPanel('saved');await loadSearches();
  }
 }
 async function accountEmail(){
  const client=getBrowserClient();const address=email.trim();
  const result=panel==='forgot'?await client.auth.resetPasswordForEmail(address,{redirectTo:window.location.origin+'/?account=recovery'}):await client.auth.resend({type:'signup',email:address,options:{emailRedirectTo:window.location.origin+'/'}});
  if(result.error)throw result.error;
  setMessage(panel==='forgot'?'If this email has an account, a password reset link has been sent. Check your inbox and spam folder.':'If confirmation is needed for this email, a new link has been sent. Check your inbox and spam folder.');
 }
 async function resetPassword(){
  if(password.length<8)throw new Error('Use at least 8 characters.');
  if(password!==confirmation)throw new Error('The passwords do not match.');
  const client=getBrowserClient();const {error}=await client.auth.updateUser({password});if(error)throw error;
  setPassword('');setConfirmation('');
  const signedOut=await client.auth.signOut();if(signedOut.error)throw signedOut.error;
  window.history.replaceState({},'',window.location.pathname);setPanel('signin');setMessage('Password updated. Sign in with your new password.');
 }
 async function save(){
  if(!session||!criteria)throw new Error('Sign in and run a search first.');
  const value=savedCriteriaSchema.parse(criteria);const clean=name.trim();if(!clean)throw new Error('Give this search a name.');
  const client=getBrowserClient();
  const profile=await client.from('profiles').upsert({id:session.user.id},{onConflict:'id',ignoreDuplicates:true});if(profile.error)throw profile.error;
  const result=await client.from('saved_searches').insert({user_id:session.user.id,name:clean,mode:value.mode,criteria:value});if(result.error)throw result.error;
  setPanel('saved');await loadSearches();setMessage('Search saved to your account.');
 }
 return <><div className="account-actions">
  {criteria&&<button className="btn light" disabled={!ready} onClick={()=>open('save')}>Save search</button>}
  {session?<><button className="btn light" onClick={()=>open('saved')}>Saved searches</button><button className="btn" disabled={busy} onClick={()=>void perform(async()=>{const {error}=await getBrowserClient().auth.signOut();if(error)throw error;setSession(null);setSearches([]);setPanel(null);})}>Sign out</button></>:<button className="btn primary" disabled={!ready} onClick={()=>open('signin')}>{ready?'Sign in':'Loading account…'}</button>}
 </div><dialog ref={dialog} className="account-dialog" onCancel={()=>setPanel(null)} onClose={()=>{setPanel(null);setPassword('');}}>
  <div className="account-heading"><h2>{panel==='forgot'?'Reset your password':panel==='resend'?'Resend confirmation':panel==='reset'?'Choose a new password':panel==='save'?'Save this search':panel==='saved'?'Your saved searches':panel==='signup'?'Create an account':'Sign in'}</h2><button type="button" className="btn" aria-label="Close account panel" onClick={()=>setPanel(null)}>Close</button></div>
  {(panel==='signin'||panel==='signup')&&<form onSubmit={event=>{event.preventDefault();void perform(authenticate);}}>
   <p>Save your destinations, travel limits and house-price range, and open them on another device.</p>
   <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<input type="password" autoComplete={panel==='signup'?'new-password':'current-password'} minLength={panel==='signup'?8:undefined} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button className="btn primary" disabled={busy}>{busy?'Please wait…':panel==='signup'?'Create account':'Sign in'}</button>
   <button type="button" className="btn" disabled={busy} onClick={()=>{setPanel(panel==='signup'?'signin':'signup');setError('');setMessage('');setPassword('');}}>{panel==='signup'?'Already have an account? Sign in':'Create an account'}</button>
   <button type="button" className="btn" disabled={busy} onClick={()=>{setPanel('forgot');setError('');setMessage('');setPassword('');}}>Forgotten password?</button>
   <button type="button" className="btn" disabled={busy} onClick={()=>{setPanel('resend');setError('');setMessage('');}}>Resend confirmation email</button>
  </form>}
  {(panel==='forgot'||panel==='resend')&&<form onSubmit={event=>{event.preventDefault();void perform(accountEmail);}}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><button className="btn primary" disabled={busy}>{busy?'Sending…':panel==='forgot'?'Send reset link':'Resend confirmation email'}</button><button type="button" className="btn" onClick={()=>{setPanel('signin');setError('');setMessage('');}}>Back to sign in</button></form>}
  {panel==='reset'&&<form onSubmit={event=>{event.preventDefault();void perform(resetPassword);}}><label>New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><button className="btn primary" disabled={busy}>{busy?'Updating…':'Update password'}</button></form>}
  {panel==='save'&&<form onSubmit={event=>{event.preventDefault();void perform(save);}}><label>Search name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><p>Includes all destinations, journey modes and limits, and your house-price range. Also saves map position, visible layers, school filters and combined-match preferences.</p><button className="btn primary" disabled={busy}>{busy?'Saving…':'Save search'}</button></form>}
  {panel==='saved'&&<><p>{session?.user.email}</p>{busy&&<p>Loading…</p>}{!busy&&!searches.length&&<p>No saved searches yet. Run a search and choose Save search.</p>}{searches.map(search=><article className="saved-search" key={search.id}><strong>{search.name}</strong><small>Saved {new Date(search.created_at).toLocaleDateString('en-GB')}</small><div><button className="btn primary" disabled={busy} onClick={()=>{try{onLoad(restoreCriteria(search.criteria));setPanel(null);}catch{setError('This saved search has an unsupported format. Please create a new search.');}}}>Open search</button><button className="btn" disabled={busy} onClick={()=>void perform(async()=>{const result=await getBrowserClient().from('saved_searches').delete().eq('id',search.id);if(result.error)throw result.error;await loadSearches();})}>Delete</button></div></article>)}</>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </dialog></>;
}
