import {
  distance as turfDistance,
  lineString,
  length as turfLength,
  point,
  pointToLineDistance,
} from "@turf/turf";
import type { ActivityType, LngLatTuple } from "@/lib/route-simulation";

interface SnapRouteOptions {
  coordinates: LngLatTuple[];
  activityType: ActivityType;
}

interface OsrmMatchResponse {
  code: string;
  matchings?: Array<{
    geometry: { coordinates: LngLatTuple[] };
  }>;
}

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    geometry: { coordinates: LngLatTuple[] };
  }>;
}

interface OsrmProvider {
  name: string;
  baseUrl: string;
  profile: "driving" | "walking" | "cycling";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function segmentDistanceM(from: LngLatTuple, to: LngLatTuple): number {
  return turfDistance(point(from), point(to), { units: "kilometers" }) * 1000;
}

function dedupeConsecutive(coordinates: LngLatTuple[]): LngLatTuple[] {
  if (coordinates.length <= 1) return coordinates;
  const deduped: LngLatTuple[] = [coordinates[0]];

  for (let i = 1; i < coordinates.length; i += 1) {
    const [prevLng, prevLat] = deduped[deduped.length - 1];
    const [nextLng, nextLat] = coordinates[i];
    if (Math.abs(prevLng - nextLng) > 1e-8 || Math.abs(prevLat - nextLat) > 1e-8) {
      deduped.push(coordinates[i]);
    }
  }

  return deduped;
}

function densifyCoordinates(coordinates: LngLatTuple[], targetSpacingM = 18): LngLatTuple[] {
  if (coordinates.length <= 1) return coordinates;
  const densified: LngLatTuple[] = [coordinates[0]];

  for (let i = 1; i < coordinates.length; i += 1) {
    const from = coordinates[i - 1];
    const to = coordinates[i];
    const distanceM = segmentDistanceM(from, to);
    const steps = Math.max(1, Math.ceil(distanceM / targetSpacingM));

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      densified.push([
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
      ]);
    }
  }

  return dedupeConsecutive(densified);
}

function capCoordinateCount(coordinates: LngLatTuple[], maxPoints = 95): LngLatTuple[] {
  if (coordinates.length <= maxPoints) return coordinates;
  const stride = Math.ceil(coordinates.length / maxPoints);
  return coordinates.filter((_, index) => index === 0 || index === coordinates.length - 1 || index % stride === 0);
}

