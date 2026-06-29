// Real SFX + background music for Blupets Match-3, using the same audio assets
// as blupix.app (downloaded into assets/audio/). Sounds are short .wav one-shots
// decoded into Web Audio buffers so rapid repeats overlap cleanly and mobile
// browsers do not block them separately from the music context.
//
// Background music uses Web Audio API (AudioContext + BufferSourceNode) instead
// of HTMLAudioElement. HTMLAudioElement registers an iOS media session which
// surfaces a lock-screen / control-center player widget; AudioContext does not.

const AUDIO_BASE = "./assets/audio/";
const MUTE_KEY = "blupets-muted-v1";

// Event → file(s). Arrays rotate through variants so repeats don't feel robotic.
const SFX = {
  swap: ["nav-click-01.wav", "nav-click-02.wav", "nav-click-03.wav", "nav-click-04.wav", "nav-click-05.wav"],
  ui: ["inventory-select-01.wav", "inventory-select-02.wav", "inventory-select-03.wav"],
  invalid: ["modal-close.wav"],
  match: ["block-heavy-hit.wav"],
  cascade: ["block-heavy-hit.wav"],
  crossCreate: ["inventory-select-01.wav"],
  bombCreate: ["modal-open.wav"],
  crossTrigger: ["nav-click-05.wav"],
  bombTrigger: ["block-heavy-hit.wav"],
  evolve: ["modal-open.wav"],
  victory: ["reveal-transition.wav"],
  // Combo feedback — reuse existing assets mapped to praise tiers
  praise1: ["nav-click-01.wav"],
  praise2: ["inventory-select-01.wav", "inventory-select-02.wav"],
  praise3: ["inventory-select-03.wav"],
  praise4: ["modal-open.wav"],
};

const GAIN = {
  swap: 0.5,
  ui: 0.6,
  invalid: 0.6,
  match: 0.55,
  cascade: 0.5,
  crossCreate: 0.5,
  bombCreate: 0.62,
  crossTrigger: 0.58,
  bombTrigger: 0.72,
  evolve: 0.7,
  victory: 0.9,
  praise1: 0.30,
  praise2: 0.45,
  praise3: 0.55,
  praise4: 0.70,
};

const MUSIC_FILE = "site-background.mp3";
const IS_TOUCH_AUDIO_DEVICE = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches;
const MUSIC_VOLUME = IS_TOUCH_AUDIO_DEVICE ? 0.12 : 0.18;
const CASCADE_MATCH_PITCH_STEPS = [1, 1.12, 1.26, 1.41, 1.59, 1.78];

const SOUND_DESIGN = {
  match: [
    { files: ["block-heavy-hit.wav"], gain: 0.46, rate: (depth) => 1 + Math.min(depth, 5) * 0.025 },
    { files: ["inventory-select-01.wav", "inventory-select-02.wav", "inventory-select-03.wav"], gain: (depth) => depth > 0 ? 0.12 : 0.06, rate: cascadePitch, delay: 18 },
  ],
  cascade: [
    { files: ["block-heavy-hit.wav"], gain: 0.4, rate: (depth) => 1 + Math.min(depth, 5) * 0.025 },
    { files: ["inventory-select-01.wav", "inventory-select-02.wav", "inventory-select-03.wav"], gain: 0.12, rate: cascadePitch, delay: 18 },
  ],
  swap: [
    { files: ["nav-click-01.wav", "nav-click-02.wav", "nav-click-03.wav", "nav-click-04.wav", "nav-click-05.wav"], gain: 0.46, rate: 1.08 },
  ],
  invalid: [
    { files: ["modal-close.wav"], gain: 0.72, rate: 0.86 },
  ],
  ui: [
    { files: ["inventory-select-01.wav", "inventory-select-02.wav", "inventory-select-03.wav"], gain: 0.6, rate: 1.04 },
  ],
  crossCreate: [
    { files: ["nav-click-03.wav"], gain: 0.32, rate: 1.35 },
    { files: ["nav-click-04.wav"], gain: 0.3, rate: 1.6, delay: 24 },
    { files: ["inventory-select-02.wav"], gain: 0.28, rate: 1.22, delay: 48 },
  ],
  bombCreate: [
    { files: ["modal-open.wav"], gain: 0.58, rate: 0.88 },
    { files: ["inventory-select-03.wav"], gain: 0.34, rate: 1.26, delay: 42 },
  ],
  crossTrigger: [
    { files: ["nav-click-05.wav"], gain: 0.38, rate: 1.7 },
    { files: ["inventory-select-01.wav"], gain: 0.34, rate: 1.4, delay: 18 },
    { files: ["nav-click-02.wav"], gain: 0.28, rate: 1.15, delay: 42 },
  ],
  bombTrigger: [
    { files: ["block-heavy-hit.wav"], gain: 0.82, rate: 0.82 },
    { files: ["modal-close.wav"], gain: 0.34, rate: 0.72, delay: 28 },
  ],
  evolve: [
    { files: ["modal-open.wav"], gain: 0.72, rate: 1 },
    { files: ["rare-hatch.wav"], gain: 0.42, rate: 1.06, delay: 70 },
  ],
  victory: [
    { files: ["reveal-transition.wav"], gain: 0.9, rate: 1 },
    { files: ["rare-hatch.wav"], gain: 0.52, rate: 1.12, delay: 120 },
  ],
  praise1: [
    { files: ["nav-click-01.wav"], gain: 0.34, rate: 1.15 },
  ],
  praise2: [
    { files: ["inventory-select-01.wav", "inventory-select-02.wav"], gain: 0.48, rate: 1.18 },
  ],
  praise3: [
    { files: ["inventory-select-03.wav"], gain: 0.46, rate: 1.28 },
    { files: ["nav-click-05.wav"], gain: 0.28, rate: 1.62, delay: 28 },
    { files: ["inventory-select-02.wav"], gain: 0.22, rate: 1.42, delay: 54 },
  ],
  praise4: [
    { files: ["modal-open.wav"], gain: 0.68, rate: 1.12 },
    { files: ["rare-hatch.wav"], gain: 0.34, rate: 1.28, delay: 60 },
  ],
};

