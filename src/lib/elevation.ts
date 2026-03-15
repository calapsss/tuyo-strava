import type { LngLatTuple } from "@/lib/route-simulation";

interface OpenMeteoResponse {
  elevation?: number[];
}

interface OpenTopoDataResponse {
  status?: string;
  results?: Array<{ elevation?: number | null }>;
}

const OPEN_METEO_CHUNK_SIZE = 100;
const OPEN_TOPO_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchOpenMeteoElevations(coordinates: LngLatTuple[]): Promise<number[]> {
  const results: number[] = [];

  for (const group of chunk(coordinates, OPEN_METEO_CHUNK_SIZE)) {
    const latitudes = group.map(([, lat]) => lat.toFixed(6)).join(",");
    const longitudes = group.map(([lng]) => lng.toFixed(6)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${latitudes}&longitude=${longitudes}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo elevation request failed (${response.status})`);
    }

    const payload = (await response.json()) as OpenMeteoResponse;
    if (!Array.isArray(payload.elevation) || payload.elevation.length !== group.length) {
      throw new Error("Open-Meteo returned an invalid elevation payload.");
    }

    results.push(...payload.elevation.map((value) => Number(value) || 0));
  }

  return results;
}

async function fetchOpenTopoElevations(coordinates: LngLatTuple[]): Promise<number[]> {
  const results: number[] = [];

  for (const group of chunk(coordinates, OPEN_TOPO_CHUNK_SIZE)) {
    const locations = group.map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join("|");
    const url = `https://api.opentopodata.org/v1/srtm90m?locations=${encodeURIComponent(locations)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OpenTopoData elevation request failed (${response.status})`);
    }

    const payload = (await response.json()) as OpenTopoDataResponse;
    if (payload.status !== "OK" || !Array.isArray(payload.results) || payload.results.length !== group.length) {
      throw new Error("OpenTopoData returned an invalid elevation payload.");
    }

    results.push(...payload.results.map((item) => Number(item.elevation) || 0));
  }

  return results;
}

export async function fetchElevationMeters(coordinates: LngLatTuple[]): Promise<number[]> {
  if (coordinates.length === 0) return [];

  try {
    return await fetchOpenMeteoElevations(coordinates);
  } catch {
    return fetchOpenTopoElevations(coordinates);
  }
}
