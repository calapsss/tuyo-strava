import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function webhookUrlWithWait(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("wait")) {
    parsed.searchParams.set("wait", "true");
  }
  return parsed.toString();
}

function truncate(value: string, max = 320): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function getClientIp(request: NextRequest): { ip: string; source: string } {
  const candidates: Array<[header: string, source: string]> = [
    ["cf-connecting-ip", "cf-connecting-ip"],
    ["x-real-ip", "x-real-ip"],
    ["x-forwarded-for", "x-forwarded-for"],
    ["true-client-ip", "true-client-ip"],
    ["fly-client-ip", "fly-client-ip"],
    ["x-client-ip", "x-client-ip"],
  ];

  for (const [headerName, source] of candidates) {
    const raw = request.headers.get(headerName);
    if (!raw) continue;
    const ip = raw.split(",")[0]?.trim();
    if (ip) return { ip, source };
  }

  return { ip: "unknown", source: "none" };
}

function filteredHeaders(request: NextRequest): Record<string, string> {
  const skip = new Set(["cookie", "authorization"]);
  return Object.fromEntries(
    Array.from(request.headers.entries())
      .filter(([key]) => !skip.has(key.toLowerCase()))
      .map(([key, value]) => [key, truncate(value, 500)]),
  );
}

function parseNullableNumber(input: string): number | null {
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

export async function POST(request: NextRequest) {
  let webhookUrl = "";
  try {
    webhookUrl = requiredEnv("DISCORD_PAYMENT_WEBHOOK_URL");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discord webhook is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const formData = await request.formData();
  const screenshot = formData.get("screenshot");
  const amount = String(formData.get("amount") ?? "50");
  const title = String(formData.get("title") ?? "").trim();
  const activityType = String(formData.get("activityType") ?? "").trim();
  const clientUserAgent = String(formData.get("clientUserAgent") ?? "").trim();
  const clientPlatform = String(formData.get("clientPlatform") ?? "").trim();
  const clientLanguage = String(formData.get("clientLanguage") ?? "").trim();
  const clientLanguages = String(formData.get("clientLanguages") ?? "").trim();
  const clientTimeZone = String(formData.get("clientTimeZone") ?? "").trim();
  const clientLocalTime = String(formData.get("clientLocalTime") ?? "").trim();
  const clientScreen = String(formData.get("clientScreen") ?? "").trim();
  const clientViewport = String(formData.get("clientViewport") ?? "").trim();
  const clientDeviceMemory = String(formData.get("clientDeviceMemory") ?? "").trim();
  const clientHardwareConcurrency = String(formData.get("clientHardwareConcurrency") ?? "").trim();
  const clientMaxTouchPoints = String(formData.get("clientMaxTouchPoints") ?? "").trim();
  const clientReferrer = String(formData.get("clientReferrer") ?? "").trim();
  const clientPageUrl = String(formData.get("clientPageUrl") ?? "").trim();
  const geoLatitude = parseNullableNumber(String(formData.get("geoLatitude") ?? ""));
  const geoLongitude = parseNullableNumber(String(formData.get("geoLongitude") ?? ""));
  const geoAccuracyMeters = parseNullableNumber(String(formData.get("geoAccuracyMeters") ?? ""));
  const geoAltitudeMeters = parseNullableNumber(String(formData.get("geoAltitudeMeters") ?? ""));
  const geoAltitudeAccuracyMeters = parseNullableNumber(String(formData.get("geoAltitudeAccuracyMeters") ?? ""));
  const geoHeadingDegrees = parseNullableNumber(String(formData.get("geoHeadingDegrees") ?? ""));
  const geoSpeedMps = parseNullableNumber(String(formData.get("geoSpeedMps") ?? ""));
  const geoTimestamp = String(formData.get("geoTimestamp") ?? "").trim();

  if (!(screenshot instanceof File)) {
    return NextResponse.json({ error: "Payment screenshot file is required." }, { status: 400 });
  }

  if (!screenshot.type.startsWith("image/")) {
    return NextResponse.json({ error: "Payment screenshot must be an image file." }, { status: 400 });
  }

  if (screenshot.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Screenshot is too large. Maximum file size is 8MB." }, { status: 400 });
  }

  if (geoLatitude === null || geoLongitude === null) {
    return NextResponse.json(
      { error: "Location is required. Please allow location permission and try again." },
      { status: 400 },
    );
  }

  const ipInfo = getClientIp(request);
  const requestUserAgent = request.headers.get("user-agent") ?? "";
  const identificationHash = createHash("sha256")
    .update([ipInfo.ip, requestUserAgent, clientUserAgent, clientLanguage].join("|"))
    .digest("hex")
    .slice(0, 16);
  const eventId = randomUUID();

  const summaryLines = [
    "New payment proof submitted.",
    `Event ID: ${eventId}`,
    `Amount: PHP ${amount}`,
    title ? `Activity title: ${truncate(title, 160)}` : null,
    activityType ? `Activity type: ${activityType}` : null,
    `Server timestamp: ${new Date().toISOString()}`,
    "",
    "Identification summary",
    `IP: ${ipInfo.ip}`,
    `IP source: ${ipInfo.source}`,
    `Location (lat,lng): ${geoLatitude.toFixed(6)}, ${geoLongitude.toFixed(6)}`,
    geoAccuracyMeters !== null ? `Location accuracy: ${geoAccuracyMeters.toFixed(1)}m` : null,
    geoTimestamp ? `Location timestamp: ${geoTimestamp}` : null,
    `ID hash: ${identificationHash}`,
    `User-Agent (request): ${truncate(requestUserAgent, 220)}`,
    clientUserAgent ? `User-Agent (client): ${truncate(clientUserAgent, 220)}` : null,
    clientPlatform ? `Platform: ${truncate(clientPlatform, 120)}` : null,
    clientLanguage ? `Language: ${truncate(clientLanguage, 120)}` : null,
    clientTimeZone ? `Timezone: ${truncate(clientTimeZone, 120)}` : null,
    clientLocalTime ? `Client local time: ${truncate(clientLocalTime, 180)}` : null,
    clientScreen ? `Screen: ${truncate(clientScreen, 120)}` : null,
    clientViewport ? `Viewport: ${truncate(clientViewport, 120)}` : null,
    clientDeviceMemory ? `Device memory: ${truncate(clientDeviceMemory, 80)}` : null,
    clientHardwareConcurrency ? `CPU cores: ${truncate(clientHardwareConcurrency, 80)}` : null,
    clientMaxTouchPoints ? `Max touch points: ${truncate(clientMaxTouchPoints, 80)}` : null,
    clientReferrer ? `Referrer: ${truncate(clientReferrer, 260)}` : null,
    clientPageUrl ? `Page URL: ${truncate(clientPageUrl, 260)}` : null,
    clientLanguages ? `Languages: ${truncate(clientLanguages, 260)}` : null,
  ].filter(Boolean);

  const metadataPayload = {
    eventId,
    amountPhp: amount,
    activity: {
      title,
      activityType,
    },
    submission: {
      receivedAt: new Date().toISOString(),
      screenshot: {
        fileName: screenshot.name,
        mimeType: screenshot.type,
        sizeBytes: screenshot.size,
      },
    },
    serverObserved: {
      ip: ipInfo.ip,
      ipSource: ipInfo.source,
      idHash: identificationHash,
      userAgent: requestUserAgent,
      requestUrl: request.url,
      method: request.method,
      headers: filteredHeaders(request),
    },
    clientReported: {
      userAgent: clientUserAgent || null,
      platform: clientPlatform || null,
      language: clientLanguage || null,
      languages: clientLanguages || null,
      timezone: clientTimeZone || null,
      localTime: clientLocalTime || null,
      screen: clientScreen || null,
      viewport: clientViewport || null,
      deviceMemory: clientDeviceMemory || null,
      hardwareConcurrency: clientHardwareConcurrency || null,
      maxTouchPoints: clientMaxTouchPoints || null,
      referrer: clientReferrer || null,
      pageUrl: clientPageUrl || null,
      geolocation: {
        latitude: geoLatitude,
        longitude: geoLongitude,
        accuracyMeters: geoAccuracyMeters,
        altitudeMeters: geoAltitudeMeters,
        altitudeAccuracyMeters: geoAltitudeAccuracyMeters,
        headingDegrees: geoHeadingDegrees,
        speedMps: geoSpeedMps,
        timestamp: geoTimestamp || null,
      },
    },
  };

  const discordFormData = new FormData();
  discordFormData.append("content", summaryLines.join("\n"));
  discordFormData.append("file", screenshot, screenshot.name || `payment-proof-${Date.now()}.png`);
  discordFormData.append(
    "metadata",
    new Blob([JSON.stringify(metadataPayload, null, 2)], { type: "application/json" }),
    `payment-metadata-${eventId}.json`,
  );

  const webhookResponse = await fetch(webhookUrlWithWait(webhookUrl), {
    method: "POST",
    body: discordFormData,
  });

  if (!webhookResponse.ok) {
    const payload = (await webhookResponse.text().catch(() => "")) || "Webhook request failed.";
    return NextResponse.json(
      { error: `Could not forward proof to Discord: ${payload}` },
      { status: webhookResponse.status >= 400 ? webhookResponse.status : 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
