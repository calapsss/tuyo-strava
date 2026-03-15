# Development Guide

## Requirements

- Node.js 20+
- npm 10+

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Available Scripts

- `npm run dev`: start local dev server
- `npm run build`: create production build
- `npm run start`: run production server
- `npm run lint`: run ESLint

## Key Development Conventions

- Keep main orchestration in [`src/app/page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx).
- Keep map UI interaction behavior in [`src/components/MapContainer.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/components/MapContainer.tsx).
- Keep route/telemetry logic in `src/lib/*` as pure utilities where possible.
- Invalidate preview whenever any input affecting output changes.
- Ensure download only uses fresh preview data.

## Runtime Dependencies And External APIs

- OpenStreetMap tiles for map rendering.
- OSRM providers for snapping (`routing.openstreetmap.de`, `router.project-osrm.org`).
- Elevation providers (`open-meteo`, `opentopodata`).
- Strava API for OAuth + upload when configured.

When developing features that call external services:

- Preserve fallbacks.
- Keep chunking/rate sensitivity in mind.
- Surface user-facing status text for errors and in-progress actions.

## Common Tasks

### Add A New Realism Setting

1. Extend `RealismSettings` and defaults in [`route-simulation.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/route-simulation.ts).
2. Add sidebar control in [`Sidebar.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/components/Sidebar.tsx).
3. Pass/update state in [`page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx).
4. Add setting to `previewKeyFor` dependency signature.
5. Validate preview invalidation and output differences.

### Add Another Chart

1. Compute data series in analytics output (`track-analytics.ts`).
2. Add a `LineChartCard` instance in [`page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx).
3. Ensure empty-state and summary behavior are present.

### Change Snapping Behavior

1. Update provider list / strategy in [`osm-matching.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/osm-matching.ts).
2. Re-check `pathPreservationScore` thresholds.
3. Validate with both dense and sparse user-drawn routes.

## Troubleshooting

- Map not showing:
- Confirm Leaflet CSS import in [`globals.css`](/Users/pips/Documents/GitHub/strava-hack/src/app/globals.css).
- Ensure the map component is client-only (`ssr: false` dynamic import in [`page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx)).

- Snapping fails:
- Public OSRM provider may be unavailable/rate-limited.
- App should fall back to raw geometry or show failure status.

- Flat/incorrect elevation:
- Elevation APIs may fail; fallback synthetic terrain may be used.

- Download disabled:
- Preview is stale or missing; regenerate preview first.

## Suggested Next Improvements

- Add automated tests for:
- loop expansion edge cases
- simulation determinism with seeded randomness
- GPX validity checks
- Add optional provider configuration via env vars.
- Add import support for existing GPX routes.

## Strava Integration Setup

1. Create a Strava API application in the Strava developer dashboard.
2. Set callback/authorization URL to:
- `http://localhost:3000/api/strava/callback` for local development
- your production callback URL for deployed environments
3. Add these env vars:
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- optional `STRAVA_REDIRECT_URI` if callback differs from the default
