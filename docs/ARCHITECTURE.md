# Architecture

## Overview

The app is a single-page Next.js client experience that keeps all route editing, simulation, analytics, and export state in [`src/app/page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx).

## High-Level Flow

1. User draws a route on the map.
2. Route can optionally be snapped to roads (`osm-matching.ts`).
3. Route can be loop-expanded (`route-loops.ts`).
4. Simulation produces timestamped points with elevation and optional heart rate (`route-simulation.ts` + `elevation.ts`).
5. Analytics derive chart/summary metrics (`track-analytics.ts`).
6. GPX is generated and downloaded (`gpx-generator.ts`).

## Main UI Modules

- [`page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx)
- Orchestrates state, triggers actions, and coordinates map/sidebar/chart modules.
- Maintains invalidation logic so GPX download only uses fresh previews.

- [`MapContainer.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/components/MapContainer.tsx)
- Renders Leaflet map.
- Handles drawing interactions:
- click: add point
- double-click: finish draw
- right-click: undo
- Displays raw route, snapped route, start/end markers, and user location.

- [`Sidebar.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/components/Sidebar.tsx)
- Control surface for route options, realism sliders, metadata, and actions.
- Renders summary metrics and operational status.

- [`LineChartCard.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/components/LineChartCard.tsx)
- Lightweight SVG chart renderer for pace/elevation/heart-rate profiles.

## Domain/Utility Modules

- [`route-simulation.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/route-simulation.ts)
- Core telemetry generation engine.

- [`osm-matching.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/osm-matching.ts)
- Attempts map matching, then fallback segmented routing, with quality checks.

- [`route-loops.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/route-loops.ts)
- Applies lap logic in repeat or out-and-back modes.

- [`track-analytics.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/track-analytics.ts)
- Calculates stats and chart points from simulated tracks.

- [`elevation.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/elevation.ts)
- Retrieves elevation in chunks from Open-Meteo with OpenTopoData fallback.

- [`gpx-generator.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/gpx-generator.ts)
- Converts track tuples into GPX 1.1 XML (+ Garmin TrackPointExtension HR data).

## State Model (Top-Level)

[`page.tsx`](/Users/pips/Documents/GitHub/strava-hack/src/app/page.tsx) keeps:

- Input state: activity type, pace, datetime, metadata, loop controls, realism sliders.
- Geometry state: raw route, snapped route, snapped toggle.
- Workflow flags: snapping/loading/downloading/location states.
- Preview state: simulated track, computed stats, chart data, freshness key.

The preview freshness key ensures exports are blocked when controls have changed since last preview generation.

## Client-Only Rendering Choices

- Map is dynamically imported with `ssr: false` due to Leaflet browser dependencies.
- Geolocation and downloads run entirely in the browser.

## Styling

- Tailwind CSS 4 via [`globals.css`](/Users/pips/Documents/GitHub/strava-hack/src/app/globals.css).
- Leaflet CSS imported globally.
- Visual theme uses neutral slate + orange accent (`#ff5b14`).
