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

export interface RealismSettings {
  paceInconsistencyPct: number;
  gpsJitterMeters: number;
  elevationNoiseMeters: number;
  heartRateVariabilityPct: number;
  smoothnessPct: number;
  samplingIntervalSec: number;
  includeHeartRate: boolean;
}

export const DEFAULT_REALISM_SETTINGS: RealismSettings = {
  paceInconsistencyPct: 2,
  gpsJitterMeters: 2.2,
  elevationNoiseMeters: 0.9,
  heartRateVariabilityPct: 4,
  smoothnessPct: 82,
  samplingIntervalSec: 1,
  includeHeartRate: true,
};

export interface SimulatedTrackPoint {
  lat: number;
  lng: number;
  ele: number;
  time: Date;
  hr: number | null;
}

interface SimulationOptions {
  coordinates: LngLatTuple[];
  averagePaceMinPerKm: number;
  startTime: Date;
  activityType: ActivityType;
  realism?: Partial<RealismSettings>;
}

interface RouteProfile {
  coordinates: LngLatTuple[];
  segmentDistancesM: number[];
  cumulativeDistancesM: number[];
  totalDistanceM: number;
}

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

function withGpsJitter(coordinate: LngLatTuple, jitterMeters: number): LngLatTuple {
  if (jitterMeters <= 0.05) return coordinate;
  const jitterDistanceKm = randomBetween(0, jitterMeters * 0.7) / 1000;
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
  if (activityType === "walk") return 118;
  if (activityType === "cycle") return 124;
  return 128;
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
  realism,
}: SimulationOptions): Promise<SimulatedTrackPoint[]> {
  const settings = { ...DEFAULT_REALISM_SETTINGS, ...realism };
  const sampleIntervalSec = clamp(Math.round(settings.samplingIntervalSec), 1, 3);
  const smoothness = clamp(settings.smoothnessPct / 100, 0, 1);

  const cleanedCoordinates = dedupeCoordinates(coordinates);
  if (cleanedCoordinates.length < 2) return [];

  const profile = buildRouteProfile(cleanedCoordinates);
  if (profile.totalDistanceM < 5) return [];

  const routeDistanceKm = profile.totalDistanceM / 1000;
  const safePace = clamp(averagePaceMinPerKm, 2.5, 20);
  const baseSpeedMps = 1000 / (safePace * 60);
  const baselineDurationSec = profile.totalDistanceM / baseSpeedMps;
  const minPointTarget = activityType === "run" && isRunDistanceWindow(routeDistanceKm) && sampleIntervalSec === 1 ? 2000 : 0;
  const minDurationTargetSec = minPointTarget;
  const inconsistency = clamp(settings.paceInconsistencyPct / 100, 0, 0.4);
  const desiredDurationSec = Math.max(
    baselineDurationSec * (1 + inconsistency * (0.07 + (1 - smoothness) * 0.08)),
    minDurationTargetSec,
  );
  const durationScale = clamp(desiredDurationSec / baselineDurationSec, 1, 1.35);
  const targetBaseSpeedMps = baseSpeedMps / durationScale;

  const sampledCoordinates: LngLatTuple[] = [cleanedCoordinates[0]];
  const sampledTimes: Date[] = [new Date(startTime.getTime())];
  const sampledSpeedsMps: number[] = [0];
  let currentTimeMs = startTime.getTime();
  let traveledDistanceM = 0;
  let routeSegmentIndex = 0;
  let paceNoise = 0;
  let microPauseRemainingSec = 0;
  let nextPauseTriggerDistanceM = randomBetween(1300, 2200);
  const paceNoiseDrift = 0.88 + smoothness * 0.1;
  const paceNoiseAmp = 0.003 + inconsistency * (0.05 + (1 - smoothness) * 0.08);
  const fatigueAmp = 0.01 + inconsistency * 0.03;
  const paceNoiseCap = 0.03 + inconsistency * 0.18;

  while (traveledDistanceM < profile.totalDistanceM) {
    if (
      microPauseRemainingSec <= 0 &&
      inconsistency > 0.12 &&
      traveledDistanceM >= nextPauseTriggerDistanceM &&
      traveledDistanceM < profile.totalDistanceM * 0.985
    ) {
      microPauseRemainingSec = Math.round(randomBetween(2, 6));
      nextPauseTriggerDistanceM += randomBetween(1300, 2300);
    }

    let speedMps = 0;
    if (microPauseRemainingSec > 0) {
      speedMps = randomBetween(0.45, 1.05);
      microPauseRemainingSec -= sampleIntervalSec;
    } else {
      paceNoise = clamp(
        paceNoise * paceNoiseDrift + randomBetween(-paceNoiseAmp, paceNoiseAmp),
        -paceNoiseCap,
        paceNoiseCap,
      );
      const fatiguePenalty = (traveledDistanceM / profile.totalDistanceM) * fatigueAmp;
      const simulatedPace = safePace * durationScale * (1 + paceNoise + fatiguePenalty);
      speedMps = clamp(
        1000 / (simulatedPace * 60),
        activityType === "walk" ? 0.75 : 1.2,
        activityType === "cycle" ? 12 : 6.5,
      );
    }

    traveledDistanceM = Math.min(profile.totalDistanceM, traveledDistanceM + speedMps * sampleIntervalSec);
    const interpolated = interpolateAlongRoute(profile, traveledDistanceM, routeSegmentIndex);
    routeSegmentIndex = interpolated.segmentIndex;
    currentTimeMs += sampleIntervalSec * 1000;
    sampledCoordinates.push(interpolated.coordinate);
    sampledTimes.push(new Date(currentTimeMs));
    sampledSpeedsMps.push(speedMps);
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

  const elevationNoiseAmp = clamp(settings.elevationNoiseMeters, 0, 8);
  const elevationNoiseDrift = 0.7 + smoothness * 0.25;
  let elevationNoise = 0;
  const noisyElevation = elevationMeters.map((value) => {
    elevationNoise =
      elevationNoise * elevationNoiseDrift +
      randomBetween(-elevationNoiseAmp, elevationNoiseAmp) * (0.08 + (1 - smoothness) * 0.14);
    return Math.max(0, value + elevationNoise + randomBetween(-elevationNoiseAmp * 0.1, elevationNoiseAmp * 0.1));
  });

  const output: SimulatedTrackPoint[] = [];
  let currentHeartRate = defaultHeartRate(activityType);
  const hrVariability = clamp(settings.heartRateVariabilityPct / 100, 0, 0.35);
  const hrNoiseAmp = 0.4 + hrVariability * 3;
  const hrAdaptation = 0.12 + (1 - smoothness) * 0.16;

  for (let i = 0; i < sampledCoordinates.length; i += 1) {
    const coordinate = sampledCoordinates[i];
    const [jitteredLng, jitteredLat] = withGpsJitter(coordinate, clamp(settings.gpsJitterMeters, 0, 10));
    const currentElevation = noisyElevation[i];

    if (i > 0) {
      const stepDistanceM = toMeters(sampledCoordinates[i - 1], sampledCoordinates[i]);
      const stepSpeedMps = sampledSpeedsMps[i];
      const stepPace = stepSpeedMps > 0.2 ? 1000 / (stepSpeedMps * 60) : safePace * 1.55;
      const effortLoad = clamp((safePace - stepPace) / safePace + 0.34, 0, 1);
      const grade = (currentElevation - noisyElevation[i - 1]) / Math.max(stepDistanceM, 1);
      const climbingLoad = clamp(Math.max(grade, 0) * 6.2, 0, 1);
      const speedDrift = clamp((stepSpeedMps - targetBaseSpeedMps) / Math.max(targetBaseSpeedMps, 0.8), -0.2, 0.42);
      const targetHr =
        122 +
        effortLoad * 20 +
        climbingLoad * 12 +
        speedDrift * 5 +
        randomBetween(-hrNoiseAmp, hrNoiseAmp);
      currentHeartRate = clamp(currentHeartRate + (targetHr - currentHeartRate) * hrAdaptation, 105, 178);
    }

    output.push({
      lat: jitteredLat,
      lng: jitteredLng,
      ele: currentElevation,
      time: sampledTimes[i],
      hr: settings.includeHeartRate ? currentHeartRate : null,
    });
  }

  return output;
}
