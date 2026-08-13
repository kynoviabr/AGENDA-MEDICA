import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractToken(req: Request, body: Record<string, unknown>) {
  return String(
    req.headers.get("x-runner-token")
      || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
      || body?.token
      || "",
  ).trim();
}

type ReminderRow = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  channel: string;
  payload: {
    message?: string;
    recipient_phone?: string;
    [k: string]: unknown;
  } | null;
  scheduled_for: string;
};

async function sendViaMetaCloudApi(reminder: ReminderRow) {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!accessToken || !phoneNumberId) {
    throw new Error("WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not configured");
  }
  const to = String(reminder.payload?.recipient_phone || "").trim();
  const bodyText = String(reminder.payload?.message || "").trim();
  if (!to || !bodyText) throw new Error("missing recipient/message in reminder payload");

  const endpoint = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: bodyText },
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`meta_cloud_api ${response.status}: ${errorBody}`);
  }
}

async function sendViaWebhook(reminder: ReminderRow) {
  const providerWebhookUrl = Deno.env.get("WHATSAPP_PROVIDER_WEBHOOK_URL");
  const providerToken = Deno.env.get("WHATSAPP_PROVIDER_TOKEN");
  if (!providerWebhookUrl) throw new Error("WHATSAPP_PROVIDER_WEBHOOK_URL not configured");

  const response = await fetch(providerWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(providerToken ? { Authorization: `Bearer ${providerToken}` } : {}),
    },
    body: JSON.stringify({
      appointment_id: reminder.appointment_id,
      clinic_id: reminder.clinic_id,
      payload: reminder.payload,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`webhook ${response.status}: ${errorBody}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE env vars not configured");
    const admin = createClient(supabaseUrl, serviceRole);

    const body = await req.json().catch(() => ({}));
    const runnerToken = Deno.env.get("AGENDA_JOBS_RUNNER_TOKEN") || "";
    if (!runnerToken) {
      return new Response(JSON.stringify({ ok: false, reason: "runner_token_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
    const providedToken = extractToken(req, body);
    if (providedToken !== runnerToken) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_runner" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const clinicId: string | undefined = body?.clinicId;
    const limit = Number(body?.limit || 100);
    const nowIso = new Date().toISOString();
    const providerMode = (Deno.env.get("WHATSAPP_PROVIDER_MODE") || "webhook").toLowerCase();

    let queue = admin
      .from("appointment_reminders")
      .select("id, clinic_id, appointment_id, channel, payload, scheduled_for")
      .eq("status", "pending")
      .lte("scheduled_for", nowIso)
      .order("scheduled_for")
      .limit(limit);
    if (clinicId) queue = queue.eq("clinic_id", clinicId);

    const { data: reminders, error } = await queue;
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    for (const reminder of (reminders || []) as ReminderRow[]) {
      try {
        if (reminder.channel !== "whatsapp") {
          throw new Error(`Canal não suportado: ${reminder.channel}`);
        }

        if (providerMode === "meta_cloud_api") {
          await sendViaMetaCloudApi(reminder);
        } else {
          await sendViaWebhook(reminder);
        }

        await admin.from("appointment_reminders")
          .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
          .eq("id", reminder.id);
        sent += 1;
      } catch (dispatchError) {
        failed += 1;
        await admin.from("appointment_reminders")
          .update({ status: "failed", error_message: (dispatchError as Error).message })
          .eq("id", reminder.id);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      mode: providerMode,
      processed: (reminders || []).length,
      sent,
      failed,
      message: "Despacho de lembretes executado.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
