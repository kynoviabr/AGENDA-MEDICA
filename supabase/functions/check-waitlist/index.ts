import { serve } from "../_shared/serve.ts";
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

type WaitlistRow = {
  id: string;
  clinic_id: string;
  preferred_professional_id: string | null;
  treatment_id: string | null;
  window_start: string;
  window_end: string;
  preferred_periods: string[] | null;
  min_duration_minutes: number;
  status: string;
};

type MatchSlot = {
  professionalId: string;
  startIso: string;
  endIso: string;
};

const PERIODS = new Set(["morning", "afternoon", "evening"]);

function dayPeriod(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function normalizePeriods(periods: string[] | null): Set<string> {
  const normalized = new Set(
    (periods || [])
      .map((p) => String(p).trim().toLowerCase())
      .filter((p) => PERIODS.has(p)),
  );
  if (normalized.size === 0) {
    normalized.add("morning");
    normalized.add("afternoon");
    normalized.add("evening");
  }
  return normalized;
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

    let clinicsQuery = admin.from("clinics").select("id");
    if (clinicId) clinicsQuery = clinicsQuery.eq("id", clinicId);
    const { data: clinics, error: clinicsError } = await clinicsQuery;
    if (clinicsError) throw clinicsError;

    let processedClinics = 0;
    let entriesChecked = 0;
    let matchesFound = 0;
    let notificationsSent = 0;

    for (const clinic of clinics || []) {
      processedClinics += 1;
      const startedAt = new Date().toISOString();
      const errors: string[] = [];
      let clinicMatchesFound = 0;
      let clinicNotificationsSent = 0;

      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: entries, error: entriesError } = await admin
          .from("appointment_waitlist")
          .select("id, clinic_id, preferred_professional_id, treatment_id, window_start, window_end, preferred_periods, min_duration_minutes, status")
          .eq("clinic_id", clinic.id)
          .eq("status", "waiting")
          .gte("window_end", today)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(200);
        if (entriesError) throw entriesError;

        const waitlist = (entries || []) as WaitlistRow[];
        entriesChecked += waitlist.length;

        if (waitlist.length === 0) {
          await admin.from("waitlist_agent_logs").insert({
            clinic_id: clinic.id,
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            entries_checked: 0,
            matches_found: 0,
            notifications_sent: 0,
            status: "success",
          });
          continue;
        }

        const { data: location, error: locationError } = await admin.from("clinic_locations")
          .select("id, timezone").eq("clinic_id", clinic.id).eq("is_primary", true).eq("active", true).single();
        if (locationError) throw locationError;
        const { data: locationProfessionals, error: professionalsError } = await admin.from("professional_locations")
          .select("professional_id").eq("clinic_id", clinic.id).eq("location_id", location.id).eq("active", true);
        if (professionalsError) throw professionalsError;
        const activeProfessionalIds = (locationProfessionals || []).map((row) => row.professional_id);

        for (const entry of waitlist) {
          const candidates = entry.preferred_professional_id
            ? activeProfessionalIds.filter((id) => id === entry.preferred_professional_id)
            : activeProfessionalIds;
          let match: MatchSlot | null = null;
          for (const professionalId of candidates) {
            const { data: slots, error: slotsError } = await admin.rpc("get_available_slots", {
              p_clinic_id: clinic.id,
              p_location_id: location.id,
              p_professional_id: professionalId,
              p_treatment_id: entry.treatment_id,
              p_date_from: entry.window_start,
              p_date_to: entry.window_end,
              p_step_minutes: 15,
            });
            if (slotsError) throw slotsError;
            const preferredPeriods = normalizePeriods(entry.preferred_periods);
            const slot = (slots || []).find((candidate) => {
              const hour = Number(new Intl.DateTimeFormat("en-US", {
                timeZone: location.timezone,
                hour: "2-digit",
                hour12: false,
              }).format(new Date(candidate.start_time)));
              return preferredPeriods.has(dayPeriod(hour));
            });
            if (slot) {
              match = { professionalId, startIso: slot.start_time, endIso: slot.end_time };
              break;
            }
          }

          if (!match) {
            await admin.from("appointment_waitlist")
              .update({ last_checked_at: new Date().toISOString() })
              .eq("id", entry.id);
            continue;
          }

          matchesFound += 1;
          notificationsSent += 1;
          clinicMatchesFound += 1;
          clinicNotificationsSent += 1;

          const { error: notifyError } = await admin.from("waitlist_notifications").insert({
            clinic_id: clinic.id,
            waitlist_id: entry.id,
            matched_slot_start: match.startIso,
            matched_slot_end: match.endIso,
            matched_professional_id: match.professionalId,
            action_taken: "none",
          });
          if (notifyError) {
            errors.push(`waitlist ${entry.id}: ${notifyError.message}`);
            continue;
          }

          await admin.from("appointment_waitlist")
            .update({
              status: "match_found",
              match_found_at: new Date().toISOString(),
              last_checked_at: new Date().toISOString(),
            })
            .eq("id", entry.id);
        }

        await admin.from("waitlist_agent_logs").insert({
          clinic_id: clinic.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          entries_checked: waitlist.length,
          matches_found: clinicMatchesFound,
          notifications_sent: clinicNotificationsSent,
          status: errors.length > 0 ? "partial" : "success",
          errors: errors.length > 0 ? { messages: errors } : null,
        });
      } catch (error) {
        await admin.from("waitlist_agent_logs").insert({
          clinic_id: clinic.id,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          entries_checked: 0,
          matches_found: 0,
          notifications_sent: 0,
          status: "failed",
          errors: { message: (error as Error).message },
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processedClinics,
      entriesChecked,
      matchesFound,
      notificationsSent,
      message: "check-waitlist executado com matching de vagas.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
