// HTML/CSS injection guards shared across the UI controller.
//
// These are pure string helpers (no DOM, no app state) extracted from main.js
// so the security-sensitive escaping lives in one small, reviewable unit.

export function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
}

export function safeImgSrc(raw) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    // Return the normalized href, not the raw string: new URL() accepts
    // `"`, `<`, `>` in the path and only percent-encodes them in .href.
    // Returning raw would let those characters break out of an HTML attribute.
    return url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

export function safeCssUrl(raw) {
  const src = safeImgSrc(raw);
  return src ? `url("${src.replace(/["'()\\]/g, "")}")` : "";
}
