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

type Summary = {
  total: number;
  scheduled: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  noShow: number;
  cancelled: number;
  evaluations: number;
  sessions: number;
};

function summarize(rows: Array<{ status: string | null; appointment_type: string | null }>): Summary {
  const out: Summary = {
    total: 0,
    scheduled: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    noShow: 0,
    cancelled: 0,
    evaluations: 0,
    sessions: 0,
  };
  for (const row of rows) {
    out.total += 1;
    const status = String(row.status || "").toLowerCase();
    const type = String(row.appointment_type || "").toLowerCase();
    if (status === "scheduled") out.scheduled += 1;
    else if (status === "confirmed") out.confirmed += 1;
    else if (status === "in_progress") out.inProgress += 1;
    else if (status === "completed") out.completed += 1;
    else if (status === "no_show") out.noShow += 1;
    else if (status === "cancelled") out.cancelled += 1;

    if (type === "evaluation") out.evaluations += 1;
    else out.sessions += 1;
  }
  return out;
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

    let clinicsQuery = admin.from("clinics").select("id, name");
    if (clinicId) clinicsQuery = clinicsQuery.eq("id", clinicId);
    const { data: clinics, error: clinicsError } = await clinicsQuery;
    if (clinicsError) throw clinicsError;

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    let generated = 0;
    for (const clinic of clinics || []) {
      const { data: appointments, error: apptError } = await admin
        .from("appointments")
        .select("id, status, appointment_type")
        .eq("clinic_id", clinic.id)
        .gte("start_time", dayStart.toISOString())
        .lte("start_time", dayEnd.toISOString());
      if (apptError) continue;

      const summary = summarize((appointments || []) as Array<{ status: string | null; appointment_type: string | null }>);

      const message = [
        `Resumo agenda ${clinic.name || "Clínica"} (${dayStart.toISOString().slice(0, 10)})`,
        `Total: ${summary.total}`,
        `Agendados: ${summary.scheduled} | Confirmados: ${summary.confirmed}`,
        `Em andamento: ${summary.inProgress} | Concluídos: ${summary.completed}`,
        `No-show: ${summary.noShow} | Cancelados: ${summary.cancelled}`,
        `Avaliações: ${summary.evaluations} | Sessões: ${summary.sessions}`,
      ].join(" · ");

      await admin.from("whatsapp_command_logs").insert({
        clinic_id: clinic.id,
        result_status: "daily_summary_generated",
        parsed_command: "daily_summary",
        details: {
          summary,
          message,
          generated_at: new Date().toISOString(),
        },
      });

      generated += 1;
    }

    return new Response(JSON.stringify({
      ok: true,
      generated,
      message: "Resumo diário gerado e salvo em logs operacionais.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
