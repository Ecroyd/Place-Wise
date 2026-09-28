import {createClient} from '@supabase/supabase-js';
function createBrowserClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('Sign-in is not configured for this site.');
 return createClient(url,key,{db:{schema:'placewise'},auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}
let client:ReturnType<typeof createBrowserClient>|undefined;
export function getBrowserClient(){return client??=createBrowserClient();}
