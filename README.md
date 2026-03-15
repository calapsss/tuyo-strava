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

This project currently works without required secrets.

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
