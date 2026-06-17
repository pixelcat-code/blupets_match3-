// Real SFX + background music for Blupets Match-3, using the same audio assets
// as blupix.app (downloaded into assets/audio/). Sounds are short .wav one-shots
// played via cloned HTMLAudio nodes so rapid repeats overlap cleanly. The start
// screen loops site-background.mp3 as ambient music, just like the site.

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
  hatch: ["rare-hatch.wav"],
  victory: ["reveal-transition.wav"],
  reroll: ["block-stone-lift.wav"],
};

const GAIN = {
  swap: 0.5,
  ui: 0.6,
  invalid: 0.6,
  match: 0.55,
  cascade: 0.5,
  evolve: 0.7,
  hatch: 0.8,
  victory: 0.9,
  reroll: 0.6,
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
let music = null;

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

// Looping ambient track for the start screen.
export function startMusic() {
  if (muted) {
    return;
  }
  try {
    if (!music) {
      music = new Audio(AUDIO_BASE + MUSIC_FILE);
      music.loop = true;
      music.volume = MUSIC_VOLUME;
    }
    const played = music.play();
    if (played && typeof played.catch === "function") {
      played.catch(() => {});
    }
  } catch {
    // Autoplay policy — will start on the next user gesture instead.
  }
}

export function stopMusic() {
  if (music) {
    music.pause();
    try {
      music.currentTime = 0;
    } catch {
      // ignore
    }
  }
}

// Pause music when the tab is hidden (lock screen, app switch, other tab) and
// resume when the user comes back — prevents music bleeding into the background.
let _musicWasPlaying = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    _musicWasPlaying = music !== null && !music.paused;
    if (_musicWasPlaying) music.pause();
  } else if (_musicWasPlaying && !muted) {
    const p = music.play();
    if (p?.catch) p.catch(() => {});
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
