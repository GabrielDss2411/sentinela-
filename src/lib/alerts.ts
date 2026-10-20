// Browser feedback channels used by the proximity monitor. All of them fail
// silently: unsupported APIs or blocked permissions must never break the map.

let audioCtx: AudioContext | null = null;

/** Must run inside a user gesture at least once, or browsers keep audio muted. */
export function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* no audio */
  }
}

export function beep(times = 3) {
  try {
    unlockAudio();
    if (!audioCtx) return;
    for (let i = 0; i < times; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      const t = audioCtx.currentTime + i * 0.34;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      osc.start(t);
      osc.stop(t + 0.28);
    }
  } catch {
    /* no audio */
  }
}

export function vibrate(level: 1 | 2) {
  try {
    navigator.vibrate?.(level === 2 ? [300, 120, 300, 120, 300] : [220, 100, 220]);
  } catch {
    /* unsupported */
  }
}

export function speak(text: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* unsupported */
  }
}

export function cancelSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* unsupported */
  }
}

/** Keeps the screen on while monitoring; the browser pauses GPS when it sleeps. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return 'wakeLock' in navigator ? await navigator.wakeLock.request('screen') : null;
  } catch {
    return null;
  }
}
