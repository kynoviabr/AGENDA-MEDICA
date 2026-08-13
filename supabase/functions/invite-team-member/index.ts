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

    const { email, role, clinicId, cargoName } = await req.json();

    // Validate input
    if (!email || !role || !clinicId) {
      return new Response(JSON.stringify({ error: "Email, papel e clínica são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = ["receptionist", "professional", "sales"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Papel inválido. Use: recepcionista ou profissional" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin of this clinic
    const { data: isAdmin } = await adminClient.rpc("has_clinic_role", {
      _user_id: user.id, _clinic_id: clinicId, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem convidar membros" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists in auth
    const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.find((u: unknown) => u.email === email.toLowerCase().trim());

    if (existingUser) {
      // Check if already has a role in this clinic
      const { data: existingRole } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (existingRole) {
        return new Response(JSON.stringify({ error: "Este usuário já faz parte da equipe" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add role directly
      const { error: roleError } = await adminClient.from("user_roles").insert({
        user_id: existingUser.id, clinic_id: clinicId, role, is_active: true,
      });

      if (roleError) {
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark any pending invitation as accepted
      await adminClient.from("team_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("clinic_id", clinicId).eq("email", email.toLowerCase().trim());

      return new Response(JSON.stringify({ message: "Membro adicionado à equipe!", status: "added" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User doesn't exist — create a pending invitation
    let { error: invError } = await adminClient.from("team_invitations").upsert({
      clinic_id: clinicId,
      email: email.toLowerCase().trim(),
      role,
      cargo_name: cargoName ?? null,
      invited_by: user.id,
      status: "pending",
    }, { onConflict: "clinic_id,email" });

    if (invError && (invError.code === "42703" || invError.message?.includes("cargo_name"))) {
      // Backward compatibility for environments where migration wasn't applied yet.
      const fallback = await adminClient.from("team_invitations").upsert({
        clinic_id: clinicId,
        email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
        status: "pending",
      }, { onConflict: "clinic_id,email" });
      invError = fallback.error;
    }

    if (invError) {
      return new Response(JSON.stringify({ error: invError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      message: "Convite criado! O membro receberá o papel ao criar conta.",
      status: "invited",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
