"use client";

import { Bike, CalendarClock, Download, Footprints, Gauge, LocateFixed, Route, Shuffle } from "lucide-react";
import type { ActivityType } from "@/lib/route-simulation";

interface SidebarProps {
  activityType: ActivityType;
  averagePace: number;
  startDateTime: string;
  routeDistanceKm: number;
  pointCount: number;
  hasSnappedRoute: boolean;
  useSnappedRoute: boolean;
  canSnap: boolean;
  canDownload: boolean;
  isSnapping: boolean;
  isLocating: boolean;
  statusMessage: string;
  onActivityTypeChange: (value: ActivityType) => void;
  onAveragePaceChange: (value: number) => void;
  onStartDateTimeChange: (value: string) => void;
  onUseSnappedRouteChange: (value: boolean) => void;
  onDrawRoute: () => void;
  onLocateMe: () => void;
  onSnapRoute: () => void;
  onDownload: () => void;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  run: "Run",
  walk: "Walk",
  cycle: "Cycle",
};

export function Sidebar({
  activityType,
  averagePace,
  startDateTime,
  routeDistanceKm,
  pointCount,
  hasSnappedRoute,
  useSnappedRoute,
  canSnap,
  canDownload,
  isSnapping,
  isLocating,
  statusMessage,
  onActivityTypeChange,
  onAveragePaceChange,
  onStartDateTimeChange,
  onUseSnappedRouteChange,
  onDrawRoute,
  onLocateMe,
  onSnapRoute,
  onDownload,
}: SidebarProps) {
  return (
    <aside className="h-full rounded-2xl border border-white/15 bg-[var(--panel)] p-5 backdrop-blur-xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-white">Route Forge GPX</h1>
        <p className="mt-1 text-sm text-slate-300">
          Draw, snap, simulate realistic telemetry, then export a GPX file.
        </p>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={onDrawRoute}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/70 bg-[var(--accent)]/15 px-3 py-2 text-sm font-medium text-[var(--accent-soft)] transition hover:bg-[var(--accent)]/25"
        >
          <Route className="h-4 w-4" />
          Draw Route
        </button>

        <button
          type="button"
          disabled={isLocating}
          onClick={onLocateMe}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LocateFixed className="h-4 w-4" />
          {isLocating ? "Locating..." : "Find My Location"}
        </button>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">Activity Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onActivityTypeChange(type)}
                className={`rounded-lg px-2 py-2 text-sm transition ${
                  activityType === type
                    ? "bg-white/20 text-white"
                    : "border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {type === "cycle" ? <Bike className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}
                  {ACTIVITY_LABELS[type]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">Average Pace (min/km)</label>
          <div className="relative">
            <Gauge className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="number"
              min={2}
              max={20}
              step={0.1}
              value={averagePace}
              onChange={(event) => onAveragePaceChange(Number(event.target.value))}
              className="w-full rounded-lg border border-white/20 bg-black/25 py-2 pl-9 pr-3 text-sm text-white outline-none ring-[var(--accent)]/60 transition focus:ring"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-slate-300">Start Date & Time</label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(event) => onStartDateTimeChange(event.target.value)}
              className="w-full rounded-lg border border-white/20 bg-black/25 py-2 pl-9 pr-3 text-sm text-white outline-none ring-[var(--accent)]/60 transition focus:ring"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canSnap || isSnapping}
          onClick={onSnapRoute}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition enabled:hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Shuffle className="h-4 w-4" />
          {isSnapping ? "Snapping..." : "Snap To Roads"}
        </button>

        {hasSnappedRoute ? (
          <label className="flex items-center justify-between rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm text-slate-200">
            Use Snapped Route
            <input
              type="checkbox"
              checked={useSnappedRoute}
              onChange={(event) => onUseSnappedRouteChange(event.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
          </label>
        ) : null}

        <button
          type="button"
          disabled={!canDownload}
          onClick={onDownload}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black transition enabled:hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-4 w-4" />
          Download GPX
        </button>
      </div>

      <div className="mt-5 space-y-2 rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-slate-300">
        <p>
          Distance: <span className="font-medium text-white">{routeDistanceKm.toFixed(2)} km</span>
        </p>
        <p>
          Points: <span className="font-medium text-white">{pointCount}</span>
        </p>
        <p className="text-xs text-slate-400">{statusMessage}</p>
      </div>
    </aside>
  );
}
