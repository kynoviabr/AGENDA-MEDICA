import { serve } from "../_shared/serve.ts";
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
      return new Response(JSON.stringify({ error: "Papel inválido. Use: recepcionista, profissional ou comercial" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanEmail = email.toLowerCase().trim();
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

    // Check if user already exists in auth (scan every page, listUsers is paginated)
    let existingUser: { id: string; email?: string; email_confirmed_at?: string | null } | undefined;
    for (let page = 1; ; page++) {
      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const users = usersPage?.users ?? [];
      existingUser = users.find((u) => u.email?.toLowerCase().trim() === cleanEmail);
      if (existingUser || users.length < 1000) break;
    }

    // An existing but unconfirmed account (e.g. an earlier invite never accepted)
    // goes through the invitation path below, which re-sends the invite email;
    // the role is granted once the email is confirmed.
    if (existingUser?.email_confirmed_at) {
      // Check if already has an active role in this clinic (a member may hold several roles)
      const { data: activeRoles, error: activeRolesError } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("clinic_id", clinicId)
        .eq("is_active", true)
        .limit(1);

      if (activeRolesError) {
        return new Response(JSON.stringify({ error: activeRolesError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (activeRoles && activeRoles.length > 0) {
        return new Response(JSON.stringify({ error: "Este usuário já faz parte da equipe" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add or reactivate role directly
      const { error: roleError } = await adminClient.from("user_roles").upsert({
        user_id: existingUser.id,
        clinic_id: clinicId,
        role,
        is_active: true,
      }, { onConflict: "user_id,clinic_id,role" });

      if (roleError) {
        return new Response(JSON.stringify({ error: roleError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark any pending invitation as accepted
      await adminClient.from("team_invitations")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("clinic_id", clinicId)
        .ilike("email", cleanEmail);

      // Explicitly guarantee user_access_groups assignment (alongside DB trigger)
      const groupCode = role === 'receptionist' ? 'recepcao' : role === 'professional' ? 'profissionais' : 'comercial';
      const { data: targetGroup } = await adminClient
        .from("access_groups")
        .select("id")
        .eq("clinic_id", clinicId)
        .eq("code", groupCode)
        .maybeSingle();

      if (targetGroup?.id) {
        await adminClient.from("user_access_groups").upsert({
          clinic_id: clinicId,
          user_id: existingUser.id,
          group_id: targetGroup.id,
          is_active: true,
        }, { onConflict: "clinic_id,user_id,group_id" });
      }

      return new Response(JSON.stringify({ message: "Membro adicionado à equipe!", status: "added" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User doesn't exist yet in auth, or hasn't confirmed: create pending invitation record
    let { error: invError } = await adminClient.from("team_invitations").upsert({
      clinic_id: clinicId,
      email: cleanEmail,
      role,
      cargo_name: cargoName ?? null,
      invited_by: user.id,
      status: "pending",
    }, { onConflict: "clinic_id,email" });

    if (invError && (invError.code === "42703" || invError.message?.includes("cargo_name"))) {
      // Backward compatibility for environments where migration wasn't applied yet.
      const fallback = await adminClient.from("team_invitations").upsert({
        clinic_id: clinicId,
        email: cleanEmail,
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

    // Send real invitation email via Supabase Auth Admin
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "");
    const redirectTo = origin ? `${origin.replace(/\/$/, "")}/login` : undefined;

    const { data: inviteAuthData, error: inviteAuthErr } = await adminClient.auth.admin.inviteUserByEmail(
      cleanEmail,
      {
        redirectTo,
        data: {
          clinic_id: clinicId,
          role,
          cargo_name: cargoName ?? null,
        },
      }
    );

    if (inviteAuthErr) {
      // Non-fatal if invite record was saved (e.g. SMTP limits or already invited in auth), log detail
      console.warn("inviteUserByEmail warning:", inviteAuthErr.message);
    }

    return new Response(JSON.stringify({
      message: "Convite criado! O membro receberá o papel ao confirmar o e-mail do convite.",
      status: "invited",
      invitedAuthUserId: inviteAuthData?.user?.id ?? null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
