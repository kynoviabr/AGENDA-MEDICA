import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appUrl = Deno.env.get("APP_URL") || "https://clinicas-de-estetica.vercel.app";

    // Verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { patientId, clinicId, forceResend } = await req.json();

    if (!patientId || !clinicId) {
      return new Response(JSON.stringify({ error: "patientId e clinicId são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is staff of this clinic
    const { data: isStaff } = await adminClient.rpc("is_clinic_staff", {
      _user_id: user.id, _clinic_id: clinicId,
    });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get patient
    const { data: patient, error: patientError } = await adminClient
      .from("patients").select("*").eq("id", patientId).eq("clinic_id", clinicId).maybeSingle();

    if (patientError || !patient) {
      return new Response(JSON.stringify({ error: "Paciente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!patient.email) {
      return new Response(JSON.stringify({ error: "Paciente precisa ter um e-mail cadastrado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = patient.email.toLowerCase().trim();

    // Check if patient app access already exists (new table)
    const { data: existingPatientUser } = await adminClient
      .from("patient_users")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .eq("status", "active")
      .maybeSingle();

    if (existingPatientUser && !forceResend) {
      return new Response(JSON.stringify({ error: "Paciente já possui acesso ao portal" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy fallback check
    const { data: existingAccess } = await adminClient
      .from("patient_portal_access")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (existingAccess && !forceResend) {
      return new Response(JSON.stringify({ error: "Paciente já possui acesso ao portal" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if auth user already exists
    const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
    let authUserId: string;
    let accountCreated = false;

    const existingUser = existingUsers?.find((u) => u.email === email);

    if (existingUser) {
      authUserId = existingUser.id;
      if (forceResend && (existingPatientUser || existingAccess)) {
        await adminClient.auth.resetPasswordForEmail(email, {
          redirectTo: `${appUrl}/reset-password`,
        });
        return new Response(JSON.stringify({
          message: "Convite reenviado com sucesso para o e-mail do paciente.",
          accountCreated: false,
          resent: true,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Create auth account via invite — Supabase sends an invite email with a link to set password
      const { data: newUser, error: createError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: patient.full_name, role: "patient" },
        redirectTo: `${appUrl}/reset-password`,
      });

      if (createError || !newUser.user) {
        return new Response(JSON.stringify({ error: createError?.message || "Erro ao criar conta" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      authUserId = newUser.user.id;
      accountCreated = true;
    }

    // Link patient record to auth user
    await adminClient.from("patients").update({ user_id: authUserId }).eq("id", patientId);

    // Create patient app access (new table)
    const { error: patientUsersError } = await adminClient.from("patient_users").upsert({
      patient_id: patientId,
      clinic_id: clinicId,
      auth_user_id: authUserId,
      status: "active",
    }, { onConflict: "clinic_id,patient_id,auth_user_id" });

    if (patientUsersError) {
      return new Response(JSON.stringify({ error: patientUsersError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Backward compatibility with legacy access table
    const { error: accessError } = await adminClient.from("patient_portal_access").upsert({
      patient_id: patientId,
      clinic_id: clinicId,
      auth_user_id: authUserId,
      access_status: "active",
    }, { onConflict: "patient_id,auth_user_id" });

    if (accessError) {
      return new Response(JSON.stringify({ error: accessError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For existing users who didn't get an invite email, send a recovery email
    if (!accountCreated) {
      await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      });
    }

    // Create notification for the patient
    await adminClient.from("notifications").insert({
      clinic_id: clinicId,
      patient_id: patientId,
      user_id: authUserId,
      title: "Bem-vindo ao Portal do Paciente!",
      message: "Seu acesso ao portal foi ativado. Você pode acompanhar suas sessões, fotos e pagamentos.",
      channel: "in_app",
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      message: accountCreated
        ? "Conta criada e acesso ao portal concedido! O paciente receberá um e-mail para definir a senha."
        : "Acesso ao portal concedido! O paciente já possui conta e pode fazer login.",
      accountCreated,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
