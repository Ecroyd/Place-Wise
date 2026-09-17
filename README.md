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
