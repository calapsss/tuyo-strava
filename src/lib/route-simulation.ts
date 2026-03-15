import { distance as turfDistance, lineString, length as turfLength, point } from "@turf/turf";

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

const GPS_NOISE = 0.000005;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function defaultHeartRate(activityType: ActivityType): number {
  if (activityType === "walk") return 132;
  if (activityType === "cycle") return 138;
  return 142;
}

function paceIntensity(paceMinPerKm: number): number {
  return clamp((9 - paceMinPerKm) / 5, 0, 1);
}

export function computeRouteDistanceKm(coordinates: LngLatTuple[]): number {
  if (coordinates.length < 2) return 0;
  return turfLength(lineString(coordinates), { units: "kilometers" });
}

export function simulateTrackPoints({
  coordinates,
  averagePaceMinPerKm,
  startTime,
  activityType,
}: SimulationOptions): SimulatedTrackPoint[] {
  if (coordinates.length === 0) return [];

  const safePace = clamp(averagePaceMinPerKm, 2, 20);
  const simulated: SimulatedTrackPoint[] = [];
  let currentTimeMs = startTime.getTime();
  let currentElevation = randomBetween(12, 40);
  let currentHeartRate = defaultHeartRate(activityType);

  for (let i = 0; i < coordinates.length; i += 1) {
    const [rawLng, rawLat] = coordinates[i];
    let segmentElevationDelta = 0;

    if (i > 0) {
      const previousPoint = coordinates[i - 1];
      const currentPoint = coordinates[i];
      const segmentDistanceKm = turfDistance(point(previousPoint), point(currentPoint), {
        units: "kilometers",
      });
      const segmentDistanceM = segmentDistanceKm * 1000;

      const jitteredPace = safePace * (1 + randomBetween(-0.03, 0.03));
      currentTimeMs += segmentDistanceKm * jitteredPace * 60 * 1000;

      const progress = i / Math.max(coordinates.length - 1, 1);
      const hillWave = Math.sin(progress * Math.PI * 3) * 0.014;
      const hillNoise = randomBetween(-0.006, 0.006);
      const grade = clamp(hillWave + hillNoise, -0.04, 0.06);
      segmentElevationDelta = clamp(segmentDistanceM * grade, -7, 9);
      currentElevation = Math.max(0, currentElevation + segmentElevationDelta);

      const hrTarget =
        130 +
        paceIntensity(jitteredPace) * 26 +
        clamp(Math.max(segmentElevationDelta, 0) / 4, 0, 1) * 14 +
        randomBetween(-2, 2);
      currentHeartRate = clamp(currentHeartRate + (hrTarget - currentHeartRate) * 0.35, 130, 170);
    }

    const noisyLng = clamp(rawLng + randomBetween(-GPS_NOISE, GPS_NOISE), -180, 180);
    const noisyLat = clamp(rawLat + randomBetween(-GPS_NOISE, GPS_NOISE), -90, 90);

    simulated.push({
      lat: noisyLat,
      lng: noisyLng,
      ele: currentElevation,
      time: new Date(currentTimeMs),
      hr: currentHeartRate,
    });

    if (segmentElevationDelta < -4) {
      currentHeartRate = clamp(currentHeartRate - 0.8, 130, 170);
    }
  }

  return simulated;
}
