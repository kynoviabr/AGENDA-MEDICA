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

type JobMode = "morning" | "hourly" | "manual";

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function toRunKey(mode: JobMode) {
  const now = new Date();
  if (mode === "morning") return `${utcDateKey()}-09h`;
  if (mode === "hourly") return `${utcDateKey()}-${String(now.getUTCHours()).padStart(2, "0")}h`;
  return `${utcDateKey()}-manual-${now.toISOString().slice(11, 16).replace(":", "")}`;
}

async function invokeFunction(
  supabaseUrl: string,
  invokeKey: string,
  name: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${invokeKey}`,
      apikey: invokeKey,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} failed (${response.status}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

async function createExecutionLog(
  admin: ReturnType<typeof createClient>,
  payload: { clinic_id: string | null; run_key: string; mode: string },
) {
  const base = {
    clinic_id: payload.clinic_id,
    job_name: "run-agenda-jobs",
    run_key: payload.run_key,
    status: "started",
  };

  const attemptDetails = await admin.from("agenda_job_executions").insert({
    ...base,
    details: { mode: payload.mode, startedAt: new Date().toISOString() },
  }).select("id").single();
  if (!attemptDetails.error) return attemptDetails.data;

  const attemptInput = await admin.from("agenda_job_executions").insert({
    ...base,
    input: { mode: payload.mode, startedAt: new Date().toISOString() },
  }).select("id").single();
  if (attemptInput.error) throw attemptInput.error;
  return attemptInput.data;
}

async function finalizeExecutionLog(
  admin: ReturnType<typeof createClient>,
  executionId: string,
  result: Record<string, unknown>,
) {
  const base = {
    status: "completed",
    finished_at: new Date().toISOString(),
  };

  const attemptDetails = await admin.from("agenda_job_executions")
    .update({
      ...base,
      details: result,
    })
    .eq("id", executionId);
  if (!attemptDetails.error) return;

  const attemptOutput = await admin.from("agenda_job_executions")
    .update({
      ...base,
      output: result,
    })
    .eq("id", executionId);
  if (attemptOutput.error) throw attemptOutput.error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const functionInvokeKey = Deno.env.get("AGENDA_FUNCTIONS_INVOKE_KEY") || anonKey || serviceRole;
    const runnerToken = Deno.env.get("AGENDA_JOBS_RUNNER_TOKEN") || "";
    if (!supabaseUrl || !serviceRole || !functionInvokeKey) throw new Error("SUPABASE env vars not configured");

    const body = await req.json().catch(() => ({}));
    const providedToken = String(
      extractToken(req, body)
    ).trim();
    if (!runnerToken) {
      return new Response(JSON.stringify({ ok: false, reason: "runner_token_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (providedToken !== runnerToken) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_runner" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode = (body?.mode || "manual") as JobMode;
    const clinicId: string | undefined = body?.clinicId;
    const runKey = String(body?.runKey || toRunKey(mode));
    const admin = createClient(supabaseUrl, serviceRole);

    const { data: existing } = await admin.from("agenda_job_executions")
      .select("id, status")
      .eq("job_name", "run-agenda-jobs")
      .eq("run_key", runKey)
      .is("clinic_id", clinicId || null)
      .maybeSingle();
    if (existing?.id) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "already_executed",
        runKey,
        status: existing.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const execution = await createExecutionLog(admin, {
      clinic_id: clinicId || null,
      run_key: runKey,
      mode,
    });

    const result: Record<string, unknown> = { runKey, mode };
    const payload = clinicId ? { clinicId } : {};

    if (mode === "morning") {
      result["dailySummary"] = await invokeFunction(supabaseUrl, functionInvokeKey, "send-daily-agenda-summary", payload);
      result["queueReminders"] = await invokeFunction(supabaseUrl, functionInvokeKey, "send-appointment-reminder", {
        ...payload,
        lookAheadHours: 24,
        limit: 200,
      });
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, functionInvokeKey, "dispatch-appointment-reminders", {
        ...payload,
        limit: 200,
      });
      result["checkWaitlist"] = await invokeFunction(supabaseUrl, functionInvokeKey, "check-waitlist", payload);
    } else if (mode === "hourly") {
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, functionInvokeKey, "dispatch-appointment-reminders", {
        ...payload,
        limit: 100,
      });
      result["checkWaitlist"] = await invokeFunction(supabaseUrl, functionInvokeKey, "check-waitlist", payload);
    } else {
      result["queueReminders"] = await invokeFunction(supabaseUrl, functionInvokeKey, "send-appointment-reminder", {
        ...payload,
        lookAheadHours: 24,
        limit: 100,
      });
      result["dispatchReminders"] = await invokeFunction(supabaseUrl, functionInvokeKey, "dispatch-appointment-reminders", {
        ...payload,
        limit: 100,
      });
    }

    await finalizeExecutionLog(admin, execution.id, result);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
