import {
  destination as turfDestination,
  distance as turfDistance,
  lineString,
  length as turfLength,
  point,
} from "@turf/turf";
import { fetchElevationMeters } from "@/lib/elevation";

export type ActivityType = "run" | "walk" | "cycle";
export type LngLatTuple = [longitude: number, latitude: number];

export interface SimulatedTrackPoint {
  lat: number;
  lng: number;
  ele: number;
  time: Date;
  hr: number;
}

interface SimulationOptions {
  coordinates: LngLatTuple[];
  averagePaceMinPerKm: number;
  startTime: Date;
  activityType: ActivityType;
}

interface RouteProfile {
  coordinates: LngLatTuple[];
  segmentDistancesM: number[];
  cumulativeDistancesM: number[];
  totalDistanceM: number;
}

const SAMPLE_INTERVAL_SEC = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function toMeters(from: LngLatTuple, to: LngLatTuple): number {
  return turfDistance(point(from), point(to), { units: "kilometers" }) * 1000;
}

function dedupeCoordinates(coordinates: LngLatTuple[], minDistanceM = 0.8): LngLatTuple[] {
  if (coordinates.length <= 1) return coordinates;

  const deduped: LngLatTuple[] = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i += 1) {
    if (toMeters(deduped[deduped.length - 1], coordinates[i]) >= minDistanceM) {
      deduped.push(coordinates[i]);
    }
  }

  return deduped;
}

function buildRouteProfile(coordinates: LngLatTuple[]): RouteProfile {
  const segmentDistancesM: number[] = [];
  const cumulativeDistancesM = [0];
  let totalDistanceM = 0;

  for (let i = 1; i < coordinates.length; i += 1) {
    const segmentDistanceM = toMeters(coordinates[i - 1], coordinates[i]);
    segmentDistancesM.push(segmentDistanceM);
    totalDistanceM += segmentDistanceM;
    cumulativeDistancesM.push(totalDistanceM);
  }

  return {
    coordinates,
    segmentDistancesM,
    cumulativeDistancesM,
    totalDistanceM,
  };
}

function interpolateAlongRoute(
  profile: RouteProfile,
  targetDistanceM: number,
  initialSegmentIndex: number,
): { coordinate: LngLatTuple; segmentIndex: number } {
  const { coordinates, cumulativeDistancesM, segmentDistancesM } = profile;
  const boundedDistance = clamp(targetDistanceM, 0, profile.totalDistanceM);
  let segmentIndex = initialSegmentIndex;

  while (
    segmentIndex < segmentDistancesM.length - 1 &&
    cumulativeDistancesM[segmentIndex + 1] < boundedDistance
  ) {
    segmentIndex += 1;
  }

  const segmentStartDistance = cumulativeDistancesM[segmentIndex];
  const segmentDistance = Math.max(segmentDistancesM[segmentIndex], 0.001);
  const ratio = clamp((boundedDistance - segmentStartDistance) / segmentDistance, 0, 1);
  const [fromLng, fromLat] = coordinates[segmentIndex];
  const [toLng, toLat] = coordinates[segmentIndex + 1];

  return {
    coordinate: [fromLng + (toLng - fromLng) * ratio, fromLat + (toLat - fromLat) * ratio],
    segmentIndex,
  };
}

function withGpsJitter(coordinate: LngLatTuple): LngLatTuple {
  const jitterDistanceKm = randomBetween(0.002, 0.005);
  const jitterBearing = randomBetween(0, 360);
  const shifted = turfDestination(point(coordinate), jitterDistanceKm, jitterBearing, { units: "kilometers" });
  const [lng, lat] = shifted.geometry.coordinates as LngLatTuple;
  return [clamp(lng, -180, 180), clamp(lat, -90, 90)];
}

function fallbackElevation(coordinates: LngLatTuple[]): number[] {
  let base = randomBetween(15, 55);
  return coordinates.map((_, index) => {
    const progress = index / Math.max(coordinates.length - 1, 1);
    const terrainWave = Math.sin(progress * Math.PI * 3.8) * 9;
    const terrainNoise = randomBetween(-1.2, 1.2);
    base = Math.max(0, base + randomBetween(-0.6, 0.6));
    return Math.max(0, base + terrainWave + terrainNoise);
  });
}

function defaultHeartRate(activityType: ActivityType): number {
  if (activityType === "walk") return 128;
  if (activityType === "cycle") return 132;
  return 136;
}

function isRunDistanceWindow(distanceKm: number): boolean {
  return distanceKm >= 5 && distanceKm <= 6.2;
}

export function computeRouteDistanceKm(coordinates: LngLatTuple[]): number {
  if (coordinates.length < 2) return 0;
  return turfLength(lineString(coordinates), { units: "kilometers" });
}

