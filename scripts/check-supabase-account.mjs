// Explicit live integration check: creates two temporary users, deletes them in finally.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';
for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const options={db:{schema:'placewise'},auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,process.env.SUPABASE_SECRET_KEY,options);const created=[];
const check=(result)=>{if(result.error)throw Error(result.error.message);return result.data;};
try{
 const clients=[];
 for(let i=0;i<2;i++){
  const email='placewise-smoke-'+randomUUID()+'@example.com',password=randomUUID()+'aA1!';
  const user=check(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;created.push(user.id);
  const client=createClient(url,key,options);const login=check(await client.auth.signInWithPassword({email,password}));assert.equal(login.user.id,user.id);
  check(await client.from('profiles').upsert({id:user.id},{onConflict:'id',ignoreDuplicates:true}));
  clients.push({client,user,refresh:login.session.refresh_token});
 }
 const [a,b]=clients;
 const criteria={version:1,mode:'live',destinations:[{id:'test-cardiff',label:'Cardiff',purpose:'Work',latitude:51.4816,longitude:-3.1791,transportMode:'drive',journeysPerWeek:5,minimumMinutes:10,maximumMinutes:60,maximumDistanceKm:40,weight:100,hardMaximum:true},{id:'test-swansea',label:'Swansea',purpose:'Work',latitude:51.6214,longitude:-3.9436,transportMode:'drive',journeysPerWeek:5,minimumMinutes:0,maximumMinutes:45,maximumDistanceKm:40,weight:100,hardMaximum:true}],minimumBudget:200000,budget:500000};
 const saved=check(await a.client.from('saved_searches').insert({user_id:a.user.id,name:'Temporary integration check',mode:'live',criteria}).select().single());
 assert.deepEqual(saved.criteria,criteria);
 assert.equal(check(await a.client.from('saved_searches').select('id').eq('id',saved.id)).length,1);
 assert.equal(check(await b.client.from('saved_searches').select('id').eq('id',saved.id)).length,0);
 assert.equal(check(await b.client.from('saved_searches').update({name:'forbidden'}).eq('id',saved.id).select()).length,0);
 assert.equal(check(await b.client.from('saved_searches').delete().eq('id',saved.id).select()).length,0);
 assert.ok((await b.client.from('saved_searches').insert({user_id:a.user.id,name:'forbidden',mode:'live',criteria})).error);
 const anon=createClient(url,key,options);assert.ok((await anon.from('saved_searches').select('id')).error);
 const fresh=createClient(url,key,options);check(await fresh.auth.refreshSession({refresh_token:a.refresh}));
 assert.deepEqual(check(await fresh.from('saved_searches').select('criteria').eq('id',saved.id).single()).criteria,criteria);
 assert.equal(check(await fresh.from('saved_searches').delete().eq('id',saved.id).select()).length,1);
 check(await fresh.auth.signOut());assert.equal((await fresh.auth.getSession()).data.session,null);
 console.log('PASS: sign-in, profile creation, save/read, session refresh, reopen data, delete, sign-out, anonymous denial, cross-account read/update/delete/insert denial.');
}finally{
 for(const id of created){const result=await admin.auth.admin.deleteUser(id);if(result.error){console.error('Temporary test-account cleanup failed: '+result.error.message);process.exitCode=1;}}
 if(!process.exitCode)console.log('Temporary test accounts removed; their profiles/searches cascade deleted.');
}
