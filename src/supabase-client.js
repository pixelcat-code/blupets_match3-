const SUPABASE_BROWSER_BUNDLE = "../vendor/supabase-js-2.108.2.js";

let _clientPromise = null;

export function getSupabaseConfig() {
  const config = window.BLUPETS_AUTH_CONFIG ?? {};
  const supabaseUrl = String(config.supabaseUrl ?? "").trim();
  const supabaseAnonKey = String(config.supabaseAnonKey ?? "").trim();
  return { supabaseUrl, supabaseAnonKey, configured: Boolean(supabaseUrl && supabaseAnonKey) };
}

export async function getSupabaseClient() {
  const { supabaseUrl, supabaseAnonKey, configured } = getSupabaseConfig();
  if (!configured) throw new Error("Supabase is not configured.");
  if (!_clientPromise) {
    _clientPromise = import(SUPABASE_BROWSER_BUNDLE).then(({ createClient }) =>
      createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      }),
    );
  }
  return _clientPromise;
}
