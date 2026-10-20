import { serve as stdServe } from "https://deno.land/std@0.168.0/http/server.ts";

// Origins allowed to call the functions from a browser. Extra origins can be
// added per environment with ALLOWED_ORIGINS (comma-separated).
const DEFAULT_ALLOWED_ORIGINS = [
  "https://agenda-medica-indol.vercel.app",
  "https://clinicas-de-estetica.vercel.app",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

// Vercel previews of this project, scoped to the team so other projects can't match.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/agenda-medica-[a-z0-9-]+-kynoviabrs-projects\.vercel\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return DEFAULT_ALLOWED_ORIGINS.includes(origin) || extra.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);
}

type Handler = (req: Request) => Response | Promise<Response>;

// Drop-in replacement for std `serve` that replaces the wildcard
// Access-Control-Allow-Origin with the caller's origin when it is allowed.
// Requests without an Origin header (webhooks, cron, server-to-server) pass through.
export function serve(handler: Handler) {
  return stdServe(async (req) => {
    const origin = req.headers.get("origin");
    const allowed = origin !== null && isAllowedOrigin(origin);

    if (origin !== null && !allowed && req.method === "OPTIONS") {
      return new Response(null, { status: 403, headers: { Vary: "Origin" } });
    }

    const response = await handler(req);
    const headers = new Headers(response.headers);
    if (allowed) headers.set("Access-Control-Allow-Origin", origin);
    else headers.delete("Access-Control-Allow-Origin");
    headers.append("Vary", "Origin");

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });
}
