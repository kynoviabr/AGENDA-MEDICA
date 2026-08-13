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

type WaitlistRow = {
  id: string;
  clinic_id: string;
  preferred_professional_id: string | null;
  window_start: string;
  window_end: string;
  preferred_periods: string[] | null;
  min_duration_minutes: number;
  status: string;
};

type AvailabilityRow = {
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

type AppointmentRow = {
  start_time: string;
  end_time: string;
  professional_id: string | null;
  status: string;
};

type BlockRow = {
  professional_id: string | null;
  start_at: string;
  end_at: string;
};

type MatchSlot = {
  professionalId: string;
  startIso: string;
  endIso: string;
};

const PERIODS = new Set(["morning", "afternoon", "evening"]);

function parseHm(value: string): { h: number; m: number } {
  const [h, m] = String(value).slice(0, 5).split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

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

function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function dayRange(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  while (cursor <= endDay) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function findFirstSlot(
  row: WaitlistRow,
  availabilities: AvailabilityRow[],
  appointments: AppointmentRow[],
  blocks: BlockRow[],
): MatchSlot | null {
  const preferredPeriods = normalizePeriods(row.preferred_periods);
  const minDuration = Math.max(15, Number(row.min_duration_minutes || 60));
  const windowStart = new Date(`${row.window_start}T00:00:00.000Z`);
  const windowEnd = new Date(`${row.window_end}T23:59:59.999Z`);
  const preferredOnly = row.preferred_professional_id;

  const availabilitySource = availabilities.filter((slot) => {
    if (!slot.is_active) return false;
    if (preferredOnly) return slot.professional_id === preferredOnly;
    return true;
  });
  if (availabilitySource.length === 0) return null;

  const slotsByDayAndProf = new Map<string, AvailabilityRow[]>();
  for (const slot of availabilitySource) {
    const key = `${slot.professional_id}:${slot.day_of_week}`;
    const existing = slotsByDayAndProf.get(key);
    if (existing) existing.push(slot);
    else slotsByDayAndProf.set(key, [slot]);
  }

  const days = dayRange(windowStart, windowEnd);
  for (const day of days) {
    const dow = day.getUTCDay();
    const professionals = new Set<string>();
    for (const key of slotsByDayAndProf.keys()) {
      if (key.endsWith(`:${dow}`)) professionals.add(key.split(":")[0]);
    }
    for (const professionalId of professionals) {
      const slots = slotsByDayAndProf.get(`${professionalId}:${dow}`) || [];
      for (const slot of slots) {
        const startHm = parseHm(slot.start_time);
        const endHm = parseHm(slot.end_time);
        const slotStart = new Date(day);
        slotStart.setUTCHours(startHm.h, startHm.m, 0, 0);
        const slotEnd = new Date(day);
        slotEnd.setUTCHours(endHm.h, endHm.m, 0, 0);
        if (slotEnd <= slotStart) continue;

        for (
          let candidate = new Date(slotStart);
          addMinutes(candidate, minDuration) <= slotEnd;
          candidate = addMinutes(candidate, 15)
        ) {
          const candidateEnd = addMinutes(candidate, minDuration);
          const period = dayPeriod(candidate.getUTCHours());
          if (!preferredPeriods.has(period)) continue;
          if (candidate < windowStart || candidateEnd > windowEnd) continue;

          const hasAppointmentConflict = appointments.some((appointment) => {
            if (!appointment.professional_id || appointment.professional_id !== professionalId) return false;
            return overlaps(
              candidate,
              candidateEnd,
              new Date(appointment.start_time),
              new Date(appointment.end_time),
            );
          });
          if (hasAppointmentConflict) continue;

          const hasBlockConflict = blocks.some((block) => {
            if (block.professional_id && block.professional_id !== professionalId) return false;
            return overlaps(
              candidate,
              candidateEnd,
              new Date(block.start_at),
              new Date(block.end_at),
            );
          });
          if (hasBlockConflict) continue;

          return {
            professionalId,
            startIso: candidate.toISOString(),
            endIso: candidateEnd.toISOString(),
          };
        }
      }
    }
  }

  return null;
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
          .select("id, clinic_id, preferred_professional_id, window_start, window_end, preferred_periods, min_duration_minutes, status")
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

        const minWindowStart = waitlist.reduce((acc, row) => (row.window_start < acc ? row.window_start : acc), waitlist[0].window_start);
        const maxWindowEnd = waitlist.reduce((acc, row) => (row.window_end > acc ? row.window_end : acc), waitlist[0].window_end);

        const [{ data: availabilities, error: availabilityError }, { data: appointments, error: apptError }, { data: blocks, error: blocksError }] = await Promise.all([
          admin.from("professional_availability")
            .select("professional_id, day_of_week, start_time, end_time, is_active")
            .eq("clinic_id", clinic.id)
            .eq("is_active", true),
          admin.from("appointments")
            .select("start_time, end_time, professional_id, status")
            .eq("clinic_id", clinic.id)
            .gte("start_time", `${minWindowStart}T00:00:00.000Z`)
            .lte("end_time", `${maxWindowEnd}T23:59:59.999Z`)
            .not("status", "in", "(cancelled,rescheduled)"),
          admin.from("appointment_blocks")
            .select("professional_id, start_at, end_at")
            .eq("clinic_id", clinic.id)
            .lte("start_at", `${maxWindowEnd}T23:59:59.999Z`)
            .gte("end_at", `${minWindowStart}T00:00:00.000Z`),
        ]);
        if (availabilityError) throw availabilityError;
        if (apptError) throw apptError;
        if (blocksError) throw blocksError;

        for (const entry of waitlist) {
          const match = findFirstSlot(
            entry,
            (availabilities || []) as AvailabilityRow[],
            (appointments || []) as AppointmentRow[],
            (blocks || []) as BlockRow[],
          );

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
