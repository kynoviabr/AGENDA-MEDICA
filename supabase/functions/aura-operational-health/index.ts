import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AuraPilotReadinessService,
  isGlobalAiDisabled,
  parseAppEnvironment,
  type AuraPilotSnapshot,
} from "../../../src/ai/index.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const environment = parseAppEnvironment(Deno.env.get("APP_ENV"));
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("mode") === "liveness") {
    const healthy = environment !== 'unknown';
    return json({ ok: healthy, status: healthy ? "healthy" : "unhealthy", service: "aura-operational-health", state: healthy ? "healthy" : "unhealthy", environment }, healthy ? 200 : 503);
  }
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authorization = req.headers.get("authorization") || "";
  if (!supabaseUrl || !anonKey || !authorization) return json({ ok: false, reason: "unauthorized" }, 401);
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return json({ ok: false, reason: "unauthorized" }, 401);
  const payload = await req.json().catch(() => ({})) as { clinicId?: string; range?: 'today' | '7d' };
  if (!payload.clinicId) return json({ ok: false, reason: "invalid_request" }, 400);

  try {
    const { data: stored, error } = await client.rpc("get_aura_pilot_snapshot", { p_clinic_id: payload.clinicId });
    if (error || !stored) return json({ ok: false, reason: "readiness_unavailable" }, error?.code === '42501' ? 403 : 503);
    const snapshot = {
      ...(stored as Omit<AuraPilotSnapshot, 'appEnvironment' | 'globalSwitchConfigured' | 'globalAiDisabled' | 'openAiConfigured'>),
      appEnvironment: environment,
      globalSwitchConfigured: ['true', 'false', '1', '0'].includes((Deno.env.get("AURA_AI_GLOBAL_DISABLED") || '').toLowerCase()),
      globalAiDisabled: isGlobalAiDisabled(Deno.env.get("AURA_AI_GLOBAL_DISABLED")),
      openAiConfigured: Boolean(Deno.env.get("OPENAI_API_KEY")),
    } as AuraPilotSnapshot;
    const readiness = new AuraPilotReadinessService().evaluate(snapshot);
    const until = new Date();
    const since = payload.range === 'today'
      ? new Date(new Date().setHours(0, 0, 0, 0))
      : new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { data: metrics, error: metricsError } = await client.rpc("get_aura_operational_metrics", {
      p_clinic_id: payload.clinicId, p_since: since.toISOString(), p_until: until.toISOString(),
    });
    return json({ ok: true, environment, readiness, metrics: metricsError ? null : metrics, checkedAt: new Date().toISOString() });
  } catch {
    return json({ ok: false, reason: "readiness_unavailable" }, 503);
  }
});
