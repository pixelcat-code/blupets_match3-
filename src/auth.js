import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260617-1";

let authSubscription = null;

function labelForUser(user) {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  return (
    meta.full_name ||
    meta.name ||
    meta.preferred_username ||
    meta.user_name ||
    user.email ||
    user.id
  );
}

function avatarForUser(user) {
  const meta = user?.user_metadata ?? {};
  return meta.avatar_url || meta.picture || "";
}

function toState({ configured, loading = false, user = null, error = "" }) {
  return {
    configured,
    loading,
    user,
    label: labelForUser(user),
    avatarUrl: avatarForUser(user),
    error,
  };
}

function getRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("demo");
  return url.toString();
}

export async function initAuth({ onChange } = {}) {
  const { configured } = getSupabaseConfig();
  if (!configured) return toState({ configured: false });

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    authSubscription?.unsubscribe?.();
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      onChange?.(toState({ configured: true, user: session?.user ?? null }));
    });
    authSubscription = subscription.data?.subscription ?? subscription;

    return toState({ configured: true, user: data.session?.user ?? null });
  } catch (error) {
    return toState({
      configured: true,
      error: error?.message || "Auth failed to initialize.",
    });
  }
}

export async function signInWithProvider(provider) {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: getRedirectUrl() },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
