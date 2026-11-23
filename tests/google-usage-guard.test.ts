import {afterEach, describe, expect, it, vi} from 'vitest';
import {consumeLocalBudget, googleMonthlyLimit, paidRequestBudget, RequestBudgetError} from '../src/lib/server/budget';
import {googleSku} from '../src/lib/routing/google';

afterEach(() => vi.unstubAllEnvs());

describe('Google free-tier usage guard', () => {
  it('defaults each SKU to 90% of its free monthly allowance', () => {
    expect(googleMonthlyLimit('geocoding', {})).toBe(9000);
    expect(googleMonthlyLimit('routes-pro', {})).toBe(4500);
    expect(googleMonthlyLimit('matrix', {GOOGLE_FREE_USAGE_SHARE: '0.5'})).toBe(5000);
    expect(googleMonthlyLimit('matrix-pro', {GOOGLE_MONTHLY_LIMIT_MATRIX_PRO: '123'})).toBe(123);
    expect(googleMonthlyLimit('routes', {GOOGLE_FREE_USAGE_SHARE: '7'})).toBe(9000);
  });

  it('classifies traffic-aware driving as Pro', () => {
    expect(googleSku('matrix', {routingPreference: 'TRAFFIC_UNAWARE'})).toBe('matrix');
    expect(googleSku('matrix', {routingPreference: 'TRAFFIC_AWARE'})).toBe('matrix-pro');
    expect(googleSku('routes', {travelMode: 'TRANSIT'})).toBe('routes');
    expect(googleSku('routes', {routingPreference: 'TRAFFIC_AWARE_OPTIMAL'})).toBe('routes-pro');
  });

  it('consumes batches all-or-nothing', () => {
    const key = 'units-test-' + Math.random();
    expect(consumeLocalBudget(key, 10, 60, Date.now(), 8)).toBe(true);
    expect(consumeLocalBudget(key, 10, 60, Date.now(), 3)).toBe(false);
    expect(consumeLocalBudget(key, 10, 60, Date.now(), 2)).toBe(true);
    expect(consumeLocalBudget(key, 10, 60, Date.now(), 1)).toBe(false);
  });

  it('stops paid calls once a SKU allowance is used, without touching other SKUs', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('GOOGLE_MONTHLY_LIMIT_MATRIX_PRO', '30');
    vi.stubEnv('GOOGLE_REQUESTS_PER_DAY', '100000');
    await paidRequestBudget('matrix-pro', 25);
    await expect(paidRequestBudget('matrix-pro', 25)).rejects.toBeInstanceOf(RequestBudgetError);
    await paidRequestBudget('matrix-pro', 5);
    await expect(paidRequestBudget('matrix-pro')).rejects.toThrow(/free monthly/);
    await expect(paidRequestBudget('geocoding')).resolves.toBeUndefined();
  });
});
