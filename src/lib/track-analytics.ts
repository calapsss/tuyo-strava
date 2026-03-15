import { distance as turfDistance, point } from "@turf/turf";
import type { SimulatedTrackPoint } from "@/lib/route-simulation";

export interface TrackStats {
  distanceKm: number;
  durationSec: number;
  elevationGainM: number;
  averagePaceMinPerKm: number;
  averageHeartRate: number | null;
  trackPoints: number;
}

export interface ChartPoint {
  distanceKm: number;
  paceMinPerKm: number;
  elevationM: number;
  heartRate: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0) return [];
  const smoothed: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(values.length - 1, i + windowSize); j += 1) {
      sum += values[j];
      count += 1;
    }
    smoothed.push(sum / Math.max(count, 1));
  }

  return smoothed;
}

function downsample<T>(values: T[], maxPoints = 260): T[] {
  if (values.length <= maxPoints) return values;
  const stride = Math.ceil(values.length / maxPoints);
  return values.filter((_, index) => index % stride === 0 || index === values.length - 1);
}

export function analyzeTrack(track: SimulatedTrackPoint[]): { stats: TrackStats; chart: ChartPoint[] } {
  if (track.length < 2) {
    return {
      stats: {
        distanceKm: 0,
        durationSec: 0,
        elevationGainM: 0,
        averagePaceMinPerKm: 0,
        averageHeartRate: null,
        trackPoints: track.length,
      },
      chart: [],
    };
  }

  const cumulativeDistanceKm: number[] = [0];
  const cumulativeTimeSec: number[] = [0];
  let totalDistanceKm = 0;
  let elevationGain = 0;
  const hrValues: number[] = [];

  for (let i = 1; i < track.length; i += 1) {
    const previous = track[i - 1];
    const current = track[i];
    const segmentDistanceKm = turfDistance(point([previous.lng, previous.lat]), point([current.lng, current.lat]), {
      units: "kilometers",
    });
    totalDistanceKm += segmentDistanceKm;
    cumulativeDistanceKm.push(totalDistanceKm);

    const deltaSec = Math.max(1, (current.time.getTime() - previous.time.getTime()) / 1000);
    cumulativeTimeSec.push(cumulativeTimeSec[cumulativeTimeSec.length - 1] + deltaSec);

    const eleDelta = current.ele - previous.ele;
    if (eleDelta > 0) {
      elevationGain += eleDelta;
    }

    if (typeof current.hr === "number") {
      hrValues.push(current.hr);
    }
  }

  const rollingWindowSec = 18;
  const rawPace: number[] = new Array(track.length).fill(0);
  let left = 0;
  for (let i = 1; i < track.length; i += 1) {
    while (left < i - 1 && cumulativeTimeSec[i] - cumulativeTimeSec[left] > rollingWindowSec) {
      left += 1;
    }

    const windowDistanceKm = Math.max(cumulativeDistanceKm[i] - cumulativeDistanceKm[left], 1e-5);
    const windowDurationSec = Math.max(cumulativeTimeSec[i] - cumulativeTimeSec[left], 1);
    rawPace[i] = clamp((windowDurationSec / 60) / windowDistanceKm, 2.5, 28);
  }

  if (rawPace.length > 1) {
    rawPace[0] = rawPace[1];
  }

  const smoothPace = movingAverage(rawPace, 4);
  const smoothEle = movingAverage(track.map((pointItem) => pointItem.ele), 8);
  const smoothHrRaw = movingAverage(track.map((pointItem) => pointItem.hr ?? 0), 10);
  const hasHr = hrValues.length > 0;

  const chart: ChartPoint[] = downsample(
    track.map((pointItem, index) => ({
      distanceKm: cumulativeDistanceKm[index],
      paceMinPerKm: smoothPace[index],
      elevationM: smoothEle[index],
      heartRate: hasHr ? smoothHrRaw[index] : null,
    })),
  );

  const durationSec = Math.max(1, (track[track.length - 1].time.getTime() - track[0].time.getTime()) / 1000);
  const averagePaceMinPerKm = totalDistanceKm > 0 ? (durationSec / 60) / totalDistanceKm : 0;

  return {
    stats: {
      distanceKm: totalDistanceKm,
      durationSec,
      elevationGainM: elevationGain,
      averagePaceMinPerKm,
      averageHeartRate: hasHr ? hrValues.reduce((sum, value) => sum + value, 0) / hrValues.length : null,
      trackPoints: track.length,
    },
    chart,
  };
}
