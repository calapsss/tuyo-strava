"use client";

import {
  Activity,
  Bike,
  CalendarClock,
  Clock3,
  Download,
  Gauge,
  HeartPulse,
  LocateFixed,
  Mountain,
  Repeat2,
  Route,
  Shuffle,
} from "lucide-react";
import type { ComponentType } from "react";
import type { ActivityType, RealismSettings } from "@/lib/route-simulation";
import type { LoopMode } from "@/lib/route-loops";
import type { TrackStats } from "@/lib/track-analytics";

interface SidebarProps {
  activityType: ActivityType;
  averagePace: number;
  startDateTime: string;
  runName: string;
  description: string;
  loopCount: number;
  loopMode: LoopMode;
  realism: RealismSettings;
  stats: TrackStats | null;
  routeDistanceKm: number;
  pointCount: number;
  hasSnappedRoute: boolean;
  useSnappedRoute: boolean;
  hasFreshPreview: boolean;
  canSnap: boolean;
  canGeneratePreview: boolean;
  canDownload: boolean;
  isSnapping: boolean;
  isGeneratingPreview: boolean;
  isDownloading: boolean;
  isLocating: boolean;
  statusMessage: string;
  onActivityTypeChange: (value: ActivityType) => void;
  onAveragePaceChange: (value: number) => void;
  onStartDateTimeChange: (value: string) => void;
  onRunNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onLoopCountChange: (value: number) => void;
  onLoopModeChange: (value: LoopMode) => void;
  onRealismChange: (patch: Partial<RealismSettings>) => void;
  onUseSnappedRouteChange: (value: boolean) => void;
  onDrawRoute: () => void;
  onLocateMe: () => void;
  onSnapRoute: () => void;
  onGeneratePreview: () => void;
  onDownload: () => void;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#ff5b14]" />
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function RangeRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="font-medium text-[#ff5b14]">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#ff5b14]"
      />
    </div>
  );
}

