import {userFromRequest} from '@/src/lib/server/payer';
import {isSiteAdmin} from '@/src/lib/server/analytics';
import {getPlacewiseClient} from '@/src/lib/supabase/server';

// Site stats for owners listed in placewise.site_admins. ?check=1 only answers whether the
// signed-in person is an owner, so the account menu knows whether to offer "Site stats".
export async function GET(request:Request){
 const user=await userFromRequest(request).catch(()=>null);
 if(!user)return Response.json({error:'Sign in to see site stats.'},{status:401});
 if(!await isSiteAdmin(user.userId))return Response.json({admin:false},{status:403});
 if(new URL(request.url).searchParams.has('check'))return Response.json({admin:true});
 const {data,error}=await getPlacewiseClient().rpc('site_stats',{p_days:30});
 if(error)return Response.json({error:'Site stats are unavailable. Has the analytics SQL been run?'},{status:503});
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
}
