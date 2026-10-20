import { serve } from "../_shared/serve.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function encryptToken(token: string) {
  const secret = Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("platform_encryption_key_not_configured");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!supabaseUrl || !anonKey || !serviceRole) throw new Error("supabase_not_configured");
    if (!appId || !appSecret) throw new Error("meta_platform_not_configured");

    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

    const payload = await req.json();
    const clinicId = String(payload.clinicId || "");
    const action = String(payload.action || "connect");
    const admin = createClient(supabaseUrl, serviceRole);
    const { data: allowed, error: roleError } = await admin.rpc("has_clinic_role", {
      _user_id: user.id,
      _clinic_id: clinicId,
      _role: "admin",
    });
    if (roleError || !allowed) return json({ ok: false, error: "admin_required" }, 403);

    if (action === "disconnect") {
      const { error } = await admin.from("whatsapp_connections").update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        token_ciphertext: "revoked",
      }).eq("clinic_id", clinicId);
      if (error) throw error;
      return json({ ok: true, status: "disconnected" });
    }

    const code = String(payload.code || "");
    const phoneNumberId = String(payload.phoneNumberId || "");
    const wabaId = String(payload.wabaId || "");
    if (!code || !phoneNumberId || !wabaId) return json({ ok: false, error: "embedded_signup_data_missing" }, 400);

    const graphVersion = Deno.env.get("META_GRAPH_API_VERSION") || "v23.0";
    const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl);
    const tokenPayload = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error("meta_code_exchange_failed");

    const detailsResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
    );
    const details = await detailsResponse.json().catch(() => ({}));
    if (!detailsResponse.ok) throw new Error("meta_phone_validation_failed");

    const subscribeResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`,
      { method: "POST", headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
    );
    if (!subscribeResponse.ok) throw new Error("meta_webhook_subscription_failed");

    const tokenCiphertext = await encryptToken(String(tokenPayload.access_token));
    const expiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
      : null;
    const { error: saveError } = await admin.from("whatsapp_connections").upsert({
      clinic_id: clinicId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: details.display_phone_number || null,
      business_name: details.verified_name || null,
      status: "connected",
      token_ciphertext: tokenCiphertext,
      token_expires_at: expiresAt,
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      metadata: { graph_version: graphVersion },
    }, { onConflict: "clinic_id" });
    if (saveError) throw saveError;

    await admin.from("whatsapp_ai_settings").upsert({ clinic_id: clinicId, is_enabled: true }, { onConflict: "clinic_id" });
    return json({
      ok: true,
      status: "connected",
      displayPhoneNumber: details.display_phone_number || null,
      businessName: details.verified_name || null,
    });
  } catch (error) {
    console.error("whatsapp-connect", error);
    return json({ ok: false, error: (error as Error).message }, 500);
  }
});
