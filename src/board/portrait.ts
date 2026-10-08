// Procedural "personnel card" portraits (D20 follow-up). No art assets: every character is drawn
// with canvas primitives from a deterministic hash of the employee id, with outfit/accessory/prop
// hints read from the §76 visual-identity string. Used by the board (texture atlas) and the
// employee dossier (data URL), so both always show the same face.

export interface PortraitSubject { id: string; name: string; deptId: string; visual: string }

export const PORTRAIT_W = 256, PORTRAIT_H = 320;

/** FNV-1a, good enough to spread 28 ids over a handful of palette slots. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = <T>(xs: readonly T[], h: number, salt: number) => xs[((h >>> (salt * 3)) ^ (h >>> 17)) % xs.length];

const SKIN = ['#6f4631', '#8a5a3c', '#a46a47', '#bd8460', '#d29d78', '#e2b894'] as const;
const HAIR = ['#17110e', '#241912', '#33241a', '#47321f', '#5d4330', '#6b6a70'] as const;
const SHIRT = ['#3b5675', '#6f4436', '#2e6458', '#56497a', '#7f6537', '#3f4d63', '#743a48', '#2b3d55', '#4b5e3c'] as const;
/** Department backdrop hue (muted), so a card reads as "Finance" at a glance. */
export const DEPT_TINT: Record<string, string> = {
  engineering: '#30465f', product: '#2b5452', sales: '#5c3a30', marketing: '#5a3550',
  finance: '#33503a', operations: '#5a4a2a', people: '#45395e',
};

type Prop = 'keyboard' | 'calculator' | 'camera' | 'pencil' | 'tablet' | 'monitors' | 'binder' | 'planner' | 'kanban'
  | 'phone' | 'bag' | 'checklist' | 'grid' | 'chart' | 'deck' | 'screen' | 'folder' | 'coffee' | 'laptop' | 'notebook';
// First matching keyword wins, in this order.
const PROP_RULES: [RegExp, Prop][] = [
  [/keyboard/i, 'keyboard'], [/calculator/i, 'calculator'], [/camera/i, 'camera'], [/sketch/i, 'pencil'],
  [/tablet/i, 'tablet'], [/monitor/i, 'monitors'], [/binder/i, 'binder'], [/planner/i, 'planner'],
  [/operations board/i, 'kanban'], [/tripod|phone,|and phone|smartphone/i, 'phone'], [/bag/i, 'bag'],
  [/list/i, 'checklist'], [/spreadsheet/i, 'grid'], [/dashboard/i, 'chart'], [/deck/i, 'deck'],
  [/screen/i, 'screen'], [/folder|sheets/i, 'folder'], [/coffee/i, 'coffee'], [/laptop/i, 'laptop'], [/notebook/i, 'notebook'],
];
export const propFor = (visual: string): Prop => PROP_RULES.find(([re]) => re.test(visual))?.[1] ?? 'notebook';

export interface Look {
  skin: string; hair: string; shirt: string; tint: string;
  hairStyle: number; glasses: boolean; outfit: 'shirt' | 'blazer' | 'hoodie';
  ears: 'none' | 'headphones' | 'headset'; badge: boolean; watch: boolean; prop: Prop; relaxed: boolean;
}

