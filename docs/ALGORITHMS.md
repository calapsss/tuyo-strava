# Algorithms

## 1) Route Loop Expansion

File: [`src/lib/route-loops.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/route-loops.ts)

- Input route is deduplicated for consecutive identical points.
- `laps` is clamped to `1..20`.
- `auto` mode chooses:
- `repeat` for closed routes (start/end within threshold).
- `out-and-back` for open routes.
- `repeat` mode concatenates route laps while avoiding duplicate join points.
- `out-and-back` mode builds one full out-back cycle and repeats that cycle.

## 2) OSM Map Matching + Routing Fallback

File: [`src/lib/osm-matching.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/osm-matching.ts)

- Route is deduplicated and chunked (default chunk size 60, overlap 2).
- Per chunk, provider order is tried based on activity.
- Primary strategy:
- Densify path points.
- Cap point count for API constraints.
- Call OSRM `/match`.
- Fallback strategy:
- Build anchor points.
- Route anchor-to-anchor with OSRM `/route`.
- Quality gating (`pathPreservationScore`) validates:
- mean/max deviation from raw path
- length ratio
- start/end offsets
- If no provider can match any chunk, function throws.
- If some chunks fail, unmatched chunk can fall back to original geometry.

## 3) Telemetry Simulation

File: [`src/lib/route-simulation.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/route-simulation.ts)

### Preprocessing

- Deduplicate coordinates with minimum spacing.
- Build segment + cumulative distance profile.
- Validate minimum route size.

### Pace And Timing

- Convert target pace (`min/km`) into baseline speed.
- Build sampled timestamps at configured interval (`1..3` sec).
- Introduce realism effects:
- long-wave pace drift
- stochastic pace noise
- optional micro-pauses under higher inconsistency
- fatigue over progress
- Clamp resulting speed by activity-specific limits.

### Elevation

- Fetch elevation profile from APIs in chunks.
- If unavailable/invalid, generate synthetic fallback terrain profile.
- Apply smooth noise based on realism controls.

### GPS Jitter

- Add correlated north/east meter offsets per point.
- Convert meter offsets to lat/lng offsets with latitude-aware scaling.

### Heart Rate

- Initialize baseline by activity type.
- For each step, estimate target HR from:
- effort vs pace
- climb grade
- speed drift
- random variability
- Apply bounded adaptation over time.
- Optional inclusion controlled by `includeHeartRate`.

## 4) Track Analytics

File: [`src/lib/track-analytics.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/track-analytics.ts)

- Compute cumulative distance/time and elevation gain.
- Compute rolling pace from recent time window.
- Smooth pace/elevation/heart-rate via moving averages.
- Downsample chart output for rendering efficiency.
- Return:
- `TrackStats`: distance, duration, pace, gain, HR avg, point count
- `ChartPoint[]`: distance-indexed series for chart cards

## 5) GPX Generation

File: [`src/lib/gpx-generator.ts`](/Users/pips/Documents/GitHub/strava-hack/src/lib/gpx-generator.ts)

- Escapes XML content.
- Normalizes timestamps to ISO format.
- Emits GPX 1.1 structure with metadata and single `<trkseg>`.
- Writes each point with lat/lon/elevation/time.
- Adds Garmin HR extension if heart-rate exists on that point.

## External API Notes

- Elevation provider chunk sizes are set to 100 coordinates/request.
- Matching/routing providers are public endpoints and can rate-limit or fail.
- The app intentionally includes fallback behavior to preserve user flow when remote calls fail.
