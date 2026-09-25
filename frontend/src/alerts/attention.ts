import { isNative } from "../native/platform";

/**
 * Getting someone's attention when the app is in the background: a chime, a
 * desktop notification (the Windows toast, which also lights the browser up in
 * the taskbar) and a blinking tab title.
 *
 * Browsers only allow sound and the permission prompt after the person has
 * interacted with the page, so installAttention() waits for the first click or
 * key press to unlock audio and ask for the permission once.
 */

const SOUND_KEY = "sound";

export function isSoundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}

let audio: AudioContext | null = null;

function audioContext() {
  if (!audio) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

/**
 * Synthesised rather than an audio file: nothing to ship or cache, and it plays
 * in the Android WebView the same way.
 */
export function playChime(kind: "notification" | "urgent" = "notification") {
  if (!isSoundOn()) return;
  const ctx = audioContext();
  if (!ctx) return;

  const notes = kind === "urgent" ? [880, 660, 880, 660] : [660, 990];
  const step = kind === "urgent" ? 0.18 : 0.14;
  const start = ctx.currentTime + 0.02;

  notes.forEach((frequency, index) => {
    const at = start + index * step;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + step * 0.95);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + step);
  });
}

/** The WebView has no Notification API; the app would need a native plugin. */
function canNotify() {
  return !isNative() && typeof Notification !== "undefined";
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return canNotify() ? Notification.permission : "unsupported";
}

export async function requestNotificationPermission() {
  if (!canNotify() || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // Old Safari only has the callback form; not worth supporting.
  }
}

/**
 * Only while the page is not in view: with the tab in front the bell and the
 * dialog already say it, and a toast on top would be noise.
 */
export function showDesktopNotification(
  title: string,
  body: string,
  options: { tag?: string; urgent?: boolean; onClick?: () => void } = {}
) {
  if (!canNotify() || Notification.permission !== "granted") return null;
  if (!options.urgent && document.visibilityState === "visible" && document.hasFocus()) return null;

  try {
    const notification = new Notification(title, {
      body,
      tag: options.tag,
      icon: "/favicon.svg",
      // An urgent one stays on screen until it is dealt with.
      requireInteraction: options.urgent ?? false,
    });
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
    return notification;
  } catch {
    return null;
  }
}

let flashTimer: ReturnType<typeof setInterval> | null = null;
let originalTitle = "";

export function stopTitleFlash() {
  if (flashTimer) clearInterval(flashTimer);
  flashTimer = null;
  if (originalTitle) document.title = originalTitle;
  originalTitle = "";
}

/** Blinks the tab title until the page is looked at again. */
export function flashTitle(text: string) {
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  stopTitleFlash();
  originalTitle = document.title;
  let on = false;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? text : originalTitle;
  }, 1000);
}

let installed = false;

/** Call once from the authenticated layout. */
export function installAttention() {
  if (installed) return;
  installed = true;

  const unlock = () => {
    audioContext();
    void requestNotificationPermission();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  window.addEventListener("focus", stopTitleFlash);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") stopTitleFlash();
  });
}
