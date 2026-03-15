import type { ActivityType, LngLatTuple } from "@/lib/route-simulation";

interface SnapRouteOptions {
  coordinates: LngLatTuple[];
  activityType: ActivityType;
}

interface OsrmMatchingResponse {
  code: string;
  matchings?: Array<{
    geometry: {
      coordinates: LngLatTuple[];
    };
  }>;
  message?: string;
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

function providerUrls(activityType: ActivityType): string[] {
  if (activityType === "cycle") {
    return ["https://routing.openstreetmap.de/routed-bike", "https://router.project-osrm.org"];
  }

  return ["https://routing.openstreetmap.de/routed-foot", "https://router.project-osrm.org"];
}

async function tryMatchChunk(baseUrl: string, chunk: LngLatTuple[]): Promise<LngLatTuple[] | null> {
  const encodedCoordinates = chunk.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const url = `${baseUrl}/match/v1/driving/${encodedCoordinates}?geometries=geojson&overview=full&steps=false&tidy=true&gaps=ignore&annotations=false`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const payload = (await response.json()) as OsrmMatchingResponse;
  if (payload.code !== "Ok" || !payload.matchings?.[0]?.geometry.coordinates) return null;

  return payload.matchings[0].geometry.coordinates;
}

export async function snapRouteToRoads({ coordinates, activityType }: SnapRouteOptions): Promise<LngLatTuple[]> {
  if (coordinates.length < 2) return coordinates;

  const coordinateChunks = chunkCoordinates(coordinates, 100);
  const providers = providerUrls(activityType);

  for (const baseUrl of providers) {
    try {
      const snapped: LngLatTuple[] = [];

      for (const [index, chunk] of coordinateChunks.entries()) {
        const matchedCoordinates = await tryMatchChunk(baseUrl, chunk);
        if (!matchedCoordinates) {
          throw new Error(`No matching route from ${baseUrl}`);
        }

        if (index === 0) {
          snapped.push(...matchedCoordinates);
        } else {
          snapped.push(...matchedCoordinates.slice(1));
        }
      }

      if (snapped.length > 1) {
        return snapped;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Unable to snap route with available OSM routing servers.");
}
