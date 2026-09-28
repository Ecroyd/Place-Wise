# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Map overlays

The map layer picker loads data around the visible map and labels source, date, coverage and unavailable providers. Changing travel mode refreshes both commute samples and the nearby-area comparisons.

- Schools: Ofsted state-funded school inspection snapshot, 31 August 2026; modern report-card fields and separately dated legacy judgments. Postcode-centre coordinates are approximate. 21,915 schools located; 42 records without resolvable postcodes are omitted. Independent schools and admissions/catchment boundaries are not included. Source: https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes (OGL).
- To regenerate the bundled school snapshot, run `node scripts/refresh-schools.mjs`. When upgrading to a newer publication, update the source CSV URL and `asOf` date in that script together. It uses public Postcodes.io bulk lookups and preserves missing-coordinate exclusions.
- Sold prices: HM Land Registry Price Paid linked data, up to 300 sales in the last two years across the nearest 100 postcodes within 1 km of map centre. Pins show sample means at postcode centres; these are historical sales, not valuations or available listings. Budget colours compare each sample mean with the selected budget.
- Crime: data.police.uk latest available month within 1 mile of map centre. Reports are grouped at anonymised coordinates; counts are not population-adjusted risk. Scottish coverage is limited.
- Parks, amenities and transport stops: OpenStreetMap via Overpass, at most 350 results per layer/view; completeness varies. Requests are queued to respect provider concurrency limits.
- Flooding: Environment Agency NaFRA2 river/sea and surface-water WMS layers, England only. Zoom 14 or closer is required for the service's scale threshold; colour legends and official property-risk guidance are linked in the layer controls.

External data requests have timeouts, bounded view sizes, retry controls and a bounded 15-minute server cache. Source outages are shown as errors, never as evidence of zero incidents or zero flood risk. OpenStreetMap attribution/ODbL and Environment Agency/HM Land Registry Crown copyright/OGL attribution are displayed in the app.

## Combined matching and multiple destinations

Add up to three destinations, each with its own mode and minimum/maximum journey time. The existing distance range and departure time are shared. The map defaults to an all-destination commute intersection; its colours represent the highest percentage of an individual time limit, not elapsed minutes. Switch to an individual destination to inspect its normal minute-based heatmap and edit only that destination's mode.

The sidebar checks named area centres against every destination. Find combined matches then searches up to four qualifying sampled areas, collects matching historical sales at nearby postcodes, and tests up to twelve postcode locations against every commute. If enabled, the school requirement uses the selected inspection grade and phase and verifies walking time to up to three nearest qualifying schools. Green check pins and result cards show verified sample matches. Postcode locations are approximate; this is not an exhaustive property search, a current availability feed, or an admissions eligibility check. Provider failures are counted and disclosed. Changing criteria clears outdated combined-match pins and aborts the active client request.

### Zoom-based commute detail

The heatmap starts with the regional grid, then checks finer H3 cells inside the visible viewport after a settled pan or zoom (500 ms debounce). Detail starts at zoom 12, progressing through resolutions 8–11 every two zoom levels. Wide views fall back to a coarser detail level to stay within 256 cells; detail never replaces a base cell with a coarser one. Each cell is routed independently in batches of 16. Detail masks the regional shading, including where finer routes are pending, unavailable or outside the selected limits, so a parent time is never presented as a child's result.

Moving away cancels pending detail requests. A bounded, per-search client cache reuses detail for five minutes, including multi-destination results; single-destination requests also use the server route cache. Criteria changes discard client detail. Zoom detail requires additional provider calls for uncached cells (potentially multiple calls per cell for multiple destinations or any-mode searches). The regional overview retains its existing sampling workload. Shading defaults to 28% and can be adjusted in the commute controls to keep streets readable. Samples are still estimates at cell centres, not exact road or property boundaries.

### School sectors and published catchment outlines

The school layer includes open independent schools from the DfE GIAS Establishment fields CSV dated 2026-09-28 (2,511 located records; 32 omitted without postcode coordinates). Select State & private, State-funded or Private / independent. Independent schools use an I pin, list their recorded inspectorate and link to their GIAS record. Inspection grades have not been imported for these schools; choosing an Ofsted grade excludes ungraded records. All-through schools match the relevant age phases. Refresh with `node scripts/refresh-independent-schools.mjs GIAS.csv YYYY-MM-DD` after downloading the public CSV from https://www.get-information-schools.service.gov.uk/Downloads.

Published school catchments is a separate outline layer. Initial coverage is Stockport only: 97 unsimplified council polygons from the public GeoServer feed used by https://www.stockport.gov.uk/find-your-catchment-area. Solid outlines are catchments; dashed outlines are Catholic associated areas. Click a school pin to automatically enable the catchment layer, isolate its published boundaries and frame them on the map. The layer panel has a Show all boundaries reset; there is no catchment dropdown. Selecting a school with no supplied boundary clears the previous selection. No boundary is inferred from distance, nearby schools or boroughs. Missing coverage is explicitly identified. The feed does not specify an admission year, and these boundaries do not establish admission eligibility; the council address checker and intake-year arrangements remain authoritative. Refresh with `node scripts/refresh-catchments.mjs`. Combined matches still checks school walking time, not catchment eligibility.