export function lookFor(e: PortraitSubject): Look {
  const h = hash(e.id + '|' + e.visual);
  const v = e.visual;
  return {
    skin: pick(SKIN, h, 1), hair: pick(HAIR, h, 2), shirt: pick(SHIRT, h, 3), tint: DEPT_TINT[e.deptId] ?? '#3a3f4a',
    hairStyle: (h >>> 9) % 7, glasses: ((h >>> 5) & 3) === 0 || /meticulous|spreadsheet|analyst|reports/i.test(v),
    outfit: /hoodie/i.test(v) ? 'hoodie' : /formal|premium|polished|confident/i.test(v) ? 'blazer' : 'shirt',
    ears: /headset/i.test(v) ? 'headset' : /headphones/i.test(v) ? 'headphones' : 'none',
    badge: /badge/i.test(v), watch: /watch/i.test(v), prop: propFor(v), relaxed: /relaxed/i.test(v),
  };
}

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/** Draws one portrait card into a PORTRAIT_W × PORTRAIT_H box at (x, y). */
export function drawPortrait(c: CanvasRenderingContext2D, e: PortraitSubject, x = 0, y = 0): void {
  const L = lookFor(e);
  const W = PORTRAIT_W, H = PORTRAIT_H;
  c.save();
  c.translate(x, y);
  // card + clip
  c.beginPath(); c.roundRect(4, 4, W - 8, H - 8, 26); c.closePath();
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, shade(L.tint, 0.12)); bg.addColorStop(0.7, shade(L.tint, -0.35)); bg.addColorStop(1, '#121317');
  c.fillStyle = bg; c.fill();
  c.save(); c.clip();
  // desk-lamp light from upper left
  const lamp = c.createRadialGradient(60, 40, 10, 60, 40, 220);
  lamp.addColorStop(0, 'rgba(255,214,150,.30)'); lamp.addColorStop(1, 'rgba(255,214,150,0)');
  c.fillStyle = lamp; c.fillRect(0, 0, W, H);
  // venetian-blind shadow stripes
  c.fillStyle = 'rgba(0,0,0,.10)';
  for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(0, 30 + i * 30); c.lineTo(W, -10 + i * 30); c.lineTo(W, 2 + i * 30); c.lineTo(0, 42 + i * 30); c.fill(); }

  const cx = W / 2 + (L.relaxed ? 6 : 0), headY = 128;
  // long hair behind head
  c.fillStyle = L.hair;
  if (L.hairStyle === 2) { c.beginPath(); c.roundRect(cx - 62, headY - 40, 124, 150, 50); c.fill(); }
  if (L.hairStyle === 6) { c.beginPath(); c.roundRect(cx - 60, headY - 44, 120, 104, 44); c.fill(); }

  // torso
  const tY = 212;
  c.fillStyle = L.outfit === 'hoodie' ? shade(L.shirt, -0.15) : L.shirt;
  c.beginPath();
  c.moveTo(cx - 92, H); c.bezierCurveTo(cx - 92, tY + 20, cx - 70, tY, cx - 34, tY - 6);
  c.lineTo(cx + 34, tY - 6); c.bezierCurveTo(cx + 70, tY, cx + 92, tY + 20, cx + 92, H); c.closePath(); c.fill();
  if (L.outfit === 'blazer') {
    c.fillStyle = '#e9e4da';
    c.beginPath(); c.moveTo(cx - 22, tY - 4); c.lineTo(cx, tY + 52); c.lineTo(cx + 22, tY - 4); c.fill();
    c.fillStyle = shade(L.shirt, -0.45);
    c.beginPath(); c.moveTo(cx - 6, tY + 6); c.lineTo(cx + 6, tY + 6); c.lineTo(cx + 4, tY + 54); c.lineTo(cx, tY + 62); c.lineTo(cx - 4, tY + 54); c.fill();
    c.strokeStyle = shade(L.shirt, -0.3); c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 24, tY - 4); c.lineTo(cx - 6, tY + 70); c.moveTo(cx + 24, tY - 4); c.lineTo(cx + 6, tY + 70); c.stroke();
  } else if (L.outfit === 'hoodie') {
    c.strokeStyle = shade(L.shirt, -0.4); c.lineWidth = 10;
    c.beginPath(); c.arc(cx, tY - 4, 40, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    c.strokeStyle = '#d8d2c6'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 12, tY + 28); c.lineTo(cx - 14, tY + 60); c.moveTo(cx + 12, tY + 28); c.lineTo(cx + 14, tY + 60); c.stroke();
  } else {
    c.fillStyle = shade(L.shirt, 0.25);
    c.beginPath(); c.moveTo(cx - 26, tY - 6); c.lineTo(cx - 4, tY + 22); c.lineTo(cx - 10, tY - 6); c.fill();
    c.beginPath(); c.moveTo(cx + 26, tY - 6); c.lineTo(cx + 4, tY + 22); c.lineTo(cx + 10, tY - 6); c.fill();
  }
  if (L.badge) {
    c.strokeStyle = '#c9a25a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - 24, tY - 4); c.lineTo(cx + 30, tY + 14); c.stroke();
    c.fillStyle = '#efe9dd'; c.beginPath(); c.roundRect(cx + 18, tY + 10, 26, 32, 4); c.fill();
    c.fillStyle = '#3b5675'; c.fillRect(cx + 22, tY + 16, 18, 8);
  }

  // neck + head
  c.fillStyle = shade(L.skin, -0.18); c.fillRect(cx - 17, headY + 40, 34, 40);
  c.fillStyle = L.skin;
  c.beginPath(); c.ellipse(cx, headY, 50, 60, 0, 0, Math.PI * 2); c.fill();
  // ears
  c.beginPath(); c.ellipse(cx - 50, headY + 6, 9, 14, 0, 0, Math.PI * 2); c.ellipse(cx + 50, headY + 6, 9, 14, 0, 0, Math.PI * 2); c.fill();
  // face shadow (lamp from the left)
  c.fillStyle = 'rgba(40,20,10,.16)';
  c.beginPath(); c.ellipse(cx + 18, headY + 6, 34, 56, 0, -Math.PI / 2, Math.PI / 2); c.fill();

  // hair on top
  c.fillStyle = L.hair;
  const hs = L.hairStyle;
  c.beginPath();
  if (hs === 5) { c.ellipse(cx, headY - 30, 50, 32, 0, Math.PI, 0); }
  else if (hs === 4) { for (let i = -4; i <= 4; i++) c.arc(cx + i * 12, headY - 44 + Math.abs(i) * 3, 16, 0, Math.PI * 2); }
  else {
    c.moveTo(cx - 54, headY - 4);
    c.bezierCurveTo(cx - 60, headY - 78, cx + 60, headY - 80, cx + 54, headY - 4);
    if (hs === 1) c.bezierCurveTo(cx + 40, headY - 40, cx - 6, headY - 42, cx - 30, headY - 30);
    else c.bezierCurveTo(cx + 30, headY - 36, cx - 30, headY - 36, cx - 54, headY - 4);
  }
  c.fill();
  if (hs === 3) { c.beginPath(); c.arc(cx + 6, headY - 66, 20, 0, Math.PI * 2); c.fill(); }

  // face
  const eyeY = headY + 4;
  c.fillStyle = '#1a1210';
  c.beginPath(); c.ellipse(cx - 18, eyeY, 4.5, 5.5, 0, 0, Math.PI * 2); c.ellipse(cx + 18, eyeY, 4.5, 5.5, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = shade(L.hair, 0.05); c.lineWidth = 4; c.lineCap = 'round';
  const browTilt = (hash(e.id) & 1) ? 3 : -2;
  c.beginPath(); c.moveTo(cx - 28, eyeY - 14 + browTilt); c.lineTo(cx - 10, eyeY - 16); c.moveTo(cx + 10, eyeY - 16); c.lineTo(cx + 28, eyeY - 14 + browTilt); c.stroke();
  c.strokeStyle = shade(L.skin, -0.45); c.lineWidth = 3.5;
  c.beginPath(); c.arc(cx, headY + 26, 12, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
  if (L.glasses) {
    c.strokeStyle = '#1b1b1f'; c.lineWidth = 3.5;
    c.beginPath(); c.roundRect(cx - 32, eyeY - 12, 26, 22, 7); c.roundRect(cx + 6, eyeY - 12, 26, 22, 7);
    c.moveTo(cx - 6, eyeY - 2); c.lineTo(cx + 6, eyeY - 2); c.stroke();
    c.fillStyle = 'rgba(255,230,190,.12)'; c.fillRect(cx - 30, eyeY - 10, 10, 6);
  }
  if (L.ears !== 'none') {
    c.strokeStyle = '#202227'; c.lineWidth = 7;
    c.beginPath(); c.arc(cx, headY - 4, 58, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.fillStyle = '#2a2d33';
    c.beginPath(); c.roundRect(cx - 66, headY - 10, 16, 32, 6); c.fill();
    if (L.ears === 'headphones') { c.beginPath(); c.roundRect(cx + 50, headY - 10, 16, 32, 6); c.fill(); }
    else { c.strokeStyle = '#2a2d33'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 58, headY + 18); c.quadraticCurveTo(cx - 50, headY + 44, cx - 16, headY + 36); c.stroke(); }
  }
  c.restore(); // unclip

  // prop chip, bottom right
  const px = W - 50, py = H - 92;
  c.fillStyle = 'rgba(14,15,18,.82)';
  c.beginPath(); c.arc(px, py, 32, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#d9ad62'; c.lineWidth = 2.5; c.stroke();
  drawProp(c, L.prop, px, py);

  // name band
  const first = e.name.split(/\s+/)[0].toUpperCase();
  c.fillStyle = 'rgba(10,11,13,.86)';
  c.beginPath(); c.roundRect(4, H - 52, W - 8, 48, [0, 0, 26, 26]); c.fill();
  c.fillStyle = '#ece7de'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let px2 = 30;
  c.font = `700 ${px2}px Archivo, 'Arial Narrow', system-ui, sans-serif`;
  while (c.measureText(first).width > W - 40 && px2 > 14) c.font = `700 ${--px2}px Archivo, 'Arial Narrow', system-ui, sans-serif`;
  c.fillText(first, W / 2, H - 28);
  // frame
  c.strokeStyle = 'rgba(232,196,128,.55)'; c.lineWidth = 3;
  c.beginPath(); c.roundRect(5.5, 5.5, W - 11, H - 11, 25); c.stroke();
  c.restore();
}

/** Small line-art glyph of the character's signature prop, centred at (x, y), ~36px. */
function drawProp(c: CanvasRenderingContext2D, p: Prop, x: number, y: number): void {
  c.save(); c.translate(x, y);
  c.strokeStyle = '#ecd3a0'; c.fillStyle = '#ecd3a0'; c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round';
  const R = (x0: number, y0: number, w: number, h: number, r = 3) => { c.beginPath(); c.roundRect(x0, y0, w, h, r); c.stroke(); };
  const line = (...pts: number[]) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  switch (p) {
    case 'keyboard': R(-17, -8, 34, 16); for (let i = -12; i <= 12; i += 6) c.fillRect(i - 1.5, -4, 3, 3); line(-8, 4, 8, 4); break;
    case 'calculator': R(-11, -15, 22, 30); R(-7, -11, 14, 7, 1); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) c.fillRect(-7 + i * 6, 0 + j * 6, 3, 3); break;
    case 'camera': R(-16, -9, 32, 20, 4); c.beginPath(); c.arc(0, 1, 6, 0, Math.PI * 2); c.stroke(); line(-6, -9, -3, -13, 3, -13, 6, -9); break;
    case 'pencil': line(-12, 12, 10, -10); line(-12, 12, -13, 15, -10, 13); line(6, -14, 14, -6); break;
    case 'tablet': R(-11, -15, 22, 30, 4); line(-5, -6, 5, -6); line(-5, 0, 3, 0); c.fillRect(-1, 10, 2, 2); break;
    case 'monitors': R(-18, -11, 16, 13, 2); R(2, -11, 16, 13, 2); line(-10, 2, -10, 8); line(10, 2, 10, 8); line(-16, 9, 16, 9); break;
    case 'binder': R(-10, -14, 22, 28, 2); line(-6, -14, -6, 14); for (const yy of [-8, 0, 8]) line(-12, yy, -8, yy); break;
    case 'planner': R(-13, -11, 26, 24, 3); line(-13, -4, 13, -4); line(-6, -15, -6, -9); line(6, -15, 6, -9); c.fillRect(-7, 1, 4, 4); c.fillRect(2, 6, 4, 4); break;
    case 'kanban': R(-16, -12, 32, 24, 2); line(-5, -12, -5, 12); line(5, -12, 5, 12); c.fillRect(-13, -8, 5, 4); c.fillRect(-2, -3, 5, 4); c.fillRect(8, 2, 5, 4); break;
    case 'phone': R(-8, -15, 16, 30, 4); line(-3, 11, 3, 11); break;
    case 'bag': R(-14, -6, 28, 20, 4); line(-6, -6, -6, -11, 6, -11, 6, -6); line(-14, 2, 14, 2); break;
    case 'checklist': R(-11, -14, 22, 28, 2); for (const yy of [-6, 1, 8]) { line(-7, yy, -5, yy + 2, -2, yy - 2); line(2, yy, 7, yy); } break;
    case 'grid': R(-14, -12, 28, 24, 2); line(-14, -4, 14, -4); line(-14, 4, 14, 4); line(-4, -12, -4, 12); line(5, -12, 5, 12); break;
    case 'chart': line(-14, -13, -14, 12, 14, 12); c.fillRect(-9, 2, 5, 9); c.fillRect(-2, -4, 5, 15); c.fillRect(5, -10, 5, 21); break;
    case 'deck': R(-12, -9, 24, 17, 2); R(-8, -13, 24, 17, 2); line(-6, -2, 4, -2); break;
    case 'screen': R(-16, -12, 32, 20, 2); line(0, 8, 0, 14); line(-7, 14, 7, 14); line(-9, -4, -3, 2, 3, -3, 9, 2); break;
    case 'folder': c.beginPath(); c.moveTo(-15, -10); c.lineTo(-5, -10); c.lineTo(-2, -6); c.lineTo(15, -6); c.lineTo(15, 12); c.lineTo(-15, 12); c.closePath(); c.stroke(); break;
    case 'coffee': R(-11, -6, 18, 18, 4); c.beginPath(); c.arc(9, 3, 5, -Math.PI / 2, Math.PI / 2); c.stroke(); line(-6, -10, -4, -14); line(0, -10, 2, -14); break;
    case 'laptop': R(-12, -12, 24, 16, 2); line(-17, 9, 17, 9); line(-12, 4, -17, 9); line(12, 4, 17, 9); break;
    case 'notebook': R(-10, -14, 22, 28, 2); for (const yy of [-9, -3, 3, 9]) { c.beginPath(); c.arc(-10, yy, 2.4, 0, Math.PI * 2); c.stroke(); } line(-3, -6, 7, -6); line(-3, 0, 7, 0); break;
  }
  c.restore();
}

const urlCache = new Map<string, string>();
/** PNG data URL for DOM use (employee dossier). Cached per id; drawn at 1× (256×320). */
export function portraitDataUrl(e: PortraitSubject): string {
  let u = urlCache.get(e.id);
  if (u) return u;
  const cv = document.createElement('canvas');
  cv.width = PORTRAIT_W; cv.height = PORTRAIT_H;
  drawPortrait(cv.getContext('2d')!, e);
  u = cv.toDataURL('image/png');
  // Fonts may not be ready on the very first call; don't cache a fallback-font render.
  if (!document.fonts || document.fonts.status === 'loaded') urlCache.set(e.id, u);
  return u;
}
