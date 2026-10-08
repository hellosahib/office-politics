// Sound effects, all synthesised with the Web Audio API (no audio files).
// The AudioContext is created/resumed on the first user gesture (autoplay rules): nothing plays before.
// Mute is per device (localStorage 'op:muted'), default sound ON. A global throttle keeps a bot's
// rapid actions to ~4 sounds per second.

export type Sfx = 'click' | 'deal' | 'play' | 'success' | 'strong' | 'fail' | 'flip' | 'vote' | 'sting'
  | 'capture' | 'rebel' | 'turn' | 'end' | 'pop';

const KEY = 'op:muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })(); // no storage (Node/private): sound on
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const recent: number[] = [];

export const isMuted = () => muted;
export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* private mode: session only */ }
  if (!muted) { unlock(); play('click'); }
  return muted;
}
/** 🔊 / 🔇 button; `act` is the data-act its screen handles with toggleMute(). */
export const muteButton = (act = 'mute', cls = 'icon-btn') =>
  `<button type="button" class="${cls} mute-btn" data-act="${act}" aria-pressed="${muted}" aria-label="${muted ? 'Sound off' : 'Sound on'}" title="${muted ? 'Sound off' : 'Sound on'}">${muted ? '🔇' : '🔊'}</button>`;

function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
// First gesture creates the context; later gestures resume it if the browser suspended it.
// Soft click for every button press (lobby and game alike). (Guarded: tests import UI modules in Node.)
if (typeof window !== 'undefined') {
  for (const t of ['pointerdown', 'keydown'] as const) window.addEventListener(t, unlock, { capture: true, passive: true });
  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], summary');
    if (b && !(b as HTMLButtonElement).disabled) play('click');
  }, true);
}

/** One enveloped oscillator note. t = seconds from now. */
function tone(f: number, t: number, dur: number, o: { type?: OscillatorType; gain?: number; to?: number; attack?: number } = {}): void {
  const c = ctx!, at = c.currentTime + t;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, at);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur);
  const a = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.5, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(master!);
  osc.start(at); osc.stop(at + dur + 0.02);
}
/** Band-passed noise burst sweeping f → to (whoosh / swish). */
function hiss(f: number, to: number, t: number, dur: number, gain = 0.4): void {
  const c = ctx!, at = c.currentTime + t;
  const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noise;
  bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(f, at); bp.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(at, Math.random() * 0.5); src.stop(at + dur + 0.02);
}
const chord = (fs: number[], t: number, dur: number, type: OscillatorType = 'triangle', gain = 0.22) => fs.forEach(f => tone(f, t, dur, { type, gain }));

// C major-ish palette (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, G4 = 392, E4 = 329.63;

const SFX: Record<Sfx, () => void> = {
  click: () => tone(1800, 0, 0.035, { gain: 0.12, to: 1200 }),
  deal: () => hiss(1800, 4200, 0, 0.09, 0.25),
  play: () => { hiss(700, 3200, 0, 0.26, 0.45); tone(300, 0.02, 0.18, { type: 'triangle', gain: 0.12, to: 600 }); },
  success: () => { tone(C5, 0, 0.18, { type: 'triangle', gain: 0.4 }); tone(G5, 0.12, 0.32, { type: 'triangle', gain: 0.4 }); },
  strong: () => {
    [C5, E5, G5].forEach((f, i) => tone(f, i * 0.09, 0.2, { type: 'triangle', gain: 0.35 }));
    chord([C5, E5, G5, C6], 0.3, 0.9);
    tone(C6 * 2, 0.3, 0.6, { gain: 0.06 });
  },
  fail: () => { tone(G4, 0, 0.22, { type: 'sawtooth', gain: 0.12, to: 370 }); tone(E4, 0.2, 0.38, { type: 'sawtooth', gain: 0.12, to: 196 }); },
  flip: () => { hiss(1200, 2600, 0, 0.12, 0.3); tone(1400, 0.1, 0.05, { type: 'square', gain: 0.05 }); },
  vote: () => { tone(900, 0, 0.03, { type: 'square', gain: 0.1 }); tone(1350, 0.04, 0.05, { type: 'square', gain: 0.08 }); },
  sting: () => { chord([A4, C5, E5], 0, 0.45, 'triangle', 0.18); tone(A4 / 2, 0, 0.5, { gain: 0.25 }); },
  capture: () => {
    [G4, C5, E5, G5].forEach((f, i) => tone(f, i * 0.1, 0.22, { type: 'square', gain: 0.1 }));
    chord([C5, E5, G5, C6], 0.42, 1.0, 'triangle', 0.2);
  },
  rebel: () => { tone(110, 0, 0.18, { type: 'square', gain: 0.18, to: 98 }); tone(110, 0.24, 0.22, { type: 'square', gain: 0.18, to: 82 }); },
  turn: () => { tone(880, 0, 0.6, { gain: 0.25, attack: 0.004 }); tone(2640, 0, 0.35, { gain: 0.05, attack: 0.004 }); },
  end: () => {
    [C5, E5, G5, E5, G5, C6].forEach((f, i) => tone(f, i * 0.13, 0.22, { type: 'triangle', gain: 0.3 }));
    chord([C5, G5, C6], 0.8, 0.6, 'triangle', 0.18);
  },
  pop: () => tone(420, 0, 0.09, { gain: 0.3, to: 980 }),
};

/** Plays a sound unless muted, before the first gesture, or over the ~4/s throttle. */
export function play(name: Sfx): void {
  if (muted || !ctx || !master || ctx.state !== 'running') return;
  if (name !== 'click') { // clicks are the viewer's own, never a bot's: not throttled
    const now = performance.now();
    while (recent.length && now - recent[0] > 1000) recent.shift();
    if (recent.length >= 4) return;
    recent.push(now);
  }
  if (import.meta.env.DEV) console.info(`[sound] ${name}`);
  SFX[name]();
}