### Welsh and Scottish schools

The school layer and combined school matching include 1,440 maintained Welsh schools (Welsh Government map, updated 23 April 2026) and 2,403 publicly funded Scottish schools (register dated 31 July 2026). Private school coverage remains England only. Welsh pins use official school coordinates; Scottish pins are postcode centres. 23 Scottish records could not be geocoded and are omitted. Report links open the Estyn or Scottish inspectorate report finder; their grades are not imported or converted into Ofsted grades. The country selector resets the grade filter; Ofsted grade controls apply to England. This import does not add catchment polygons.

Sources (Open Government Licence): https://datamap.gov.wales/layers/geonode:maintained_schools_wg and https://www.gov.scot/publications/school-contact-details/ . Scottish postcode lookup: https://postcodes.io/ .

To refresh, download Welsh GeoJSON from `https://datamap.gov.wales/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:maintained_schools_wg&outputFormat=application/json&srsName=EPSG:4326&count=5000` and the latest Scottish contact XLSX. Extract with `python scripts/extract-scottish-schools.py source.xlsx scotland.json` (requires openpyxl), then run `node scripts/refresh-regional-schools.mjs wales.geojson scotland.json YYYY-MM-DD YYYY-MM-DD`, using the respective source dates. The importer checks phase mappings, counts, IDs and coordinates before replacing the snapshot.

### Supabase accounts and saved searches

The active map UI uses Supabase email/password authentication, email-confirmed signup, persisted sessions and sign-out. Save search stores all resolved destinations and their individual modes/limits, search mode and both budget bounds. Saved searches can be reopened or deleted. Map layer selections and school filters are not part of the saved snapshot. Expired departure times are cleared when reopening, so routes use current conditions.

Apply `supabase/migrations/202609280001_saved_search_access.sql` to an existing Placewise database. It grants authenticated users access to profiles and saved searches, restricted by explicit owner-only RLS policies. Anonymous users have no access. The browser uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the secret key and database URL remain server-side. In Supabase Auth configure the production Site URL and allow the local/production origins used by confirmation links. Email confirmation remains enabled; configure production SMTP and confirm delivery with a real mailbox before launch.

Run `node scripts/check-supabase-account.mjs` explicitly for the live integration smoke check. It uses the local environment, creates two disposable confirmed accounts without sending email, tests authentication/session refresh/search CRUD and cross-account/anonymous access denial, and removes its users and records in `finally`. It is intentionally separate from the unit test suite.

### Beta account and routing controls

Forgotten password and resend confirmation are available in the sign-in panel. Recovery links return to `/?account=recovery`; allow this URL on each intended origin in Supabase Auth. Expired/invalid links show a fresh-request form. Real inbox delivery remains a deployment check; automated recovery tests use admin-generated tokens without sending mail.

Saved searches also include enabled layers, school country/sector/phase/inspection filters, selected catchment, combined-school preferences, map centre/zoom, the selected area point, commute destination selection, visibility and opacity. Legacy saved searches still open with default map settings.

Apply `202609280002_routing_controls.sql` before deploying this build. Routes are cached for five minutes in a server-only Supabase table and reused across destinations and server instances. Concurrent identical lookups within a process share one request. Expired rows are cleaned during budget checks. Public endpoints have five-minute request limits; Vercel's trusted forwarded IP is hashed, and other hosts conservatively share one bucket. Configure trusted client identity before scaling on another host. Google route and geocoding calls also consume a shared daily request allowance (`GOOGLE_REQUESTS_PER_DAY`, default 10000). This caps requests, not a monetary amount. Budget checks fail closed if Supabase is unavailable; test/development environments without Supabase use an in-memory limiter. Multi-server cache misses may still race, but the global budget remains atomic.

### Low-usage heatmap

The overview routes at most 96 driving sample points. Multiple destinations and modes divide that sample budget: two driving destinations use at most 48 origins; any-mode comparisons use at most 19. Fine hexagons are retained, but only individually checked cells are shaded, so this is a sparse preview rather than continuous coverage. Zooming/panning does not automatically request more routes. The explicit detail button allows a further 48 route-call budget per view (fewer origins for extra destinations/modes), with cached results reused. Hiding the travel-time layer pauses overview work after the current batch, and showing it resumes the remaining samples. Nearby comparisons use nine geographical lookups and at most eight towns, bounded further for expensive mode combinations.

Default Google call allowances are now 500/day and 2,000/month, configurable with `GOOGLE_REQUESTS_PER_DAY` and `GOOGLE_REQUESTS_PER_MONTH`. The counter includes requests after its introduction, not earlier account-wide usage. These application limits do not change Google Cloud billing, restore exhausted trial credits, or replace Google-side quotas. Shared routing results retain their five-minute freshness window. No change to traffic-aware journey accuracy was made.
