"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crosshair, LocateFixed, Search, Shuffle } from "lucide-react";
import { LineChartCard } from "@/components/LineChartCard";
import { PaymentGateModal } from "@/components/PaymentGateModal";
import { Sidebar } from "@/components/Sidebar";
import { StravaUploadModal, type StravaUploadDraft } from "@/components/StravaUploadModal";
import { generateGpx } from "@/lib/gpx-generator";
import { applyLoopsToRoute, type LoopMode } from "@/lib/route-loops";
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
  loopCount,
  loopMode,
}: {
  route: LngLatTuple[];
  activityType: ActivityType;
  averagePace: number;
  startDateTime: string;
  realism: RealismSettings;
  runName: string;
  description: string;
  loopCount: number;
  loopMode: LoopMode;
}): string {
  const first = route[0];
  const last = route[route.length - 1];
  return JSON.stringify({
    activityType,
    averagePace: Number(averagePace.toFixed(3)),
    startDateTime,
    realism,
    loopCount,
    loopMode,
    runName,
    description,
    signature: route.length
      ? `${route.length}:${first[0].toFixed(6)},${first[1].toFixed(6)}:${last[0].toFixed(6)},${last[1].toFixed(6)}`
      : "none",
  });
}

const STRAVA_PENDING_UPLOAD_KEY = "tuyo.pendingStravaUpload";
const STRAVA_DRAFT_UPLOAD_KEY = "tuyo.stravaUploadDraft";
const STRAVA_PRIVATE_NOTES_KEY = "tuyo.stravaPrivateNotes";
const GATE_PAYMENT_AMOUNT_PHP = 50;
const GCASH_QR_IMAGE_PATH = process.env.NEXT_PUBLIC_GCASH_QR_IMAGE_PATH ?? "/gcash-qr.png";

type PaymentStep = "pay" | "proof";

interface StravaUploadPayload {
  gpx: string;
  name: string;
  description: string;
  activityType: ActivityType;
  trainer: boolean;
  commute: boolean;
  hideFromHome: boolean;
  privateNote: string;
}

interface StravaUploadApiResponse {
  uploadId?: number;
  uploadStatus?: string;
  activityId?: number | null;
  requestedHideFromHome?: boolean;
  error?: string;
  authUrl?: string;
}

interface StravaStatusResponse {
  configured?: boolean;
  connected?: boolean;
}

