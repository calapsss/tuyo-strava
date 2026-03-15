# TUYO Route Forge GPX

Draw a route on a map, apply realistic telemetry simulation, preview pace/elevation/heart-rate charts, and export a GPX file ready for activity platforms.

## What This App Does

- Draw custom routes directly on an OpenStreetMap map.
- Optionally snap a drawn path to roads/trails using OSRM map matching and routing.
- Repeat routes as loops (repeat-circuit or out-and-back).
- Simulate realistic movement data:
- pace variability
- GPS jitter
- elevation noise
- heart-rate behavior
- sampling interval
- Preview generated stats and chart profiles before export.
- Download generated GPX with optional heart-rate extensions.
- One-click upload to Strava with OAuth login.
- Payment-gated Strava upload flow (GCash QR + payment screenshot proof).
- Strava upload modal for title, description, local private notes, and optional photo attachment.

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS 4
- Leaflet + React Leaflet
- Turf.js for geospatial calculations

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install And Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build And Start Production

```bash
npm run build
npm run start
```

### Lint

```bash
npm run lint
```

## Environment Variables

Strava upload requires server-side credentials:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- optional `STRAVA_REDIRECT_URI` (defaults to `<origin>/api/strava/callback`)
- `DISCORD_PAYMENT_WEBHOOK_URL` (for payment proof forwarding)
- optional `NEXT_PUBLIC_GCASH_QR_IMAGE_PATH` (defaults to `/gcash-qr.png`)
- optional `NEXT_PUBLIC_PROMO_END_AT` (ISO timestamp for countdown)

Copy `.env.example` to `.env.local` if you want to keep environment variables explicit.

`NEXT_PUBLIC_MAPBOX_TOKEN` is a placeholder variable and is not used by the current implementation.

## How To Use

1. Click `Draw` or `Draw Route` to start drawing.
2. Click on map points to create a path.
3. Double-click to finish drawing.
4. Right-click while drawing to undo the last point.
5. Optional: click `Align Path To Road` to snap to OSM road geometry.
6. Tune realism sliders and metadata in the sidebar.
7. Click `Generate Realism Preview`.
8. Review metrics/charts.
9. Click `Download GPX`.
10. Optional: click `Connect Strava & Upload` (or `Upload To Strava`) for direct upload.
11. Payment modal appears with your GCash QR and price (PHP 50).
12. Click `I Paid`, upload payment screenshot proof (sent to Discord webhook).
13. Continue to Strava upload modal and set title/description/flags.
14. Optional: attach a photo (depends on Strava API permissions for your app/account).

## Strava Notes

- `Private Notes` in the modal are saved locally in your browser and are not sent by Strava’s public upload fields.
- Photo upload uses Strava media endpoints that may be unavailable depending on app type and account permissions.

## Payment Notes

- Put your QR image in `public/gcash-qr.png` or set `NEXT_PUBLIC_GCASH_QR_IMAGE_PATH`.
- Payment proof screenshot is forwarded to your Discord webhook URL.

## Project Structure

```text
src/
  app/
    layout.tsx
    page.tsx
    globals.css
  components/
    MapContainer.tsx
    Sidebar.tsx
    LineChartCard.tsx
  lib/
    route-simulation.ts
    osm-matching.ts
    route-loops.ts
    track-analytics.ts
    elevation.ts
    gpx-generator.ts
public/
```

## External Services Used At Runtime

- OpenStreetMap tile server (map tiles)
- `routing.openstreetmap.de` and `router.project-osrm.org` (route matching/routing)
- `api.open-meteo.com` and `api.opentopodata.org` (elevation lookup)

When snapping or generating elevation-enhanced tracks, route coordinates are sent to these third-party APIs.

## Documentation Index

- [Architecture](docs/ARCHITECTURE.md)
- [Algorithms](docs/ALGORITHMS.md)
- [Development Guide](docs/DEVELOPMENT.md)
