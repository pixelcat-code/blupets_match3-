// Generic, game-agnostic coachmark tour engine.
//
// A tour is an ordered list of steps. Each step spotlights a live DOM element
// (or nothing, for a centered card) and shows a tooltip with Skip / Next.
// The overlay dims the page and captures pointer events, so whatever is behind
// it is frozen until the tour ends.
//
//   runTour(steps, { onDone }) -> { stop() }
//     step = {
//       target: () => Element | null,   // resolved fresh on each show
//       title: string,
//       body: string,
//       placement?: "auto" | "top" | "bottom",  // tooltip side, default "auto"
//     }
//
// Steps whose target() returns null still show — they just render as a
// centered card with no spotlight (used for the closing summary step).

const SPOTLIGHT_PAD = 8; // px of breathing room around the highlighted element
const EDGE_MARGIN = 12; // keep the tooltip this far from the viewport edge

export function runTour(steps, { onDone } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    onDone?.();
    return { stop() {} };
  }

  let index = 0;
  let finished = false;

  // Native `title` tooltips on the HUD (the egg/reroll control, …) pop
  // up as raw OS chrome that collides with the spotlight while the tour is
  // running — the coachmark already explains each control, so the browser
  // tooltip is redundant and ugly. Park every title for the duration of the
  // tour and restore them when it ends.
  const parkedTitles = [];
  for (const el of document.querySelectorAll("[title]")) {
    parkedTitles.push([el, el.getAttribute("title")]);
    el.removeAttribute("title");
  }

  const layer = document.createElement("div");
  layer.className = "coach-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "Game guide");

  const spotlight = document.createElement("div");
  spotlight.className = "coach-spotlight";

  const tip = document.createElement("div");
  tip.className = "coach-tip";
  tip.innerHTML = `
    <div class="coach-tip-step"></div>
    <div class="coach-tip-title"></div>
    <div class="coach-tip-body"></div>
    <div class="coach-tip-actions">
      <button type="button" class="coach-skip">Skip</button>
      <button type="button" class="coach-next btn btn--primary">Next</button>
    </div>
  `;

  layer.append(spotlight, tip);

  const elStep = tip.querySelector(".coach-tip-step");
  const elTitle = tip.querySelector(".coach-tip-title");
  const elBody = tip.querySelector(".coach-tip-body");
  const btnSkip = tip.querySelector(".coach-skip");
  const btnNext = tip.querySelector(".coach-next");

  function finish() {
    if (finished) {
      return;
    }
    finished = true;
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    for (const [el, title] of parkedTitles) {
      el.setAttribute("title", title);
    }
    layer.remove();
    onDone?.();
  }

  function position() {
    const step = steps[index];
    const el = step.target?.() ?? null;
    const rect = el ? el.getBoundingClientRect() : null;
    const visible =
      rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;

    if (visible) {
      layer.classList.remove("coach-layer--centered");
      const top = rect.top - SPOTLIGHT_PAD;
      const left = rect.left - SPOTLIGHT_PAD;
      const width = rect.width + SPOTLIGHT_PAD * 2;
      const height = rect.height + SPOTLIGHT_PAD * 2;
      spotlight.style.display = "block";
      spotlight.style.top = `${top}px`;
      spotlight.style.left = `${left}px`;
      spotlight.style.width = `${width}px`;
      spotlight.style.height = `${height}px`;

      // Place the tip below the target by default, above if there's no room.
      const tipHeight = tip.offsetHeight || 160;
      const below = rect.bottom + 14;
      const wantTop = step.placement === "top";
      const fitsBelow = below + tipHeight + EDGE_MARGIN <= window.innerHeight;
      const useBelow = wantTop ? false : fitsBelow;
      tip.style.top = useBelow
        ? `${below}px`
        : `${Math.max(EDGE_MARGIN, rect.top - tipHeight - 14)}px`;

      // Horizontally center on the target, clamped to the viewport.
      const tipWidth = tip.offsetWidth || 280;
      let tipLeft = rect.left + rect.width / 2 - tipWidth / 2;
      tipLeft = Math.max(EDGE_MARGIN, Math.min(tipLeft, window.innerWidth - tipWidth - EDGE_MARGIN));
      tip.style.left = `${tipLeft}px`;
      tip.style.transform = "none";
    } else {
      // No target (or off-screen): centered card, no spotlight.
      // Center with pixel math, not a transform — the tip's pop animation ends
      // on `transform: scale(1)` with fill:both, which would override an inline
      // translate() and shove the card off-center.
      layer.classList.add("coach-layer--centered");
      spotlight.style.display = "none";
      const tipWidth = tip.offsetWidth || 300;
      const tipHeight = tip.offsetHeight || 180;
      tip.style.left = `${Math.max(EDGE_MARGIN, (window.innerWidth - tipWidth) / 2)}px`;
      tip.style.top = `${Math.max(EDGE_MARGIN, (window.innerHeight - tipHeight) / 2)}px`;
    }
  }

  function show() {
    const step = steps[index];
    const isLast = index === steps.length - 1;
    elStep.textContent = `${index + 1} / ${steps.length}`;
    elTitle.textContent = step.title ?? "";
    elBody.textContent = step.body ?? "";
    btnNext.textContent = isLast ? "Got it" : "Next →";
    // Wait a frame so tip.offsetHeight/Width are measured after content swap.
    requestAnimationFrame(position);
  }

  function next() {
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    index += 1;
    show();
  }

  btnNext.addEventListener("click", next);
  btnSkip.addEventListener("click", finish);
  // Clicking the dimmed backdrop (not the tip) does nothing — keep the tour
  // deliberate. Escape closes it.
  layer.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      finish();
    }
  });

  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);

  document.body.appendChild(layer);
  show();
  btnNext.focus();

  return { stop: finish };
}