export default function Home() {
  const [activityType, setActivityType] = useState<ActivityType>("run");
  const [averagePace, setAveragePace] = useState(5.5);
  const [startDateTime, setStartDateTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [runName, setRunName] = useState("Morning Run");
  const [description, setDescription] = useState("Great morning run through the park.");
  const [loopCount, setLoopCount] = useState(1);
  const [loopMode, setLoopMode] = useState<LoopMode>("auto");
  const [realism, setRealism] = useState<RealismSettings>(DEFAULT_REALISM_SETTINGS);

  const [rawRoute, setRawRoute] = useState<LngLatTuple[]>([]);
  const [snappedRoute, setSnappedRoute] = useState<LngLatTuple[]>([]);
  const [useSnappedRoute, setUseSnappedRoute] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploadingToStrava, setIsUploadingToStrava] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentStep, setPaymentStep] = useState<PaymentStep>("pay");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [isSubmittingPaymentProof, setIsSubmittingPaymentProof] = useState(false);
  const [isStravaConnected, setIsStravaConnected] = useState(false);
  const [isStravaConfigured, setIsStravaConfigured] = useState(true);
  const [isStravaModalOpen, setIsStravaModalOpen] = useState(false);
  const [stravaPhoto, setStravaPhoto] = useState<File | null>(null);
  const [stravaDraft, setStravaDraft] = useState<StravaUploadDraft>({
    name: "Morning Run",
    description: "Great morning run through the park.",
    privateNote: "",
    hideFromHome: false,
    trainer: false,
    commute: false,
  });
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
  const activeLoopedRoute = useMemo(
    () => applyLoopsToRoute(activeRoute, loopCount, loopMode),
    [activeRoute, loopCount, loopMode],
  );

  const currentPreviewKey = useMemo(
    () =>
      previewKeyFor({
        route: activeLoopedRoute,
        activityType,
        averagePace,
        startDateTime,
        realism,
        loopCount,
        loopMode,
        runName,
        description,
      }),
    [activeLoopedRoute, activityType, averagePace, startDateTime, realism, loopCount, loopMode, runName, description],
  );
  const hasFreshPreview = Boolean(previewTrack && previewKey === currentPreviewKey);

  const canSnap = rawRoute.length > 1 && !isSnapping;
  const canGeneratePreview = activeRoute.length > 1 && !isGeneratingPreview && !isSnapping;
  const canDownload = hasFreshPreview && !isDownloading;
  const canUploadToStrava = hasFreshPreview && !isUploadingToStrava;

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

  const handleLoopCountChange = useCallback(
    (value: number) => {
      const next = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 20) : 1;
      setLoopCount(next);
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleLoopModeChange = useCallback(
    (value: LoopMode) => {
      setLoopMode(value);
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

      const baseRoute = useSnappedRoute ? snappedRoute : rawRoute;
      const previewRoute = applyLoopsToRoute(baseRoute, loopCount, loopMode);
      setStatusMessage(
        useSnappedRoute
          ? `Generating telemetry preview using snapped road geometry (${loopCount} lap${loopCount > 1 ? "s" : ""})...`
          : `Generating telemetry preview using your original private path (${loopCount} lap${loopCount > 1 ? "s" : ""})...`,
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
          loopCount,
          loopMode,
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
    loopCount,
    loopMode,
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

  const createStravaPayload = useCallback((draft: StravaUploadDraft): StravaUploadPayload | null => {
    if (!previewTrack || !hasFreshPreview) {
      return null;
    }

    const parsedStart = new Date(startDateTime);
    const startTime = Number.isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
    const gpx = generateGpx(
      previewTrack.map((pointItem) => [pointItem.lat, pointItem.lng, pointItem.ele, pointItem.time, pointItem.hr]),
      {
        name: runName || `Simulated ${activityType} ${startTime.toLocaleString()}`,
        activityType,
      },
    );

    return {
      gpx,
      name: draft.name.trim() || runName || `Simulated ${activityType}`,
      description: draft.description.trim(),
      activityType,
      trainer: draft.trainer,
      commute: draft.commute,
      hideFromHome: draft.hideFromHome,
      privateNote: draft.privateNote.trim(),
    };
  }, [activityType, hasFreshPreview, previewTrack, runName, startDateTime]);

  const pollUploadStatus = useCallback(async (uploadId: number): Promise<number | null> => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1400));
      const statusResponse = await fetch(`/api/strava/uploads/${uploadId}`);
      const statusBody = (await statusResponse.json().catch(() => ({}))) as {
        complete?: boolean;
        activityId?: number | null;
      };

      if (!statusResponse.ok) {
        return null;
      }

      if (statusBody.complete) {
        return statusBody.activityId ?? null;
      }
    }

    return null;
  }, []);

  const persistPrivateNote = useCallback((note: string, title: string, activityId: number | null) => {
    const trimmed = note.trim();
    if (!trimmed) return;

    const raw = localStorage.getItem(STRAVA_PRIVATE_NOTES_KEY);
    const entries = raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
    entries.unshift({
      activityId,
      title,
      note: trimmed,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(STRAVA_PRIVATE_NOTES_KEY, JSON.stringify(entries.slice(0, 50)));
  }, []);

  const updateActivityVisibility = useCallback(async (activityId: number, hideFromHome: boolean) => {
    if (!hideFromHome) return;
    await fetch(`/api/strava/activities/${activityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideFromHome: true }),
    });
  }, []);

  const uploadPhoto = useCallback(async (activityId: number, photo: File, caption: string): Promise<boolean> => {
    const formData = new FormData();
    formData.append("activityId", String(activityId));
    formData.append("photo", photo, photo.name);
    if (caption.trim()) {
      formData.append("caption", caption.trim());
    }

    const response = await fetch("/api/strava/media", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatusMessage(`Activity uploaded, but photo failed: ${body.error ?? "Photo endpoint unavailable."}`);
      return false;
    }

    return true;
  }, []);

  const uploadToStrava = useCallback(
    async (payload: StravaUploadPayload, photo: File | null): Promise<boolean> => {
      setIsUploadingToStrava(true);
      try {
        const formData = new FormData();
        formData.append("gpx", payload.gpx);
        formData.append("name", payload.name);
        formData.append("description", payload.description);
        formData.append("activityType", payload.activityType);
        formData.append("trainer", payload.trainer ? "true" : "false");
        formData.append("commute", payload.commute ? "true" : "false");
        formData.append("hideFromHome", payload.hideFromHome ? "true" : "false");

        const response = await fetch("/api/strava/upload", {
          method: "POST",
          body: formData,
        });

        const body = (await response.json().catch(() => ({}))) as StravaUploadApiResponse;
        if (response.status === 401 && body.authUrl) {
          if (photo) {
            const draftForReconnect: StravaUploadDraft = {
              name: payload.name,
              description: payload.description,
              privateNote: payload.privateNote,
              hideFromHome: payload.hideFromHome,
              trainer: payload.trainer,
              commute: payload.commute,
            };
            localStorage.setItem(STRAVA_DRAFT_UPLOAD_KEY, JSON.stringify(draftForReconnect));
          } else {
            localStorage.setItem(STRAVA_PENDING_UPLOAD_KEY, JSON.stringify(payload));
          }
          window.location.href = body.authUrl;
          return false;
        }

        if (!response.ok) {
          setStatusMessage(`Strava upload failed: ${body.error ?? "Unknown upload error."}`);
          return false;
        }

        setIsStravaConnected(true);
        const uploadId = body.uploadId;
        if (!uploadId) {
          persistPrivateNote(payload.privateNote, payload.name, body.activityId ?? null);
          setStatusMessage("Strava accepted upload request.");
          return true;
        }

        setStatusMessage("File sent to Strava. Finalizing activity...");
        const activityId = await pollUploadStatus(uploadId);
        if (activityId) {
          persistPrivateNote(payload.privateNote, payload.name, activityId);
          await updateActivityVisibility(activityId, payload.hideFromHome);
          if (photo) {
            const uploadedPhoto = await uploadPhoto(activityId, photo, payload.description);
            if (uploadedPhoto) {
              setStatusMessage(`Uploaded to Strava successfully with photo. Activity ID: ${activityId}`);
              return true;
            }
          } else {
            setStatusMessage(`Uploaded to Strava successfully. Activity ID: ${activityId}`);
            return true;
          }
        }

        setStatusMessage("Upload queued on Strava. Check your Strava feed in a moment.");
        return true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown network error.";
        setStatusMessage(`Strava upload failed: ${reason}`);
        return false;
      } finally {
        setIsUploadingToStrava(false);
      }
    },
    [persistPrivateNote, pollUploadStatus, updateActivityVisibility, uploadPhoto],
  );

  const requestPaymentLocation = useCallback(async (): Promise<GeolocationPosition> => {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported on this device/browser.");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(new Error(error.message || "Could not access location.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }, []);

  const submitPaymentProof = useCallback(async (): Promise<boolean> => {
    if (!paymentProofFile) {
      setStatusMessage("Please upload your GCash payment screenshot first.");
      return false;
    }

    setIsSubmittingPaymentProof(true);
    try {
      setStatusMessage("Requesting location permission for payment verification...");
      const position = await requestPaymentLocation();
      const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;

      const formData = new FormData();
      formData.append("screenshot", paymentProofFile, paymentProofFile.name);
      formData.append("amount", String(GATE_PAYMENT_AMOUNT_PHP));
      formData.append("title", stravaDraft.name || runName);
      formData.append("activityType", activityType);
      formData.append("clientUserAgent", navigator.userAgent ?? "");
      formData.append("clientPlatform", navigator.platform ?? "");
      formData.append("clientLanguage", navigator.language ?? "");
      formData.append("clientLanguages", JSON.stringify(navigator.languages ?? []));
      formData.append("clientTimeZone", Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
      formData.append("clientLocalTime", new Date().toString());
      formData.append("clientScreen", `${window.screen.width}x${window.screen.height}`);
      formData.append("clientViewport", `${window.innerWidth}x${window.innerHeight}`);
      formData.append("clientDeviceMemory", String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ""));
      formData.append("clientHardwareConcurrency", String(navigator.hardwareConcurrency ?? ""));
      formData.append("clientMaxTouchPoints", String(navigator.maxTouchPoints ?? ""));
      formData.append("clientReferrer", document.referrer ?? "");
      formData.append("clientPageUrl", window.location.href);
      formData.append("geoLatitude", String(latitude));
      formData.append("geoLongitude", String(longitude));
      formData.append("geoAccuracyMeters", String(accuracy));
      formData.append("geoAltitudeMeters", altitude === null ? "" : String(altitude));
      formData.append("geoAltitudeAccuracyMeters", altitudeAccuracy === null ? "" : String(altitudeAccuracy));
      formData.append("geoHeadingDegrees", heading === null ? "" : String(heading));
      formData.append("geoSpeedMps", speed === null ? "" : String(speed));
      formData.append("geoTimestamp", new Date(position.timestamp).toISOString());

      const response = await fetch("/api/payments/proof", {
        method: "POST",
        body: formData,
      });

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setStatusMessage(`Payment proof submission failed: ${body.error ?? "Unknown error."}`);
        return false;
      }

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown network error.";
      setStatusMessage(`Payment proof submission failed: ${reason}`);
      return false;
    } finally {
      setIsSubmittingPaymentProof(false);
    }
  }, [activityType, paymentProofFile, requestPaymentLocation, runName, stravaDraft.name]);

  const handleConfirmPaymentProof = useCallback(async () => {
    const submitted = await submitPaymentProof();
    if (!submitted) return;

    setIsPaymentModalOpen(false);
    setPaymentStep("pay");
    setPaymentProofFile(null);
    setIsStravaModalOpen(true);
    setStatusMessage("Payment proof submitted. Continue with Strava upload details.");
  }, [submitPaymentProof]);

  const handleConfirmStravaUpload = useCallback(async () => {
    if (!canUploadToStrava) {
      setStatusMessage("Generate an up-to-date preview before uploading to Strava.");
      return;
    }

    const payload = createStravaPayload(stravaDraft);
    if (!payload) {
      setStatusMessage("Preview data is missing. Generate preview again.");
      return;
    }

    localStorage.setItem(STRAVA_DRAFT_UPLOAD_KEY, JSON.stringify(stravaDraft));
    const success = await uploadToStrava(payload, stravaPhoto);
    if (success) {
      setIsStravaModalOpen(false);
      setStravaPhoto(null);
    } else if (!isStravaConnected && stravaPhoto) {
      setStatusMessage("Strava login required. Re-select the photo after reconnect.");
    }
  }, [canUploadToStrava, createStravaPayload, isStravaConnected, stravaDraft, stravaPhoto, uploadToStrava]);

  const handleUploadToStrava = useCallback(() => {
    if (!canUploadToStrava) {
      setStatusMessage("Generate an up-to-date preview before uploading to Strava.");
      return;
    }

    if (!isStravaConfigured) {
      setStatusMessage("Strava integration is not configured on the server.");
      return;
    }

    setStravaDraft((previous) => ({
      ...previous,
      name: runName || previous.name,
      description: description || previous.description,
    }));
    setStravaPhoto(null);
    setPaymentProofFile(null);
    setPaymentStep("pay");
    setIsPaymentModalOpen(true);
  }, [canUploadToStrava, description, isStravaConfigured, runName]);

  useEffect(() => {
    let cancelled = false;

    const loadStravaStatus = async () => {
      try {
        const response = await fetch("/api/strava/status");
        const body = (await response.json().catch(() => ({}))) as StravaStatusResponse;
        if (cancelled) return;
        setIsStravaConfigured(body.configured !== false);
        setIsStravaConnected(Boolean(body.connected));
      } catch {
        if (cancelled) return;
        setIsStravaConfigured(false);
        setIsStravaConnected(false);
      }
    };

    void loadStravaStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const draftRaw = localStorage.getItem(STRAVA_DRAFT_UPLOAD_KEY);
    if (!draftRaw) return;
    try {
      const restored = JSON.parse(draftRaw) as StravaUploadDraft;
      setStravaDraft((previous) => ({ ...previous, ...restored }));
    } catch {
      // Ignore malformed local draft data.
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stravaFlag = params.get("strava");
    const reason = params.get("reason");

    if (stravaFlag === "connected") {
      setIsStravaConnected(true);
      const pendingRaw = localStorage.getItem(STRAVA_PENDING_UPLOAD_KEY);
      if (pendingRaw) {
        localStorage.removeItem(STRAVA_PENDING_UPLOAD_KEY);
        try {
          const pendingPayload = JSON.parse(pendingRaw) as StravaUploadPayload;
          void uploadToStrava(pendingPayload, null);
        } catch {
          setStatusMessage("Connected to Strava. Pending upload payload was invalid.");
        }
      } else {
        const draftRaw = localStorage.getItem(STRAVA_DRAFT_UPLOAD_KEY);
        if (draftRaw) {
          try {
            const restoredDraft = JSON.parse(draftRaw) as StravaUploadDraft;
            setStravaDraft(restoredDraft);
            setStravaPhoto(null);
            setIsStravaModalOpen(true);
            setStatusMessage("Connected to Strava. Re-select your photo then confirm upload.");
          } catch {
            setStatusMessage("Connected to Strava.");
          }
        } else {
          setStatusMessage("Connected to Strava.");
        }
      }
    } else if (stravaFlag === "error") {
      setStatusMessage(`Strava login failed: ${reason ?? "authorization was denied."}`);
    }

    if (stravaFlag) {
      params.delete("strava");
      params.delete("reason");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [uploadToStrava]);

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900">
      <header className="sticky top-0 z-[9999] border-b border-slate-200 bg-white">
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
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-slate-900">Compliance tumakbo? TUYO!</h1>

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
              loopCount={loopCount}
              loopMode={loopMode}
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
              canUploadToStrava={canUploadToStrava}
              isSnapping={isSnapping}
              isGeneratingPreview={isGeneratingPreview}
              isDownloading={isDownloading}
              isUploadingToStrava={isUploadingToStrava}
              isLocating={isLocating}
              isStravaConnected={isStravaConnected}
              isStravaConfigured={isStravaConfigured}
              statusMessage={statusMessage}
              onActivityTypeChange={handleActivityTypeChange}
              onAveragePaceChange={handleAveragePaceChange}
              onStartDateTimeChange={handleStartDateTimeChange}
              onRunNameChange={handleRunNameChange}
              onDescriptionChange={handleDescriptionChange}
              onLoopCountChange={handleLoopCountChange}
              onLoopModeChange={handleLoopModeChange}
              onRealismChange={handleRealismChange}
              onUseSnappedRouteChange={handleUseSnappedRouteChange}
              onDrawRoute={() => setDrawTrigger((value) => value + 1)}
              onLocateMe={handleLocateMe}
              onSnapRoute={handleSnapRoute}
              onGeneratePreview={handleGeneratePreview}
              onDownload={handleDownload}
              onUploadToStrava={handleUploadToStrava}
            />
          </div>
        </div>
      </main>

      <PaymentGateModal
        isOpen={isPaymentModalOpen}
        step={paymentStep}
        amountPhp={GATE_PAYMENT_AMOUNT_PHP}
        qrImagePath={GCASH_QR_IMAGE_PATH}
        proofFile={paymentProofFile}
        isSubmitting={isSubmittingPaymentProof}
        onClose={() => {
          if (isSubmittingPaymentProof) return;
          setIsPaymentModalOpen(false);
          setPaymentStep("pay");
          setPaymentProofFile(null);
        }}
        onContinue={() => setPaymentStep("proof")}
        onProofFileChange={setPaymentProofFile}
        onSubmitProof={handleConfirmPaymentProof}
      />

      <StravaUploadModal
        isOpen={isStravaModalOpen}
        isSubmitting={isUploadingToStrava}
        isConnected={isStravaConnected}
        draft={stravaDraft}
        photo={stravaPhoto}
        onChange={(patch) => setStravaDraft((previous) => ({ ...previous, ...patch }))}
        onPhotoChange={setStravaPhoto}
        onClose={() => {
          if (isUploadingToStrava) return;
          setIsStravaModalOpen(false);
        }}
        onSubmit={handleConfirmStravaUpload}
      />

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-[1500px] px-4 py-3 text-sm text-slate-600 sm:px-6 text-center">
          Copyright 2026 © Charles Calapini
        </div>
      </footer>
    </div>
  );
}
