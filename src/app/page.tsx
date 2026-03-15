"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { generateGpx } from "@/lib/gpx-generator";
import { snapRouteToRoads } from "@/lib/osm-matching";
import { computeRouteDistanceKm, simulateTrackPoints, type ActivityType, type LngLatTuple } from "@/lib/route-simulation";

const MapContainer = dynamic(() => import("@/components/MapContainer").then((module) => module.MapContainer), {
  ssr: false,
});

function toDatetimeLocalValue(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function Home() {
  const [activityType, setActivityType] = useState<ActivityType>("run");
  const [averagePace, setAveragePace] = useState(5.4);
  const [startDateTime, setStartDateTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [rawRoute, setRawRoute] = useState<LngLatTuple[]>([]);
  const [snappedRoute, setSnappedRoute] = useState<LngLatTuple[]>([]);
  const [useSnappedRoute, setUseSnappedRoute] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [drawTrigger, setDrawTrigger] = useState(0);
  const [userLocation, setUserLocation] = useState<LngLatTuple | null>(null);
  const [statusMessage, setStatusMessage] = useState("Draw a route to get started.");

  const activeRoute = useMemo(
    () => (useSnappedRoute && snappedRoute.length > 1 ? snappedRoute : rawRoute),
    [rawRoute, snappedRoute, useSnappedRoute],
  );

  const routeDistanceKm = useMemo(() => computeRouteDistanceKm(activeRoute), [activeRoute]);
  const canSnap = rawRoute.length > 1 && !isSnapping;
  const canDownload = activeRoute.length > 1;

  const handleRouteChange = useCallback((nextRoute: LngLatTuple[]) => {
    setRawRoute(nextRoute);
    setSnappedRoute([]);
    setUseSnappedRoute(false);
    if (nextRoute.length > 1) {
      setStatusMessage(`Route drawn with ${nextRoute.length} points.`);
    } else {
      setStatusMessage("Draw a route to get started.");
    }
  }, []);

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
      setStatusMessage(`Route snapped successfully (${snapped.length} matched points).`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown map matching error.";
      setStatusMessage(`Snap failed: ${reason}`);
    } finally {
      setIsSnapping(false);
    }
  }, [activityType, canSnap, rawRoute]);

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
        setStatusMessage("Centered map on your current location.");
        setIsLocating(false);
      },
      (error) => {
        setStatusMessage(`Could not get location: ${error.message}`);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  }, []);

  const handleDownload = () => {
    if (!canDownload) return;

    const parsedStart = new Date(startDateTime);
    const startTime = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
    const simulated = simulateTrackPoints({
      coordinates: activeRoute,
      averagePaceMinPerKm: averagePace,
      startTime,
      activityType,
    });

    const gpx = generateGpx(
      simulated.map((point) => [point.lat, point.lng, point.ele, point.time, point.hr]),
      {
        name: `Simulated ${activityType} ${startTime.toLocaleString()}`,
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

    setStatusMessage(`Downloaded GPX (${simulated.length} track points exported).`);
  };

  return (
    <main className="min-h-screen p-3 sm:p-5">
      <div className="mx-auto grid h-[calc(100vh-1.5rem)] max-w-[1520px] grid-cols-1 gap-3 lg:grid-cols-[360px_1fr] lg:gap-4">
        <Sidebar
          activityType={activityType}
          averagePace={averagePace}
          startDateTime={startDateTime}
          routeDistanceKm={routeDistanceKm}
          pointCount={activeRoute.length}
          hasSnappedRoute={snappedRoute.length > 1}
          useSnappedRoute={useSnappedRoute}
          canSnap={canSnap}
          canDownload={canDownload}
          isSnapping={isSnapping}
          isLocating={isLocating}
          statusMessage={statusMessage}
          onActivityTypeChange={setActivityType}
          onAveragePaceChange={(value) => setAveragePace(Number.isFinite(value) ? value : 5.4)}
          onStartDateTimeChange={setStartDateTime}
          onUseSnappedRouteChange={setUseSnappedRoute}
          onDrawRoute={() => setDrawTrigger((value) => value + 1)}
          onLocateMe={handleLocateMe}
          onSnapRoute={handleSnapRoute}
          onDownload={handleDownload}
        />

        <MapContainer
          rawCoordinates={rawRoute}
          snappedCoordinates={snappedRoute}
          drawTrigger={drawTrigger}
          userLocation={userLocation}
          onRouteChange={handleRouteChange}
        />
      </div>
    </main>
  );
}
