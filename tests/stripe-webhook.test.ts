import {createHmac} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';

const rpc = vi.hoisted(() => vi.fn(async () => ({data: true, error: null})));
vi.mock('@/src/lib/supabase/server', () => ({getPlacewiseClient: () => ({rpc})}));
vi.mock('@/src/lib/server/stripe', async original => ({...await original<typeof import('../src/lib/server/stripe')>(), feeForSession: async () => 25}));
import {POST} from '../app/api/credits/webhook/route';

const secret = 'whsec_test';
function signed(object: Record<string, unknown>) {
  const body = JSON.stringify({type: 'checkout.session.completed', data: {object}});
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return new Request('https://commutemap.co.uk/api/credits/webhook', {method: 'POST', body, headers: {'stripe-signature': `t=${t},v1=${v1}`}});
}
afterEach(() => { vi.unstubAllEnvs(); rpc.mockClear(); });

describe('credit webhook', () => {
  it('ignores checkouts from other sites on the same Stripe account', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    const response = await POST(signed({id: 'cs_other', payment_status: 'paid', currency: 'gbp', amount_total: 500, client_reference_id: 'someone', metadata: {}}));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ignored: true});
    expect(rpc).not.toHaveBeenCalled();
  });
  it('credits a Commutemap top-up minus the Stripe fee', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    const response = await POST(signed({id: 'cs_1', payment_status: 'paid', currency: 'gbp', amount_total: 300, payment_intent: 'pi_1', metadata: {app: 'commutemap', user_id: 'u1'}}));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('credit_topup', {p_user: 'u1', p_credit: (300 - 25) * 100, p_paid_pence: 300, p_fee_pence: 25, p_session: 'cs_1'});
  });
});
