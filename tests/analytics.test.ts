import {describe,expect,it,vi} from 'vitest';
import {visitorHash,isBot} from '../src/lib/server/analytics';
import {POST as track} from '../app/api/track/route';
import {GET as stats} from '../app/api/admin/stats/route';

const req=(headers:Record<string,string>)=>new Request('http://localhost/api/track',{method:'POST',headers});
describe('cookie-free analytics',()=>{
  it('counts the same browser once a day without storing who it is',()=>{
    const a=req({'x-forwarded-for':'81.2.69.160','user-agent':'Mozilla/5.0 (iPhone)'});
    const h=visitorHash(a,'2026-11-27');
    expect(h).toMatch(/^[0-9a-f]{20}$/);expect(h).not.toContain('81.2.69.160');
    expect(visitorHash(a,'2026-11-27')).toBe(h);
    expect(visitorHash(a,'2026-11-28')).not.toBe(h);
    expect(visitorHash(req({'x-forwarded-for':'81.2.69.161','user-agent':'Mozilla/5.0 (iPhone)'}),'2026-11-27')).not.toBe(h);
  });
  it('ignores crawlers and rejects unknown event types',async()=>{
    expect(isBot(req({'user-agent':'Googlebot/2.1'}))).toBe(true);
    expect(isBot(req({'user-agent':'Mozilla/5.0 (Macintosh)'}))).toBe(false);
    const bad=new Request('http://localhost/api/track',{method:'POST',body:JSON.stringify({kind:'topup',detail:'999999'})});
    expect((await track(bad)).status).toBe(400);
    const ok=new Request('http://localhost/api/track',{method:'POST',body:JSON.stringify({kind:'visit',path:'/'})});
    expect((await track(ok)).status).toBe(204);
  });
  it('only shows site stats to a signed-in owner',async()=>{
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');
    expect((await stats(new Request('http://localhost/api/admin/stats'))).status).toBe(401);
    vi.unstubAllEnvs();
  });
});