let muted = false;
try {
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // localStorage unavailable — default to unmuted.
}

let unlocked = false;
const rotators = {};
const basePool = {}; // one preloaded Audio per file, cloned on play
const sfxBuffers = {};
const sfxPending = {};
let lastSfxAt = 0;

// ── Web Audio API — background music ────────────────────────────────────────
let audioCtx = null;
let musicBuffer = null; // decoded PCM, reused across plays
let musicPending = null; // in-flight fetch+decode Promise (dedupes concurrent loads)
let musicSource = null; // current BufferSourceNode (single-use)
let musicGain = null;
let musicDesired = false;

function getCtx() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

async function loadMusicBuffer() {
  if (musicBuffer) return musicBuffer;
  // Dedupe concurrent callers: unlockAudio and startMusic both call this within
  // the same gesture, and the music file is ~5.5MB — without an in-flight guard
  // each call kicks off its own download, saturating the connection.
  if (musicPending) return musicPending;
  const ctx = getCtx();
  musicPending = (async () => {
    try {
      const res = await fetch(AUDIO_BASE + MUSIC_FILE);
      const raw = await res.arrayBuffer();
      musicBuffer = await ctx.decodeAudioData(raw);
      return musicBuffer;
    } finally {
      musicPending = null;
    }
  })();
  return musicPending;
}
// ────────────────────────────────────────────────────────────────────────────

async function loadSfxBuffer(file) {
  if (sfxBuffers[file]) return sfxBuffers[file];
  if (sfxPending[file]) return sfxPending[file];
  const ctx = getCtx();
  sfxPending[file] = (async () => {
    try {
      const res = await fetch(AUDIO_BASE + file);
      const raw = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(raw);
      sfxBuffers[file] = buffer;
      return buffer;
    } finally {
      delete sfxPending[file];
    }
  })();
  return sfxPending[file];
}

function allSfxFiles() {
  const files = new Set();
  for (const group of Object.values(SFX)) {
    for (const file of group) files.add(file);
  }
  for (const layers of Object.values(SOUND_DESIGN)) {
    for (const layer of layers) {
      for (const file of layer.files) files.add(file);
    }
  }
  return [...files];
}

function audioFor(file) {
  if (!basePool[file]) {
    const el = new Audio(AUDIO_BASE + file);
    el.preload = "auto";
    basePool[file] = el;
  }
  return basePool[file];
}

// Warm the browser cache without decoding every SFX buffer during the first
// interaction. WebAudio buffers load on demand in playOneShot().
function preloadAll() {
  for (const file of allSfxFiles()) {
    audioFor(file).load();
  }
}

export function unlockAudio() {
  if (unlocked) {
    return;
  }
  unlocked = true;
  // iOS requires AudioContext to be created/resumed inside a user gesture.
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  // iOS Safari quirk: resume() alone doesn't reliably arm the audio session, so
  // the background music — whose source starts later, after its buffer finishes
  // loading and thus OUTSIDE this gesture — never becomes audible on the start
  // screen. Playing one silent 1-sample buffer synchronously inside the gesture
  // fully unlocks Web Audio output, so any source started afterward is audible.
  try {
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, 22050);
    silent.connect(ctx.destination);
    silent.start(0);
  } catch {
    // Older WebAudio implementations — resume() above is the fallback.
  }
  // Warm the music buffer too (preloadAll only covers SFX) so start-screen
  // ambience starts as soon as possible after the first tap instead of waiting
  // on a multi-megabyte fetch.
  loadMusicBuffer().catch(() => {});
  preloadAll();
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore storage failures — in-memory flag still applies this session.
  }
  if (muted) {
    stopMusic();
  } else {
    unlockAudio();
  }
  return muted;
}

