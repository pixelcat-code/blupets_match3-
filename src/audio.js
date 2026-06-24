// Real SFX + background music for Blupets Match-3, using the same audio assets
// as blupix.app (downloaded into assets/audio/). Sounds are short .wav one-shots
// played via cloned HTMLAudio nodes so rapid repeats overlap cleanly.
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
  cascade: ["block-stone-lift.wav"],
  evolve: ["modal-open.wav"],
  victory: ["reveal-transition.wav"],
};

const GAIN = {
  swap: 0.5,
  ui: 0.6,
  invalid: 0.6,
  match: 0.55,
  cascade: 0.5,
  evolve: 0.7,
  victory: 0.9,
};

const MUSIC_FILE = "site-background.mp3";
const MUSIC_VOLUME = 0.3;

let muted = false;
try {
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // localStorage unavailable — default to unmuted.
}

let unlocked = false;
const rotators = {};
const basePool = {}; // one preloaded Audio per file, cloned on play
let lastSfxAt = 0;

// ── Web Audio API — background music ────────────────────────────────────────
let audioCtx = null;
let musicBuffer = null; // decoded PCM, reused across plays
let musicPending = null; // in-flight fetch+decode Promise (dedupes concurrent loads)
let musicSource = null; // current BufferSourceNode (single-use)
let musicGain = null;
let _musicWasPlaying = false;

function getCtx() {
  if (!audioCtx) {
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

function audioFor(file) {
  if (!basePool[file]) {
    const el = new Audio(AUDIO_BASE + file);
    el.preload = "auto";
    basePool[file] = el;
  }
  return basePool[file];
}

// Warm the cache so the first real interaction isn't silent.
function preloadAll() {
  for (const files of Object.values(SFX)) {
    for (const file of files) {
      audioFor(file).load();
    }
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

export function sfx(name) {
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
  // Rotate through variants for this event.
  const idx = (rotators[name] = (rotators[name] ?? -1) + 1) % files.length;
  const file = files[idx];
  try {
    const node = audioFor(file).cloneNode();
    node.volume = GAIN[name] ?? 0.6;
    const played = node.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {});
    }
  } catch {
    // Autoplay blocked until a gesture, or asset missing — fail silently.
  }
}

// Looping ambient track — uses AudioContext so iOS won't register a media
// session and show the lock-screen / control-center player widget.
export async function startMusic() {
  if (muted) return;
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    try { await ctx.resume(); } catch { return; }
  }
  if (musicSource) return; // already playing
  try {
    const buffer = await loadMusicBuffer();
    if (musicSource || muted) return; // re-check after async load
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(ctx.destination);
    musicSource = ctx.createBufferSource();
    musicSource.buffer = buffer;
    musicSource.loop = true;
    musicSource.connect(musicGain);
    musicSource.start();
  } catch {
    // Asset missing or autoplay blocked — fail silently.
  }
}

export function isMusicPlaying() {
  return musicSource !== null;
}

export function stopMusic() {
  if (musicSource) {
    try { musicSource.stop(); } catch {}
    musicSource = null;
  }
}

// Suspend the AudioContext when the tab/app is hidden (lock screen, app switch,
// other tab) — this freezes all Web Audio output without unregistering the
// context, so resume() picks up exactly where it left off.
document.addEventListener("visibilitychange", () => {
  if (!audioCtx) return;
  if (document.hidden) {
    _musicWasPlaying = musicSource !== null;
    if (_musicWasPlaying) audioCtx.suspend().catch(() => {});
  } else if (_musicWasPlaying && !muted) {
    audioCtx.resume().catch(() => {});
    _musicWasPlaying = false;
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
