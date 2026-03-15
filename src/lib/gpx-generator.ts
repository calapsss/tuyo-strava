export type GpxTrackTuple = [
  latitude: number,
  longitude: number,
  elevation: number,
  timestamp: Date | string,
  heartRate: number | null,
];

export interface GpxOptions {
  name?: string;
  creator?: string;
  activityType?: "run" | "walk" | "cycle";
}

const ACTIVITY_LABEL: Record<NonNullable<GpxOptions["activityType"]>, string> = {
  run: "Running",
  walk: "Walking",
  cycle: "Cycling",
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toIsoTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function generateGpx(trackPoints: GpxTrackTuple[], options: GpxOptions = {}): string {
  if (trackPoints.length === 0) {
    throw new Error("Cannot create GPX without track points.");
  }

  const creator = escapeXml(options.creator ?? "Route Forge GPX");
  const name = escapeXml(options.name ?? "Simulated Activity");
  const activityType = ACTIVITY_LABEL[options.activityType ?? "run"];
  const metadataTime = toIsoTimestamp(trackPoints[0][3]);

  const trkPoints = trackPoints
    .map(([lat, lon, ele, time, hr]) => {
      const safeLat = lat.toFixed(7);
      const safeLon = lon.toFixed(7);
      const safeEle = ele.toFixed(1);
      const safeTime = toIsoTimestamp(time);
      const safeHr = hr === null ? null : Math.round(hr);
      const extensions =
        safeHr === null
          ? ""
          : [
              "<extensions>",
              "<gpxtpx:TrackPointExtension>",
              `<gpxtpx:hr>${safeHr}</gpxtpx:hr>`,
              "</gpxtpx:TrackPointExtension>",
              "</extensions>",
            ].join("");

      return [
        `<trkpt lat="${safeLat}" lon="${safeLon}">`,
        `<ele>${safeEle}</ele>`,
        `<time>${safeTime}</time>`,
        extensions,
        "</trkpt>",
      ].join("");
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/11.xsd http://www.garmin.com/xmlschemas/TrackPointExtension/v1 http://www.garmin.com/xmlschemas/TrackPointExtensionv1.xsd">`,
    "<metadata>",
    `<name>${name}</name>`,
    `<time>${metadataTime}</time>`,
    "</metadata>",
    "<trk>",
    `<name>${name}</name>`,
    `<type>${activityType}</type>`,
    "<trkseg>",
    trkPoints,
    "</trkseg>",
    "</trk>",
    "</gpx>",
  ].join("");
}