function stopCurrentMusic() {
  const source = musicSource;
  musicSource = null;
  if (source) {
    try {
      source.onended = null;
      source.stop();
    } catch {}
  }
  if (musicGain) {
    try { musicGain.disconnect(); } catch {}
    musicGain = null;
  }
}

function cascadePitch(depth = 0) {
  const safeDepth = Math.max(0, Math.floor(Number(depth) || 0));
  return CASCADE_MATCH_PITCH_STEPS[Math.min(safeDepth, CASCADE_MATCH_PITCH_STEPS.length - 1)];
}

function valueFor(value, depth, fallback) {
  if (typeof value === "function") {
    return value(depth);
  }
  return value ?? fallback;
}

function nextFileFor(name, files) {
  const key = `${name}:${files.join("|")}`;
  const idx = (rotators[key] = (rotators[key] ?? -1) + 1) % files.length;
  return files[idx];
}

function playOneShot(file, gain, rate) {
  const safeGain = Math.max(0, Math.min(1, gain));
  const safeRate = Math.max(0.25, Math.min(4, rate));
  if (audioCtx && audioCtx.state === "running") {
    loadSfxBuffer(file)
      .then((buffer) => {
        if (muted || !audioCtx || audioCtx.state !== "running") return;
        const source = audioCtx.createBufferSource();
        const gainNode = audioCtx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = safeRate;
        gainNode.gain.value = safeGain;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        source.onended = () => {
          try { source.disconnect(); } catch {}
          try { gainNode.disconnect(); } catch {}
        };
        source.start();
      })
      .catch(() => playHtmlAudioOneShot(file, safeGain, safeRate));
    return;
  }
  playHtmlAudioOneShot(file, safeGain, safeRate);
}

function playHtmlAudioOneShot(file, gain, rate) {
  const node = audioFor(file).cloneNode();
  node.volume = gain;
  node.playbackRate = rate;
  const played = node.play();
  if (played && typeof played.catch === "function") {
    played.catch(() => {});
  }
}

function playDesignedSfx(name, depth = 0) {
  const design = SOUND_DESIGN[name];
  if (!design) {
    return false;
  }
  for (const layer of design) {
    const file = nextFileFor(name, layer.files);
    const gain = valueFor(layer.gain, depth, GAIN[name] ?? 0.6);
    const rate = valueFor(layer.rate, depth, 1);
    const delay = Math.max(0, Number(layer.delay) || 0);
    if (delay > 0) {
      window.setTimeout(() => {
        if (!muted) {
          try { playOneShot(file, gain, rate); } catch {}
        }
      }, delay);
    } else {
      playOneShot(file, gain, rate);
    }
  }
  return true;
}

export function sfx(name, depth = 0) {
  if (muted) {
    return;
  }
  const files = SFX[name];
  if (!files || files.length === 0) {
    return;
  }
  const now = performance.now();
  if (name === "ui" && now - lastSfxAt < 90) {
    return;
  }
  lastSfxAt = now;
  try {
    if (playDesignedSfx(name, depth)) {
      return;
    }
  } catch {
    // Fall back to the simple one-shot path below.
  }
  // Rotate through variants for this event.
  const idx = (rotators[name] = (rotators[name] ?? -1) + 1) % files.length;
  const file = files[idx];
  try {
    playOneShot(file, GAIN[name] ?? 0.6, name === "match" || name === "cascade" ? cascadePitch(depth) : 1);
  } catch {
    // Autoplay blocked until a gesture, or asset missing — fail silently.
  }
}

// Looping ambient track — uses AudioContext so iOS won't register a media
// session and show the lock-screen / control-center player widget.
export async function startMusic() {
  musicDesired = true;
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch { return; }
  }
  if (musicSource) return; // already playing
  try {
    const buffer = await loadMusicBuffer();
    if (musicSource || muted || !musicDesired) return; // re-check after async load
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    source.onended = () => {
      if (musicSource === source) {
        musicSource = null;
        if (musicDesired && !muted && !document.hidden) {
          startMusic();
        }
      }
    };
    musicSource = source;
    source.start();
  } catch {
    // Asset missing or autoplay blocked — fail silently.
  }
}

export function isMusicPlaying() {
  return musicSource !== null;
}

export function stopMusic() {
  musicDesired = false;
  stopCurrentMusic();
}

// Mobile browsers can interrupt Web Audio sources when the tab/app is hidden
// and then leave AudioContext in a resumed-but-silent state. Treat visibility as
// a hard boundary: stop the single-use BufferSource while hidden, then create a
// fresh loop when the page becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (!audioCtx) return;
  if (document.hidden) {
    stopCurrentMusic();
    audioCtx.suspend().catch(() => {});
  } else if (musicDesired && !muted) {
    startMusic();
  }
});

window.addEventListener("pagehide", () => {
  stopCurrentMusic();
});

window.addEventListener("pageshow", () => {
  if (musicDesired && !muted) {
    startMusic();
  }
});

// Haptic feedback. Android Chrome honors this; iOS Safari ignores it silently.
export function buzz(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw without a user gesture — ignore.
    }
  }
}