export async function simulateTrackPoints({
  coordinates,
  averagePaceMinPerKm,
  startTime,
  activityType,
}: SimulationOptions): Promise<SimulatedTrackPoint[]> {
  const cleanedCoordinates = dedupeCoordinates(coordinates);
  if (cleanedCoordinates.length < 2) return [];

  const profile = buildRouteProfile(cleanedCoordinates);
  if (profile.totalDistanceM < 5) return [];

  const routeDistanceKm = profile.totalDistanceM / 1000;
  const safePace = clamp(averagePaceMinPerKm, 2.5, 20);
  const baseSpeedMps = 1000 / (safePace * 60);
  const baselineDurationSec = profile.totalDistanceM / baseSpeedMps;
  const minPointTarget = activityType === "run" && isRunDistanceWindow(routeDistanceKm) ? 2000 : 0;
  let pauseBudgetSec = Math.max(0, Math.ceil(minPointTarget - (baselineDurationSec + 1)));
  pauseBudgetSec += Math.round(routeDistanceKm * randomBetween(8, 20));

  const sampledCoordinates: LngLatTuple[] = [cleanedCoordinates[0]];
  const sampledTimes: Date[] = [new Date(startTime.getTime())];
  const sampledSpeedsMps: number[] = [0];
  let currentTimeMs = startTime.getTime();
  let traveledDistanceM = 0;
  let routeSegmentIndex = 0;
  let paceNoise = 0;
  let pauseRemainingSec = 0;
  let nextPauseTriggerDistanceM = randomBetween(450, 1200);

  while (traveledDistanceM < profile.totalDistanceM) {
    if (
      pauseRemainingSec <= 0 &&
      pauseBudgetSec > 0 &&
      traveledDistanceM >= nextPauseTriggerDistanceM &&
      traveledDistanceM < profile.totalDistanceM * 0.98
    ) {
      const stopDurationSec = Math.min(Math.round(randomBetween(6, 22)), pauseBudgetSec);
      pauseRemainingSec = stopDurationSec;
      pauseBudgetSec -= stopDurationSec;
      nextPauseTriggerDistanceM += randomBetween(550, 1400);
    }

    let speedMps = 0;
    if (pauseRemainingSec > 0) {
      speedMps = randomBetween(0, 0.35);
      pauseRemainingSec -= SAMPLE_INTERVAL_SEC;
    } else {
      paceNoise = clamp(paceNoise * 0.92 + randomBetween(-0.045, 0.045), -0.22, 0.28);
      const fatiguePenalty = (traveledDistanceM / profile.totalDistanceM) * 0.08;
      const simulatedPace = safePace * (1 + paceNoise + fatiguePenalty);
      speedMps = clamp(
        1000 / (simulatedPace * 60),
        activityType === "walk" ? 0.6 : 1.0,
        activityType === "cycle" ? 12 : 6,
      );
    }

    traveledDistanceM = Math.min(profile.totalDistanceM, traveledDistanceM + speedMps * SAMPLE_INTERVAL_SEC);
    const interpolated = interpolateAlongRoute(profile, traveledDistanceM, routeSegmentIndex);
    routeSegmentIndex = interpolated.segmentIndex;
    currentTimeMs += SAMPLE_INTERVAL_SEC * 1000;
    sampledCoordinates.push(interpolated.coordinate);
    sampledTimes.push(new Date(currentTimeMs));
    sampledSpeedsMps.push(speedMps);
  }

  while (pauseBudgetSec > 0) {
    const stayCoordinate = sampledCoordinates[sampledCoordinates.length - 1];
    currentTimeMs += SAMPLE_INTERVAL_SEC * 1000;
    sampledCoordinates.push(stayCoordinate);
    sampledTimes.push(new Date(currentTimeMs));
    sampledSpeedsMps.push(randomBetween(0, 0.2));
    pauseBudgetSec -= SAMPLE_INTERVAL_SEC;
  }

  let elevationMeters: number[];
  try {
    elevationMeters = await fetchElevationMeters(sampledCoordinates);
    if (elevationMeters.length !== sampledCoordinates.length) {
      elevationMeters = fallbackElevation(sampledCoordinates);
    }
  } catch {
    elevationMeters = fallbackElevation(sampledCoordinates);
  }

  let elevationNoise = 0;
  const noisyElevation = elevationMeters.map((value) => {
    elevationNoise = elevationNoise * 0.62 + randomBetween(-0.9, 0.9);
    return Math.max(0, value + elevationNoise + randomBetween(-0.5, 0.5));
  });

  const output: SimulatedTrackPoint[] = [];
  let currentHeartRate = defaultHeartRate(activityType);

  for (let i = 0; i < sampledCoordinates.length; i += 1) {
    const coordinate = sampledCoordinates[i];
    const [jitteredLng, jitteredLat] = withGpsJitter(coordinate);
    const currentElevation = noisyElevation[i];

    if (i > 0) {
      const stepDistanceM = toMeters(sampledCoordinates[i - 1], sampledCoordinates[i]);
      const stepSpeedMps = sampledSpeedsMps[i];
      const stepPace = stepSpeedMps > 0.25 ? 1000 / (stepSpeedMps * 60) : safePace * 1.6;
      const effortLoad = clamp((safePace - stepPace) / safePace + 0.45, 0, 1);
      const grade = (currentElevation - noisyElevation[i - 1]) / Math.max(stepDistanceM, 1);
      const climbingLoad = clamp(Math.max(grade, 0) * 8.5, 0, 1);
      const speedDrift = clamp((stepSpeedMps - baseSpeedMps) / Math.max(baseSpeedMps, 0.8), -0.2, 0.5);
      const targetHr =
        128 +
        effortLoad * 24 +
        climbingLoad * 20 +
        speedDrift * 8 +
        randomBetween(-3.2, 3.2);
      currentHeartRate = clamp(currentHeartRate + (targetHr - currentHeartRate) * 0.26, 130, 170);
    }

    output.push({
      lat: jitteredLat,
      lng: jitteredLng,
      ele: currentElevation,
      time: sampledTimes[i],
      hr: currentHeartRate,
    });
  }

  return output;
}
