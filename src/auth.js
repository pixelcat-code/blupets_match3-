import { getSupabaseClient, getSupabaseConfig } from "./supabase-client.js?v=20260629-client-singleton-1";

let authSubscription = null;

function labelForUser(user) {
  if (!user) return "";
  const meta = user.user_metadata ?? {};
  const email = user.email;
  const visibleEmail = email && !email.endsWith("@players.blupets.game") ? email : null;
  return (
    meta.display_name ||
    meta.full_name ||
    meta.name ||
    meta.preferred_username ||
    meta.user_name ||
    visibleEmail ||
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

function usernameToEmail(username) {
  const slug = username.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  return `${slug}@players.blupets.game`;
}

export async function signInWithUsername(username, password) {
  const slug = (username ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  if (!slug) throw new Error("Username must contain letters or numbers.");
  const client = await getSupabaseClient();
  const { error } = await client.auth.signInWithPassword({
    email: `${slug}@players.blupets.game`,
    password,
  });
  if (error) throw error;
}

export async function signUpWithUsername(username, password) {
  const slug = username.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  if (!slug) throw new Error("Username must contain letters or numbers.");
  const client = await getSupabaseClient();
  const { error } = await client.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { display_name: username } },
  });
  if (error) throw error;
}

export async function updateDisplayName(name) {
  const client = await getSupabaseClient();
  const { error } = await client.auth.updateUser({ data: { display_name: name.trim() } });
  if (error) throw error;
}

export async function uploadAvatar(file, userId) {
  if (!file || !userId) throw new Error("Invalid params");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const client = await getSupabaseClient();
  const { error } = await client.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data: { publicUrl } } = client.storage.from("avatars").getPublicUrl(path);
  return `${publicUrl}?v=${Date.now()}`;
}

export async function updateAvatarUrl(url) {
  const client = await getSupabaseClient();
  const { error } = await client.auth.updateUser({ data: { avatar_url: url } });
  if (error) throw error;
}

export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
