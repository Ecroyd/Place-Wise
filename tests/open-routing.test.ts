import {afterEach, describe, expect, it, vi} from 'vitest';
import {HybridRoutingProvider, OpenRouteServiceProvider, usesOpenRouting} from '../src/lib/routing/open';
import {snapDestination, routeCacheKey} from '../src/lib/routing/shared';
import {NoRouteError, RoutingUnavailableError} from '../src/lib/routing/google';
import type {RoutingOptions, RoutingProvider, TravelTimeResult} from '../src/lib/routing/provider';
import type {Coordinates} from '../src/types/domain';

afterEach(() => vi.unstubAllGlobals());
const middleton = {latitude: 53.5508938, longitude: -2.1971245};
const near = {latitude: 53.5513, longitude: -2.1965}; // ~60 m away
const origins = Array.from({length: 4}, (_, i) => ({latitude: 53.4 + i * 0.05, longitude: -2.3}));

describe('destination snapping', () => {
  it('gives nearby destinations the same cache key', () => {
    const options: RoutingOptions = {transportMode: 'drive'};
    expect(routeCacheKey('p', origins[0], snapDestination(middleton), options)).toBe(routeCacheKey('p', origins[0], snapDestination(near), options));
    const moved = snapDestination(middleton);
    expect(Math.abs(moved.latitude - middleton.latitude) * 111000).toBeLessThan(250);
  });
});

describe('which journeys use open routing', () => {
  it('uses open routing unless a departure time was chosen', () => {
    expect(usesOpenRouting({transportMode: 'walk'})).toBe(true);
    expect(usesOpenRouting({transportMode: 'cycle', departureTime: '2026-11-24T08:00:00Z'})).toBe(true);
    expect(usesOpenRouting({transportMode: 'drive'})).toBe(true);
    expect(usesOpenRouting({transportMode: 'drive', departureTime: '2026-11-24T08:00:00Z'})).toBe(false);
    expect(usesOpenRouting({transportMode: 'transit', departureTime: '2026-11-24T08:00:00Z'})).toBe(false);
  });
});

describe('OpenRouteService matrix', () => {
  it('returns minutes per origin and isolates an unroutable point by splitting the batch', async () => {
    const bad = origins[2];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {locations: number[][]; sources: number[]};
      if (body.sources.some(i => body.locations[i][1] === bad.latitude)) return new Response('{"error":{"code":2010}}', {status: 404});
      return Response.json({durations: body.sources.map(i => [600 + i * 60]), distances: body.sources.map(() => [12.34])});
    });
    vi.stubGlobal('fetch', fetchMock);
    const results = await new OpenRouteServiceProvider('key', 'https://ors.test').getTravelTimes(origins, middleton, {transportMode: 'cycle'});
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    expect((results[0] as PromiseFulfilledResult<TravelTimeResult>).value).toMatchObject({minutes: 10, distanceKm: 12.3, selectedMode: 'cycle', source: 'openrouteservice'});
    expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(NoRouteError);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://ors.test/v2/matrix/cycling-regular');
  });
});

function fake(handler: (origin: Coordinates, options: RoutingOptions) => TravelTimeResult | Error): RoutingProvider & {calls: number} {
  const provider = {calls: 0,
    async getTravelTimes(list: Coordinates[], _d: Coordinates, options: RoutingOptions) {
      provider.calls += list.length;
      return list.map(origin => { const r = handler(origin, options); return r instanceof Error ? {status: 'rejected', reason: r} as const : {status: 'fulfilled', value: r} as const; });
    },
    async getTravelTime() { throw new Error('unused'); }, async getTravelTimeMatrix() { return []; }, async getIsochrone() { return []; }};
  return provider;
}

describe('hybrid routing', () => {
  it('falls back to Google only when the open router is unavailable, not when there is no route', async () => {
    const open = fake(origin => origin === origins[0] ? new RoutingUnavailableError('down') : origin === origins[1] ? new NoRouteError() : {minutes: 20, source: 'ors'});
    const google = fake(() => ({minutes: 25, source: 'google'}));
    const results = await new HybridRoutingProvider(open, google).getTravelTimes(origins.slice(0, 3), middleton, {transportMode: 'drive'});
    expect(google.calls).toBe(1);
    expect(results.map(r => r.status === 'fulfilled' ? r.value.source : 'none')).toEqual(['google', 'none', 'ors']);
  });
  it('uses Google for public transport and picks the fastest mode for "any"', async () => {
    const open = fake((_o, options) => ({minutes: options.transportMode === 'cycle' ? 15 : options.transportMode === 'walk' ? 50 : 18, source: 'ors', selectedMode: options.transportMode}));
    const google = fake((_o, options) => ({minutes: options.transportMode === 'transit' ? 30 : 99, source: 'google', selectedMode: options.transportMode}));
    const hybrid = new HybridRoutingProvider(open, google);
    const when = '2026-11-24T08:00:00Z';
    const [transit] = await hybrid.getTravelTimes([origins[0]], middleton, {transportMode: 'transit', departureTime: when});
    expect(transit.status === 'fulfilled' && transit.value.source).toBe('google');
    const [best] = await hybrid.getTravelTimes([origins[0]], middleton, {transportMode: 'any', departureTime: when});
    expect(best.status === 'fulfilled' && best.value.selectedMode).toBe('cycle');
  });
  it('never calls Google without a chosen departure time', async () => {
    const open = fake((_o, options) => ({minutes: options.transportMode === 'drive' ? 18 : 40, source: 'ors', selectedMode: options.transportMode}));
    const google = fake(() => ({minutes: 5, source: 'google', selectedMode: 'transit'}));
    const hybrid = new HybridRoutingProvider(open, google);
    const [transit] = await hybrid.getTravelTimes([origins[0]], middleton, {transportMode: 'transit'});
    expect(transit.status === 'rejected' && String(transit.reason.message)).toMatch(/departure time/);
    const [best] = await hybrid.getTravelTimes([origins[0]], middleton, {transportMode: 'any'});
    expect(best.status === 'fulfilled' && best.value.selectedMode).toBe('drive');
    expect(google.calls).toBe(0);
  });
});
