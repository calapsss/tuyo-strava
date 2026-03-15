import { distance as turfDistance, point } from "@turf/turf";
import type { LngLatTuple } from "@/lib/route-simulation";

export type LoopMode = "auto" | "repeat" | "out-and-back";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function metersBetween(a: LngLatTuple, b: LngLatTuple): number {
  return turfDistance(point(a), point(b), { units: "kilometers" }) * 1000;
}

export function isClosedRoute(coordinates: LngLatTuple[], closeThresholdM = 35): boolean {
  if (coordinates.length < 3) return false;
  return metersBetween(coordinates[0], coordinates[coordinates.length - 1]) <= closeThresholdM;
}

export function applyLoopsToRoute(coordinates: LngLatTuple[], lapsInput: number, modeInput: LoopMode): LngLatTuple[] {
  const base = dedupeConsecutive(coordinates);
  if (base.length < 2) return base;

  const laps = clamp(Math.round(lapsInput), 1, 20);
  if (laps <= 1) return base;

  const closed = isClosedRoute(base);
  const mode: LoopMode = modeInput === "auto" ? (closed ? "repeat" : "out-and-back") : modeInput;

  if (mode === "repeat") {
    const normalized =
      closed && metersBetween(base[0], base[base.length - 1]) < 10 ? base.slice(0, -1) : base;
    const result: LngLatTuple[] = [...normalized];
    for (let lap = 2; lap <= laps; lap += 1) {
      result.push(...normalized.slice(1));
    }
    return result;
  }

  const singleOutBack = [...base, ...[...base].reverse().slice(1)];
  const result: LngLatTuple[] = [...singleOutBack];
  for (let lap = 2; lap <= laps; lap += 1) {
    result.push(...singleOutBack.slice(1));
  }
  return result;
}