export function Sidebar({
  activityType,
  averagePace,
  startDateTime,
  runName,
  description,
  loopCount,
  loopMode,
  realism,
  stats,
  routeDistanceKm,
  pointCount,
  hasSnappedRoute,
  useSnappedRoute,
  hasFreshPreview,
  canSnap,
  canGeneratePreview,
  canDownload,
  isSnapping,
  isGeneratingPreview,
  isDownloading,
  isLocating,
  statusMessage,
  onActivityTypeChange,
  onAveragePaceChange,
  onStartDateTimeChange,
  onRunNameChange,
  onDescriptionChange,
  onLoopCountChange,
  onLoopModeChange,
  onRealismChange,
  onUseSnappedRouteChange,
  onDrawRoute,
  onLocateMe,
  onSnapRoute,
  onGeneratePreview,
  onDownload,
}: SidebarProps) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-[#f8f8f8] p-4 lg:sticky lg:top-4 lg:h-fit">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Run Details</h2>
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs">
          <button
            type="button"
            onClick={() => onActivityTypeChange("run")}
            className={`rounded-full px-2 py-1 ${activityType === "run" ? "bg-[#ff5b14] text-white" : "text-slate-500"}`}
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => onActivityTypeChange("cycle")}
            className={`rounded-full px-2 py-1 ${activityType === "cycle" ? "bg-[#ff5b14] text-white" : "text-slate-500"}`}
          >
            Bike
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Metric
          label="Distance"
          value={`${(stats?.distanceKm ?? routeDistanceKm).toFixed(2)} km`}
          icon={Route}
        />
        <Metric label="Duration" value={formatDuration(stats?.durationSec ?? 0)} icon={Clock3} />
        <Metric label="Elevation Gain" value={`${Math.round(stats?.elevationGainM ?? 0)} m`} icon={Mountain} />
        <Metric
          label="Pace"
          value={`${(stats?.averagePaceMinPerKm ?? averagePace).toFixed(2)} min/km`}
          icon={Gauge}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
        <button
          type="button"
          onClick={onDrawRoute}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[#ff5b14]/40 bg-[#ff5b14]/10 px-3 py-2 text-sm font-medium text-[#ff5b14]"
        >
          <Route className="h-4 w-4" />
          Draw Route
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isLocating}
            onClick={onLocateMe}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            <LocateFixed className="h-4 w-4" />
            {isLocating ? "Locating..." : "Locate Me"}
          </button>
          <button
            type="button"
            disabled={!canSnap || isSnapping}
            onClick={onSnapRoute}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            <Shuffle className="h-4 w-4" />
            {isSnapping ? "Snapping..." : "Align Path"}
          </button>
        </div>

        {hasSnappedRoute ? (
          <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Use Snapped Geometry
            <input
              type="checkbox"
              checked={useSnappedRoute}
              onChange={(event) => onUseSnappedRouteChange(event.target.checked)}
              className="h-4 w-4 accent-[#ff5b14]"
            />
          </label>
        ) : null}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-[#ff5b14]" />
            <p className="text-sm font-medium text-slate-700">Loops</p>
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <select
              value={loopMode}
              onChange={(event) => onLoopModeChange(event.target.value as LoopMode)}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
            >
              <option value="auto">Auto (best fit)</option>
              <option value="repeat">Repeat Circuit</option>
              <option value="out-and-back">Out & Back</option>
            </select>
            <input
              type="number"
              min={1}
              max={20}
              value={loopCount}
              onChange={(event) => onLoopCountChange(Number(event.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Increase laps to repeat this route on the same road before preview/export.
          </p>
        </div>

        <RangeRow
          label="Average Pace (min/km)"
          valueLabel={`${averagePace.toFixed(2)} min/km`}
          min={2.8}
          max={9}
          step={0.05}
          value={averagePace}
          onChange={onAveragePaceChange}
        />
        <RangeRow
          label="Pace Inconsistency"
          valueLabel={`${realism.paceInconsistencyPct.toFixed(0)}%`}
          min={0}
          max={20}
          step={1}
          value={realism.paceInconsistencyPct}
          onChange={(value) => onRealismChange({ paceInconsistencyPct: value })}
        />
        <RangeRow
          label="GPS Jitter"
          valueLabel={`${realism.gpsJitterMeters.toFixed(1)} m`}
          min={0}
          max={8}
          step={0.1}
          value={realism.gpsJitterMeters}
          onChange={(value) => onRealismChange({ gpsJitterMeters: value })}
        />
        <RangeRow
          label="Elevation Noise"
          valueLabel={`${realism.elevationNoiseMeters.toFixed(1)} m`}
          min={0}
          max={6}
          step={0.1}
          value={realism.elevationNoiseMeters}
          onChange={(value) => onRealismChange({ elevationNoiseMeters: value })}
        />
        <RangeRow
          label="Heart Rate Variability"
          valueLabel={`${realism.heartRateVariabilityPct.toFixed(0)}%`}
          min={0}
          max={30}
          step={1}
          value={realism.heartRateVariabilityPct}
          onChange={(value) => onRealismChange({ heartRateVariabilityPct: value })}
        />
        <RangeRow
          label="Signal Smoothness"
          valueLabel={`${realism.smoothnessPct.toFixed(0)}%`}
          min={20}
          max={95}
          step={1}
          value={realism.smoothnessPct}
          onChange={(value) => onRealismChange({ smoothnessPct: value })}
        />
        <RangeRow
          label="Sample Interval"
          valueLabel={`${realism.samplingIntervalSec.toFixed(0)}s`}
          min={1}
          max={3}
          step={1}
          value={realism.samplingIntervalSec}
          onChange={(value) => onRealismChange({ samplingIntervalSec: value })}
        />

        <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Include Heart Rate Data
          <input
            type="checkbox"
            checked={realism.includeHeartRate}
            onChange={(event) => onRealismChange({ includeHeartRate: event.target.checked })}
            className="h-4 w-4 accent-[#ff5b14]"
          />
        </label>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Run Name</label>
          <input
            type="text"
            value={runName}
            onChange={(event) => onRunNameChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Date & Time</label>
          <div className="relative">
            <CalendarClock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="datetime-local"
              value={startDateTime}
              onChange={(event) => onStartDateTimeChange(event.target.value)}
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none ring-[#ff5b14] focus:ring"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
          <textarea
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
          />
        </div>

        <button
          type="button"
          disabled={!canGeneratePreview || isGeneratingPreview}
          onClick={onGeneratePreview}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[#ff5b14] bg-white px-3 py-2 text-sm font-semibold text-[#ff5b14] disabled:opacity-50"
        >
          <Activity className="h-4 w-4" />
          {isGeneratingPreview ? "Generating Preview..." : "Generate Realism Preview"}
        </button>

        <button
          type="button"
          disabled={!canDownload || isDownloading}
          onClick={onDownload}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#ff5b14] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {isDownloading ? "Downloading..." : "Download GPX"}
        </button>

        <p className={`text-xs ${hasFreshPreview ? "text-emerald-600" : "text-amber-600"}`}>
          {hasFreshPreview
            ? "Preview is up to date. Download will use the exact previewed track."
            : "Adjustments changed. Regenerate preview before downloading."}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <p className="mb-1 flex items-center gap-2">
          <Bike className="h-4 w-4 text-[#ff5b14]" />
          Route points: <span className="font-medium text-slate-900">{pointCount}</span>
        </p>
        <p className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-[#ff5b14]" />
          {statusMessage}
        </p>
      </div>
    </aside>
  );
}
