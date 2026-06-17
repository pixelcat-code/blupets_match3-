const STATIC_CORS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

// Origins allowed to call the state-changing edge functions. Configure in
// production via the ALLOWED_ORIGINS env var (comma-separated). The defaults
// cover local + LAN testing. We never reflect an arbitrary Origin back.
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "http://10.1.1.168:4174",
];

function allowedOrigins(): string[] {
  const fromEnv = Deno.env.get("ALLOWED_ORIGINS");
  if (fromEnv) {
    return fromEnv.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allow = allowedOrigins();
  // Echo the request origin only if allow-listed; otherwise fall back to the
  // first configured origin so the browser blocks the disallowed caller.
  const allowOrigin = allow.includes(origin) ? origin : (allow[0] ?? "");
  return { "Access-Control-Allow-Origin": allowOrigin, ...STATIC_CORS };
}

export function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim();
}
