import {createHmac} from 'node:crypto';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// In-memory stand-ins for the Supabase RPCs and the signed-in user.
const state = vi.hoisted(() => ({buckets: new Map<string, number>(), balances: new Map<string, number>(), payer: null as null | {userId: string}, refunds: 0}));
vi.mock('@/src/lib/supabase/server', () => ({getPlacewiseClient: () => ({rpc: async (name: string, args: Record<string, never>) => {
  if (name === 'consume_request_units') {
    const {bucket, maximum, amount} = args as unknown as {bucket: string; maximum: number; amount: number};
    const used = state.buckets.get(bucket) ?? 0;
    if (used + amount > maximum) return {data: false, error: null};
    state.buckets.set(bucket, used + amount); return {data: true, error: null};
  }
  const {p_user, p_amount} = args as unknown as {p_user: string; p_amount: number};
  const balance = state.balances.get(p_user) ?? 0;
  if (name === 'spend_credit') { if (balance < p_amount) return {data: false, error: null}; state.balances.set(p_user, balance - p_amount); return {data: true, error: null}; }
  if (name === 'refund_credit') { state.refunds++; state.balances.set(p_user, balance + p_amount); return {data: null, error: null}; }
  throw new Error('unexpected rpc ' + name);
}})}));
vi.mock('@/src/lib/server/payer', () => ({currentPayer: () => state.payer}));

import {creditPerUnit, paidRequestBudget, RequestBudgetError} from '../src/lib/server/budget';
import {estimatedFeePence, isTopupAmount, verifyWebhook} from '../src/lib/server/stripe';

beforeEach(() => {
  state.buckets.clear(); state.balances.clear(); state.payer = null; state.refunds = 0;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test');
  vi.stubEnv('GOOGLE_MONTHLY_LIMIT_ROUTES', '2');
  vi.stubEnv('GOOGLE_REQUESTS_PER_DAY', '1000');
});
afterEach(() => vi.unstubAllEnvs());

describe('at-cost pricing', () => {
  it('charges Google list price in hundredths of a penny', () => {
    expect(creditPerUnit('routes', {})).toBe(40);       // $5/1000 at 0.80 = 0.4p
    expect(creditPerUnit('matrix-pro', {})).toBe(80);   // $10/1000 = 0.8p
    expect(creditPerUnit('geocoding', {GOOGLE_USD_TO_GBP: '0.75'})).toBe(38);
  });
  it('offers only £3, £5 and £10 and estimates the Stripe fee', () => {
    expect([300, 500, 1000].every(isTopupAmount)).toBe(true);
    expect(isTopupAmount(700)).toBe(false);
    expect(estimatedFeePence(500)).toBe(28);
  });
});

describe('paid usage', () => {
  it('uses the free allowance first, then the payer credit', async () => {
    state.payer = {userId: 'u1'}; state.balances.set('u1', 100);
    await paidRequestBudget('routes'); await paidRequestBudget('routes');
    expect(state.balances.get('u1')).toBe(100);
    await paidRequestBudget('routes');
    expect(state.balances.get('u1')).toBe(60);
  });
  it('asks signed-out people to sign in and top up', async () => {
    await paidRequestBudget('routes'); await paidRequestBudget('routes');
    await expect(paidRequestBudget('routes')).rejects.toThrow(/Sign in and add usage credit/);
  });
  it('refuses when credit is too low without touching the paid ceiling', async () => {
    state.payer = {userId: 'u1'}; state.balances.set('u1', 30);
    vi.stubEnv('GOOGLE_MONTHLY_LIMIT_ROUTES', '1');
    await paidRequestBudget('routes');
    await expect(paidRequestBudget('routes')).rejects.toBeInstanceOf(RequestBudgetError);
    expect([...state.buckets.keys()].some(key => key.startsWith('google-paid:'))).toBe(false);
    expect(state.balances.get('u1')).toBe(30);
  });
  it('refunds credit when the monthly paid ceiling is reached', async () => {
    state.payer = {userId: 'u1'}; state.balances.set('u1', 10000);
    vi.stubEnv('GOOGLE_MONTHLY_LIMIT_ROUTES', '1');
    vi.stubEnv('GOOGLE_PAID_MONTHLY_CEILING_PENCE', '1'); // 100 hundredths = two 0.4p calls
    await paidRequestBudget('routes');
    await paidRequestBudget('routes'); await paidRequestBudget('routes');
    await expect(paidRequestBudget('routes')).rejects.toThrow(/safety ceiling/);
    expect(state.refunds).toBe(1);
    expect(state.balances.get('u1')).toBe(10000 - 80);
  });
});

describe('Stripe webhook signature', () => {
  const secret = 'whsec_test'; const body = '{"id":"evt_1"}'; const now = 1_800_000_000_000;
  const sign = (t: number, payload = body) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
  it('accepts a valid signature and rejects tampering or stale events', () => {
    expect(verifyWebhook(body, sign(now / 1000), secret, now)).toBe(true);
    expect(verifyWebhook(body + ' ', sign(now / 1000), secret, now)).toBe(false);
    expect(verifyWebhook(body, sign(now / 1000 - 3600), secret, now)).toBe(false);
    expect(verifyWebhook(body, null, secret, now)).toBe(false);
  });
});
