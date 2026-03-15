"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer as LeafletMapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LngLatTuple } from "@/lib/route-simulation";

interface MapContainerProps {
  rawCoordinates: LngLatTuple[];
  snappedCoordinates: LngLatTuple[];
  drawTrigger: number;
  userLocation: LngLatTuple | null;
  onRouteChange: (coordinates: LngLatTuple[]) => void;
}

interface DrawingEventsProps {
  isDrawing: boolean;
  onAddPoint: (coordinate: LngLatTuple) => void;
  onFinish: () => void;
  onUndo: () => void;
}

const DEFAULT_CENTER: [number, number] = [37.7749, -122.4194];

function RecenterMap({ userLocation }: { userLocation: LngLatTuple | null }) {
  const map = useMap();

  useEffect(() => {
    if (!userLocation) return;
    map.setView([userLocation[1], userLocation[0]], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, userLocation]);

  return null;
}

function DrawingEvents({ isDrawing, onAddPoint, onFinish, onUndo }: DrawingEventsProps) {
  useMapEvents({
    click(event) {
      if (!isDrawing) return;
      onAddPoint([event.latlng.lng, event.latlng.lat]);
    },
    dblclick() {
      if (!isDrawing) return;
      onFinish();
    },
    contextmenu() {
      if (!isDrawing) return;
      onUndo();
    },
  });

  return null;
}

export function MapContainer({
  rawCoordinates,
  snappedCoordinates,
  drawTrigger,
  userLocation,
  onRouteChange,
}: MapContainerProps) {
  const [completedDrawTrigger, setCompletedDrawTrigger] = useState(0);
  const isDrawing = drawTrigger > completedDrawTrigger;

  useEffect(() => {
    if (drawTrigger === 0) return;
    onRouteChange([]);
  }, [drawTrigger, onRouteChange]);

  const handleAddPoint = useCallback(
    (coordinate: LngLatTuple) => {
      onRouteChange([...rawCoordinates, coordinate]);
    },
    [onRouteChange, rawCoordinates],
  );

  const handleUndoPoint = useCallback(() => {
    if (rawCoordinates.length === 0) return;
    onRouteChange(rawCoordinates.slice(0, -1));
  }, [onRouteChange, rawCoordinates]);

  const rawRouteLatLng = useMemo(
    () => rawCoordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    [rawCoordinates],
  );

  const snappedRouteLatLng = useMemo(
    () => snappedCoordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    [snappedCoordinates],
  );

  const startPoint = rawRouteLatLng[0];
  const endPoint = rawRouteLatLng[rawRouteLatLng.length - 1];

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-slate-200 bg-white">
      <LeafletMapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full"
        doubleClickZoom={false}
        zoomControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <DrawingEvents
          isDrawing={isDrawing}
          onAddPoint={handleAddPoint}
          onFinish={() => setCompletedDrawTrigger(drawTrigger)}
          onUndo={handleUndoPoint}
        />
        <RecenterMap userLocation={userLocation} />

        {rawRouteLatLng.length > 1 ? (
          <Polyline positions={rawRouteLatLng} pathOptions={{ color: "#FF9E7A", weight: 4, dashArray: "8 8" }} />
        ) : null}

        {snappedRouteLatLng.length > 1 ? (
          <Polyline positions={snappedRouteLatLng} pathOptions={{ color: "#FF6B35", weight: 5, opacity: 0.95 }} />
        ) : null}

        {startPoint ? (
          <CircleMarker center={startPoint} radius={5} pathOptions={{ color: "#22c55e", fillOpacity: 0.95 }}>
            <Tooltip direction="top">Start</Tooltip>
          </CircleMarker>
        ) : null}

        {endPoint ? (
          <CircleMarker center={endPoint} radius={5} pathOptions={{ color: "#ef4444", fillOpacity: 0.95 }}>
            <Tooltip direction="top">End</Tooltip>
          </CircleMarker>
        ) : null}

        {userLocation ? (
          <CircleMarker
            center={[userLocation[1], userLocation[0]]}
            radius={7}
            pathOptions={{ color: "#38bdf8", fillOpacity: 0.95 }}
          >
            <Tooltip direction="top">You are here</Tooltip>
          </CircleMarker>
        ) : null}
      </LeafletMapContainer>

      <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-sm rounded-md border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm">
        {isDrawing
          ? "Drawing mode: click to add points, double-click to finish, right-click to undo."
          : "Press Draw Route in the sidebar to start tracing a route."}
      </div>
    </div>
  );
}
