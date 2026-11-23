import {afterEach, describe, expect, it, vi} from 'vitest';
import {bestPlace, forwardGeocode} from '../src/lib/server/geocoding';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const place = (local_type: string, district: string | null, county: string | null = null) => ({name_1: 'Middleton', local_type, latitude: 1, longitude: 2, district_borough: district, county_unitary: county, region: 'North West'});

describe('place ranking', () => {
  it('prefers bigger settlements and honours a qualifier after a comma', () => {
    const places = [place('Village', 'Derbyshire Dales', 'Derbyshire'), place('Hamlet', null, 'Northumberland'), place('Town', 'Rochdale'), place('Suburban Area', 'Leeds')];
    expect(bestPlace(places, 'Middleton')?.district_borough).toBe('Rochdale');
    expect(bestPlace(places, 'middleton', 'Leeds')?.district_borough).toBe('Leeds');
    expect(bestPlace(places, 'Middleton', 'Cornwall')).toBeUndefined();
  });
});

describe('forward geocoding', () => {
  it('resolves postcodes through postcodes.io without touching Google', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'AIza-test');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.postcodes.io/postcodes/M244EL')) return Response.json({result: {postcode: 'M24 4EL', admin_ward: 'South Middleton', admin_district: 'Rochdale', latitude: 53.548, longitude: -2.201}});
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await forwardGeocode('m24 4el')).toEqual({label: 'M24 4EL, South Middleton, Rochdale', latitude: 53.548, longitude: -2.201, source: 'postcodes.io'});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('falls back to OpenRouteService for full addresses', async () => {
    vi.stubEnv('ORS_API_KEY', 'ors');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('https://api.postcodes.io/places')) return Response.json({result: null});
      if (url.includes('/geocode/search')) return Response.json({features: [{properties: {label: '10 Downing Street, London, United Kingdom', confidence: 1}, geometry: {coordinates: [-0.1276, 51.5034]}}]});
      throw new Error('unexpected ' + url);
    }));
    expect(await forwardGeocode('10 Downing Street, London')).toMatchObject({label: '10 Downing Street, London', source: 'openrouteservice'});
  });
});
