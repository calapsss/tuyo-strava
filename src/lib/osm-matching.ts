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

function chunkCoordinates(coordinates: LngLatTuple[], maxChunkSize = 100): LngLatTuple[][] {
  if (coordinates.length <= maxChunkSize) return [coordinates];

  const chunks: LngLatTuple[][] = [];
  let start = 0;

  while (start < coordinates.length) {
    const end = Math.min(start + maxChunkSize, coordinates.length);
    const chunk = coordinates.slice(start, end);
    if (chunk.length >= 2) chunks.push(chunk);
    if (end >= coordinates.length) break;
    start = end - 1;
  }

  return chunks;
}

function providersForActivity(activityType: ActivityType): OsrmProvider[] {
  if (activityType === "cycle") {
    return [
      { name: "OSM Bike", baseUrl: "https://routing.openstreetmap.de/routed-bike", profile: "driving" },
      { name: "Project OSRM", baseUrl: "https://router.project-osrm.org", profile: "cycling" },
    ];
  }

  return [
    { name: "OSM Foot", baseUrl: "https://routing.openstreetmap.de/routed-foot", profile: "driving" },
    { name: "Project OSRM", baseUrl: "https://router.project-osrm.org", profile: "walking" },
  ];
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

async function tryMapMatch(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  if (chunk.length < 3) return null;

  const encodedCoordinates = chunk.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url =
    `${provider.baseUrl}/match/v1/${provider.profile}/${encodedCoordinates}` +
    "?geometries=geojson&overview=full&steps=false&tidy=true&gaps=ignore&annotations=false";

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as OsrmMatchResponse;
  const matched = payload.matchings?.[0]?.geometry?.coordinates;
  return payload.code === "Ok" && matched?.length ? matched : null;
}

async function tryRoute(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  const encodedCoordinates = chunk.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url =
    `${provider.baseUrl}/route/v1/${provider.profile}/${encodedCoordinates}` +
    "?overview=full&geometries=geojson&steps=false&continue_straight=true&alternatives=false";

  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as OsrmRouteResponse;
  const routed = payload.routes?.[0]?.geometry?.coordinates;
  return payload.code === "Ok" && routed?.length ? routed : null;
}

async function snapChunk(provider: OsrmProvider, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  const matched = await tryMapMatch(provider, chunk);
  if (matched && matched.length > 1) return matched;
  return tryRoute(provider, chunk);
}

export async function snapRouteToRoads({ coordinates, activityType }: SnapRouteOptions): Promise<LngLatTuple[]> {
  if (coordinates.length < 2) return coordinates;

  const chunks = chunkCoordinates(dedupeConsecutive(coordinates), 100);
  const providers = providersForActivity(activityType);

  for (const provider of providers) {
    try {
      const snapped: LngLatTuple[] = [];

      for (const [index, chunk] of chunks.entries()) {
        const snappedChunk = await snapChunk(provider, chunk);
        if (!snappedChunk || snappedChunk.length < 2) {
          throw new Error(`Could not snap chunk with ${provider.name}.`);
        }

        if (index === 0) {
          snapped.push(...snappedChunk);
        } else {
          snapped.push(...snappedChunk.slice(1));
        }
      }

      const deduped = dedupeConsecutive(snapped);
      if (deduped.length > 1) {
        return deduped;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Unable to snap route using the available OSM routing providers.");
}
