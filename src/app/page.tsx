"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import { Bell, ChevronDown, CirclePlus, Crosshair, LocateFixed, Search, Shuffle } from "lucide-react";
import { LineChartCard } from "@/components/LineChartCard";
import { Sidebar } from "@/components/Sidebar";
import { generateGpx } from "@/lib/gpx-generator";
import { snapRouteToRoads } from "@/lib/osm-matching";
import {
  computeRouteDistanceKm,
  DEFAULT_REALISM_SETTINGS,
  simulateTrackPoints,
  type ActivityType,
  type LngLatTuple,
  type RealismSettings,
  type SimulatedTrackPoint,
} from "@/lib/route-simulation";
import { analyzeTrack, type ChartPoint, type TrackStats } from "@/lib/track-analytics";

const MapContainer = dynamic(() => import("@/components/MapContainer").then((module) => module.MapContainer), {
  ssr: false,
});

function toDatetimeLocalValue(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function previewKeyFor({
  route,
  activityType,
  averagePace,
  startDateTime,
  realism,
  runName,
  description,
}: {
  route: LngLatTuple[];
  activityType: ActivityType;
  averagePace: number;
  startDateTime: string;
  realism: RealismSettings;
  runName: string;
  description: string;
}): string {
  const first = route[0];
  const last = route[route.length - 1];
  return JSON.stringify({
    activityType,
    averagePace: Number(averagePace.toFixed(3)),
    startDateTime,
    realism,
    runName,
    description,
    signature: route.length
      ? `${route.length}:${first[0].toFixed(6)},${first[1].toFixed(6)}:${last[0].toFixed(6)},${last[1].toFixed(6)}`
      : "none",
  });
}

export default function Home() {
  const [activityType, setActivityType] = useState<ActivityType>("run");
  const [averagePace, setAveragePace] = useState(5.5);
  const [startDateTime, setStartDateTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [runName, setRunName] = useState("Morning Run");
  const [description, setDescription] = useState("Great morning run through the park.");
  const [realism, setRealism] = useState<RealismSettings>(DEFAULT_REALISM_SETTINGS);

  const [rawRoute, setRawRoute] = useState<LngLatTuple[]>([]);
  const [snappedRoute, setSnappedRoute] = useState<LngLatTuple[]>([]);
  const [useSnappedRoute, setUseSnappedRoute] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [drawTrigger, setDrawTrigger] = useState(0);
  const [userLocation, setUserLocation] = useState<LngLatTuple | null>(null);
  const [statusMessage, setStatusMessage] = useState("Draw your route, then generate realism preview.");

  const [previewTrack, setPreviewTrack] = useState<SimulatedTrackPoint[] | null>(null);
  const [previewStats, setPreviewStats] = useState<TrackStats | null>(null);
  const [previewChart, setPreviewChart] = useState<ChartPoint[]>([]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const activeRoute = useMemo(
    () => (useSnappedRoute && snappedRoute.length > 1 ? snappedRoute : rawRoute),
    [rawRoute, snappedRoute, useSnappedRoute],
  );
  const routeDistanceKm = useMemo(() => computeRouteDistanceKm(activeRoute), [activeRoute]);

  const currentPreviewKey = useMemo(
    () =>
      previewKeyFor({
        route: activeRoute,
        activityType,
        averagePace,
        startDateTime,
        realism,
        runName,
        description,
      }),
    [activeRoute, activityType, averagePace, startDateTime, realism, runName, description],
  );
  const hasFreshPreview = Boolean(previewTrack && previewKey === currentPreviewKey);

  const canSnap = rawRoute.length > 1 && !isSnapping;
  const canGeneratePreview = activeRoute.length > 1 && !isGeneratingPreview && !isSnapping;
  const canDownload = hasFreshPreview && !isDownloading;

  const invalidatePreview = useCallback(() => {
    setPreviewTrack(null);
    setPreviewStats(null);
    setPreviewChart([]);
    setPreviewKey(null);
  }, []);

  const handleRouteChange = useCallback(
    (nextRoute: LngLatTuple[]) => {
      setRawRoute(nextRoute);
      setSnappedRoute([]);
      setUseSnappedRoute(false);
      invalidatePreview();
      if (nextRoute.length > 1) {
        setStatusMessage(`Route updated with ${nextRoute.length} points.`);
      } else {
        setStatusMessage("Draw your route, then generate realism preview.");
      }
    },
    [invalidatePreview],
  );

  const handleActivityTypeChange = useCallback(
    (value: ActivityType) => {
      setActivityType(value);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleAveragePaceChange = useCallback(
    (value: number) => {
      setAveragePace(Number.isFinite(value) ? value : 5.5);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleStartDateTimeChange = useCallback(
    (value: string) => {
      setStartDateTime(value);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleRunNameChange = useCallback(
    (value: string) => {
      setRunName(value);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleRealismChange = useCallback(
    (patch: Partial<RealismSettings>) => {
      setRealism((previous) => ({ ...previous, ...patch }));
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleUseSnappedRouteChange = useCallback(
    (value: boolean) => {
      setUseSnappedRoute(value);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleSnapRoute = useCallback(async () => {
    if (!canSnap) return;

    try {
      setIsSnapping(true);
      setStatusMessage("Snapping route to roads...");
      const snapped = await snapRouteToRoads({
        coordinates: rawRoute,
        activityType,
      });
      setSnappedRoute(snapped);
      setUseSnappedRoute(true);
      invalidatePreview();
      setStatusMessage(`Route aligned to OSM roads (${snapped.length} points).`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown map matching error.";
      setStatusMessage(`Snap failed: ${reason}`);
    } finally {
      setIsSnapping(false);
    }
  }, [activityType, canSnap, invalidatePreview, rawRoute]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setStatusMessage("Geolocation is not supported by this browser.");
      return;
    }

    setIsLocating(true);
    setStatusMessage("Finding your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.longitude, position.coords.latitude]);
        setStatusMessage("Map centered on your location.");
        setIsLocating(false);
      },
      (error) => {
        setStatusMessage(`Could not get location: ${error.message}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const handleGeneratePreview = useCallback(async () => {
    if (!canGeneratePreview) return;

    try {
      setIsGeneratingPreview(true);
      if (useSnappedRoute && snappedRoute.length < 2) {
        setStatusMessage("Snapped route is selected, but none exists yet. Click Align Path To Road first.");
        return;
      }

      const previewRoute = useSnappedRoute ? snappedRoute : rawRoute;
      setStatusMessage(
        useSnappedRoute
          ? "Generating telemetry preview using snapped road geometry..."
          : "Generating telemetry preview using your original private path...",
      );
      const parsedStart = new Date(startDateTime);
      const startTime = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;

      const simulated = await simulateTrackPoints({
        coordinates: previewRoute,
        averagePaceMinPerKm: averagePace,
        startTime,
        activityType,
        realism,
      });

      if (simulated.length < 2) {
        setStatusMessage("Preview failed: route is too short or invalid.");
        return;
      }

      const analytics = analyzeTrack(simulated);
      setPreviewTrack(simulated);
      setPreviewStats(analytics.stats);
      setPreviewChart(analytics.chart);
      setPreviewKey(
        previewKeyFor({
          route: previewRoute,
          activityType,
          averagePace,
          startDateTime,
          realism,
          runName,
          description,
        }),
      );
      setStatusMessage(
        `Preview generated: ${analytics.stats.trackPoints} points, ${formatDuration(analytics.stats.durationSec)} duration.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown preview error.";
      setStatusMessage(`Preview failed: ${reason}`);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [
    activityType,
    averagePace,
    canGeneratePreview,
    description,
    realism,
    rawRoute,
    runName,
    snappedRoute,
    startDateTime,
    useSnappedRoute,
  ]);

  const handleDownload = useCallback(() => {
    if (!canDownload || !previewTrack || !hasFreshPreview) {
      setStatusMessage("Generate an up-to-date preview before downloading.");
      return;
    }

    try {
      setIsDownloading(true);
      const parsedStart = new Date(startDateTime);
      const startTime = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
      const gpx = generateGpx(
        previewTrack.map((pointItem) => [pointItem.lat, pointItem.lng, pointItem.ele, pointItem.time, pointItem.hr]),
        {
          name: runName || `Simulated ${activityType} ${startTime.toLocaleString()}`,
          activityType,
        },
      );

      const blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const dateLabel = startTime.toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `${activityType}-${dateLabel}.gpx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Downloaded GPX with ${previewTrack.length} timestamped points.`);
    } finally {
      setIsDownloading(false);
    }
  }, [activityType, canDownload, hasFreshPreview, previewTrack, runName, startDateTime]);

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-7">
            <Image
              src="/tuyo.png"
              alt="TUYO"
              width={240}
              height={80}
              className="h-7 w-auto"
              priority
            />
            {/* <nav className="hidden items-center gap-6 text-[15px] text-slate-700 md:flex">
              <button type="button" className="inline-flex items-center gap-1.5 hover:text-slate-900">
                Dashboard
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex h-16 items-center border-b-2 border-[#fc5200] font-semibold text-slate-900"
              >
                Training
              </button>
              <button type="button" className="hover:text-slate-900">
                Maps
              </button>
              <button type="button" className="hover:text-slate-900">
                Challenges
              </button>
            </nav> */}
          </div>

          {/* <div className="flex items-center gap-4">
            <button
              type="button"
              className="hidden rounded-md bg-[#fc5200] px-4 py-2 text-sm font-semibold text-white sm:inline-flex"
            >
              Start Trial
            </button>
            <Bell className="hidden h-5 w-5 text-slate-500 sm:block" />
            <div className="hidden h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-xs font-semibold text-white sm:flex">
              U
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
            <CirclePlus className="h-5 w-5 text-[#fc5200]" />
          </div> */}
        </div>
      </header>

      <main className="px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-[1500px]">
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-slate-900">Compliance tumakbo? Tuyo.</h1>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-[#f8f8f8] p-4">
                <h2 className="text-2xl font-semibold">Draw Your Route</h2>
                <p className="mt-1 text-sm text-slate-600">Search for a location and click on the map to create your route.</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search for a location..."
                    className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none"
                    disabled
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDrawTrigger((value) => value + 1)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#ff5b14] px-3 py-2 text-sm font-medium text-white"
                >
                  <Crosshair className="h-4 w-4" />
                  Draw
                </button>
                <button
                  type="button"
                  onClick={handleLocateMe}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <LocateFixed className="h-4 w-4" />
                  Locate
                </button>
                <button
                  type="button"
                  onClick={handleSnapRoute}
                  disabled={!canSnap || isSnapping}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Shuffle className="h-4 w-4" />
                  {isSnapping ? "Snapping..." : "Align Path To Road"}
                </button>
              </div>

              <div className="mt-3 h-[500px]">
                <MapContainer
                  rawCoordinates={rawRoute}
                  snappedCoordinates={snappedRoute}
                  drawTrigger={drawTrigger}
                  userLocation={userLocation}
                  onRouteChange={handleRouteChange}
                />
              </div>

              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                {hasFreshPreview
                  ? "Preview is ready. Tune sliders on the right and regenerate if needed."
                  : "Preview not generated or out of date. Click Generate Realism Preview before downloading."}
              </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#f8f8f8] p-4">
                <h2 className="mb-3 text-2xl font-semibold">Data Visualization</h2>

              <div className="space-y-3">
                <LineChartCard
                  title="Pace Profile"
                  summary={
                    previewStats ? `Average: ${previewStats.averagePaceMinPerKm.toFixed(2)} min/km` : "Average: --"
                  }
                  unit="min/km"
                  values={previewChart.map((pointItem) => ({ x: pointItem.distanceKm, y: pointItem.paceMinPerKm }))}
                />
                <LineChartCard
                  title="Elevation Profile"
                  summary={
                    previewStats ? `Total Gain: ${Math.round(previewStats.elevationGainM)} m` : "Total Gain: --"
                  }
                  unit="m"
                  values={previewChart.map((pointItem) => ({ x: pointItem.distanceKm, y: pointItem.elevationM }))}
                />
                <LineChartCard
                  title="Heart Rate Profile"
                  summary={
                    previewStats?.averageHeartRate
                      ? `Average: ${Math.round(previewStats.averageHeartRate)} bpm`
                      : "Average: --"
                  }
                  unit="bpm"
                  values={previewChart
                    .filter((pointItem) => typeof pointItem.heartRate === "number")
                    .map((pointItem) => ({ x: pointItem.distanceKm, y: pointItem.heartRate ?? 0 }))}
                />
              </div>
              </div>
            </section>

            <Sidebar
              activityType={activityType}
              averagePace={averagePace}
              startDateTime={startDateTime}
              runName={runName}
              description={description}
              realism={realism}
              stats={previewStats}
              routeDistanceKm={routeDistanceKm}
              pointCount={activeRoute.length}
              hasSnappedRoute={snappedRoute.length > 1}
              useSnappedRoute={useSnappedRoute}
              hasFreshPreview={hasFreshPreview}
              canSnap={canSnap}
              canGeneratePreview={canGeneratePreview}
              canDownload={canDownload}
              isSnapping={isSnapping}
              isGeneratingPreview={isGeneratingPreview}
              isDownloading={isDownloading}
              isLocating={isLocating}
              statusMessage={statusMessage}
              onActivityTypeChange={handleActivityTypeChange}
              onAveragePaceChange={handleAveragePaceChange}
              onStartDateTimeChange={handleStartDateTimeChange}
              onRunNameChange={handleRunNameChange}
              onDescriptionChange={handleDescriptionChange}
              onRealismChange={handleRealismChange}
              onUseSnappedRouteChange={handleUseSnappedRouteChange}
              onDrawRoute={() => setDrawTrigger((value) => value + 1)}
              onLocateMe={handleLocateMe}
              onSnapRoute={handleSnapRoute}
              onGeneratePreview={handleGeneratePreview}
              onDownload={handleDownload}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
