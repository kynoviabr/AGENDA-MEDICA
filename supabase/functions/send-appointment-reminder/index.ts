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

function generateToken(appointmentId: string) {
  const nonce = crypto.randomUUID().split("-")[0];
  return `${appointmentId.slice(0, 8)}-${nonce}`;
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${min} (UTC)`;
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
    const nowIso = new Date().toISOString();
    const lookAheadHours = Number(body?.lookAheadHours || 24);
    const limit = Number(body?.limit || 200);
    const until = new Date(Date.now() + lookAheadHours * 60 * 60 * 1000).toISOString();

    let query = admin
      .from("appointments")
      .select("id, clinic_id, start_time, status, lead_id, patient_id, treatment_id, leads:leads!appointments_lead_id_fkey(full_name,phone), patients:patients!appointments_patient_id_fkey(full_name,phone), treatments(name)")
      .in("status", ["scheduled", "confirmed"])
      .gte("start_time", nowIso)
      .lte("start_time", until)
      .order("start_time")
      .limit(limit);
    if (clinicId) query = query.eq("clinic_id", clinicId);

    const { data: appointments, error } = await query;
    if (error) throw error;

    let queued = 0;
    let skipped = 0;
    let noRecipient = 0;

    for (const appointment of appointments || []) {
      const { data: existingReminder } = await admin
        .from("appointment_reminders")
        .select("id")
        .eq("appointment_id", appointment.id)
        .eq("channel", "whatsapp")
        .in("status", ["pending", "sent"])
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      if (existingReminder?.id) {
        skipped += 1;
        continue;
      }

      const recipientName = appointment?.patients?.full_name || appointment?.leads?.full_name || "Paciente";
      const recipientPhone = normalizePhone(appointment?.patients?.phone || appointment?.leads?.phone);
      if (!recipientPhone) {
        noRecipient += 1;
        continue;
      }

      const treatmentName = appointment?.treatments?.name || "atendimento";
      const existingTokenRecord = await admin
        .from("appointment_whatsapp_tokens")
        .select("id, token")
        .eq("appointment_id", appointment.id)
        .eq("status", "pending")
        .gte("expires_at", nowIso)
        .limit(1)
        .maybeSingle();

      let token = existingTokenRecord.data?.token || null;
      if (!token) {
        token = generateToken(appointment.id);
        const expiresAt = new Date(new Date(appointment.start_time).getTime() + 6 * 60 * 60 * 1000).toISOString();
        const { error: tokenError } = await admin.from("appointment_whatsapp_tokens").insert({
          clinic_id: appointment.clinic_id,
          appointment_id: appointment.id,
          token,
          expires_at: expiresAt,
          status: "pending",
        });
        if (tokenError) {
          skipped += 1;
          continue;
        }
      }

      const appointmentWhen = formatDateTime(appointment.start_time);
      const text = [
        `Olá ${recipientName}, seu atendimento (${treatmentName}) está marcado para ${appointmentWhen}.`,
        `Responda: CONFIRMAR #${token} ou CANCELAR #${token}`,
      ].join(" ");

      const payload = {
        token,
        command_hint: `CONFIRMAR #${token} | CANCELAR #${token}`,
        appointment_id: appointment.id,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        treatment_name: treatmentName,
        message: text,
      };

      const { error: reminderError } = await admin.from("appointment_reminders").insert({
        clinic_id: appointment.clinic_id,
        appointment_id: appointment.id,
        channel: "whatsapp",
        scheduled_for: nowIso,
        status: "pending",
        payload,
      });
      if (!reminderError) queued += 1;
    }

    return new Response(JSON.stringify({
      ok: true,
      queued,
      skipped,
      noRecipient,
      scanned: (appointments || []).length,
      message: "Lembretes preparados na fila.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
