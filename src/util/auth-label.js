// Shared display-name shortener for auth labels, extracted from main.js.
// Pure string util with no dependencies: trims, strips a synthetic email's
// local part, and truncates long names. Used by the auth chip, the profile
// header, and the account section.
export function shortAuthLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Player";
  }
  if (label.includes("@")) {
    return label.split("@")[0] || label;
  }
  return label.length > 18 ? `${label.slice(0, 16)}...` : label;
}
