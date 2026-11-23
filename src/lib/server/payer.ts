import {AsyncLocalStorage} from 'node:async_hooks';
import {getPlacewiseClient} from '@/src/lib/supabase/server';

export type Payer={userId:string;email?:string};
const store=new AsyncLocalStorage<Payer|null>();

// The signed-in user behind a request, from the Supabase access token the browser sends.
export async function userFromRequest(request:Request):Promise<Payer|null>{
 const token=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)return null;
 const {data,error}=await getPlacewiseClient().auth.getUser(token);
 if(error||!data.user)return null;
 return {userId:data.user.id,email:data.user.email??undefined};
}

// Runs a route handler with its payer available to every Google call it makes,
// without threading the user through the routing code.
export async function withPayer<T>(request:Request,handler:()=>Promise<T>):Promise<T>{
 const payer=await userFromRequest(request).catch(()=>null);
 return store.run(payer,handler);
}
export function currentPayer(){return store.getStore()??null;}