function chunkCoordinates(coordinates: LngLatTuple[], maxChunkSize = 60, overlap = 2): LngLatTuple[][] {
  if (coordinates.length <= maxChunkSize) return [coordinates];

  const chunks: LngLatTuple[][] = [];
  let start = 0;

  while (start < coordinates.length) {
    const end = Math.min(start + maxChunkSize, coordinates.length);
    const chunk = coordinates.slice(start, end);
    if (chunk.length >= 2) chunks.push(chunk);
    if (end >= coordinates.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}

function providersForActivity(activityType: ActivityType): OsrmProvider[] {
  if (activityType === "cycle") {
    return [
      { name: "OSM Bike", baseUrl: "https://routing.openstreetmap.de/routed-bike", profile: "driving" },
      { name: "Project OSRM", baseUrl: "https://router.project-osrm.org", profile: "driving" },
    ];
  }

  return [
    { name: "OSM Foot", baseUrl: "https://routing.openstreetmap.de/routed-foot", profile: "driving" },
    { name: "Project OSRM", baseUrl: "https://router.project-osrm.org", profile: "driving" },
  ];
}

function buildRadiuses(coordinates: LngLatTuple[]): string {
  const radiuses = coordinates.map((current, index) => {
    const previous = coordinates[Math.max(0, index - 1)];
    const next = coordinates[Math.min(coordinates.length - 1, index + 1)];
    const localSpacingM = (segmentDistanceM(previous, current) + segmentDistanceM(current, next)) / 2;
    return clamp(localSpacingM * 0.75, 8, 35).toFixed(1);
  });

  return radiuses.join(";");
}

function buildTimestamps(count: number): string {
  const start = Math.floor(Date.now() / 1000);
  const timestamps: number[] = [];
  for (let i = 0; i < count; i += 1) {
    timestamps.push(start + i);
  }
  return timestamps.join(";");
}

function pathPreservationScore(rawChunk: LngLatTuple[], snapped: LngLatTuple[]) {
  if (rawChunk.length < 2 || snapped.length < 2) {
    return { valid: false, meanDeviationM: Infinity, maxDeviationM: Infinity };
  }

  const rawLine = lineString(rawChunk);
  const snappedLine = lineString(snapped);
  const deviations = rawChunk.map((coordinate) =>
    pointToLineDistance(point(coordinate), snappedLine, { units: "meters" }),
  );
  const meanDeviationM = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  const maxDeviationM = Math.max(...deviations);

  const rawLengthKm = Math.max(turfLength(rawLine, { units: "kilometers" }), 0.001);
  const snappedLengthKm = turfLength(snappedLine, { units: "kilometers" });
  const lengthRatio = snappedLengthKm / rawLengthKm;
  const startOffsetM = segmentDistanceM(rawChunk[0], snapped[0]);
  const endOffsetM = segmentDistanceM(rawChunk[rawChunk.length - 1], snapped[snapped.length - 1]);

  const valid =
    meanDeviationM <= 24 &&
    maxDeviationM <= 85 &&
    lengthRatio >= 0.55 &&
    lengthRatio <= 1.7 &&
    startOffsetM <= 55 &&
    endOffsetM <= 55;

  return { valid, meanDeviationM, maxDeviationM };
}

async function routeBetween(
  provider: OsrmProvider,
  from: LngLatTuple,
  to: LngLatTuple,
): Promise<LngLatTuple[] | null> {
  const encoded = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `${provider.baseUrl}/route/v1/${provider.profile}/${encoded}` +
    "?overview=full&geometries=geojson&steps=false&continue_straight=true&alternatives=false";
  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as OsrmRouteResponse;
  const routed = payload.routes?.[0]?.geometry?.coordinates;
  return payload.code === "Ok" && routed?.length ? routed : null;
}

async function tryMapMatch(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  if (chunk.length < 3) return null;

  const densified = capCoordinateCount(densifyCoordinates(chunk, 18), 95);
  const encodedCoordinates = densified.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const radiuses = buildRadiuses(densified);
  const timestamps = buildTimestamps(densified.length);
  const url =
    `${provider.baseUrl}/match/v1/${provider.profile}/${encodedCoordinates}` +
    `?geometries=geojson&overview=full&steps=false&tidy=false&gaps=split&annotations=false&radiuses=${radiuses}&timestamps=${timestamps}`;

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as OsrmMatchResponse;
  const matched = payload.matchings?.[0]?.geometry?.coordinates;
  if (payload.code !== "Ok" || !matched?.length) return null;

  return pathPreservationScore(chunk, matched).valid ? matched : null;
}

async function trySegmentedRoute(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  if (chunk.length < 2) return null;

  const anchorStep = 4;
  const anchors: LngLatTuple[] = [];
  for (let i = 0; i < chunk.length; i += anchorStep) {
    anchors.push(chunk[i]);
  }
  if (anchors[anchors.length - 1] !== chunk[chunk.length - 1]) {
    anchors.push(chunk[chunk.length - 1]);
  }

  const routed: LngLatTuple[] = [];
  for (let i = 1; i < anchors.length; i += 1) {
    const segment = await routeBetween(provider, anchors[i - 1], anchors[i]);
    if (!segment || segment.length < 2) return null;
    if (i === 1) routed.push(...segment);
    else routed.push(...segment.slice(1));
  }

  const deduped = dedupeConsecutive(routed);
  return pathPreservationScore(chunk, deduped).valid ? deduped : null;
}

async function snapChunkWithProvider(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  const matched = await tryMapMatch(provider, chunk);
  if (matched && matched.length > 1) return matched;

  const routed = await trySegmentedRoute(provider, chunk);
  if (routed && routed.length > 1) return routed;

  return null;
}

export async function snapRouteToRoads({ coordinates, activityType }: SnapRouteOptions): Promise<LngLatTuple[]> {
  if (coordinates.length < 2) return coordinates;

  const raw = dedupeConsecutive(coordinates);
  const chunks = chunkCoordinates(raw, 60, 2);
  const providers = providersForActivity(activityType);
  const merged: LngLatTuple[] = [];
  let matchedAnyChunk = false;

  for (const [index, chunk] of chunks.entries()) {
    let bestChunk: LngLatTuple[] | null = null;

    for (const provider of providers) {
      try {
        const snappedChunk = await snapChunkWithProvider(provider, chunk);
        if (snappedChunk && snappedChunk.length > 1) {
          bestChunk = snappedChunk;
          matchedAnyChunk = true;
          break;
        }
      } catch {
        continue;
      }
    }

    const chunkToAppend = bestChunk ?? chunk;
    if (index === 0) merged.push(...chunkToAppend);
    else merged.push(...chunkToAppend.slice(1));
  }

  const deduped = dedupeConsecutive(merged);
  if (deduped.length > 1) {
    return deduped;
  }

  if (!matchedAnyChunk) {
    throw new Error("Could not map-match this route; path kept unchanged.");
  }

  return raw;
}
