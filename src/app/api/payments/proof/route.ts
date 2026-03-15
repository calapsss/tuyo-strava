import { NextRequest, NextResponse } from "next/server";

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

  if (!(screenshot instanceof File)) {
    return NextResponse.json({ error: "Payment screenshot file is required." }, { status: 400 });
  }

  if (!screenshot.type.startsWith("image/")) {
    return NextResponse.json({ error: "Payment screenshot must be an image file." }, { status: 400 });
  }

  if (screenshot.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "Screenshot is too large. Maximum file size is 8MB." }, { status: 400 });
  }

  const discordFormData = new FormData();
  const contentLines = [
    "New payment proof submitted.",
    `Amount: PHP ${amount}`,
    title ? `Activity title: ${title}` : null,
    activityType ? `Activity type: ${activityType}` : null,
    `Submitted at: ${new Date().toISOString()}`,
  ].filter(Boolean);

  discordFormData.append("content", contentLines.join("\n"));
  discordFormData.append("file", screenshot, screenshot.name || `payment-proof-${Date.now()}.png`);

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
