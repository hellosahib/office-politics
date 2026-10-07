// Procedural canvas textures for the office floor. Generated once per board, no image assets.
import * as THREE from 'three';

export type FloorKind = 'wood' | 'carpet' | 'concrete' | 'terrazzo';

/** Small seeded PRNG so the floor looks the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296;
}

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Light-grey, tileable floor patterns; the department tint comes from the material colour. */
export function floorTexture(kind: FloorKind): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, S, (c) => {
    const r = rng(kind.length * 977 + kind.charCodeAt(0));
    c.fillStyle = '#c9c9c9'; c.fillRect(0, 0, S, S);
    if (kind === 'wood') {
      const plank = S / 6;
      for (let i = 0; i < 6; i++) {
        const off = r() * S;
        for (let k = -1; k < 2; k++) {
          const y = i * plank, x = off + k * S;
          c.fillStyle = `hsl(0 0% ${70 + r() * 18}%)`;
          c.fillRect(x, y, S - 2, plank - 2);
          c.strokeStyle = 'rgba(0,0,0,.10)'; c.lineWidth = 1;
          for (let g = 0; g < 9; g++) {
            const gy = y + 4 + r() * (plank - 8);
            c.beginPath(); c.moveTo(x, gy);
            c.bezierCurveTo(x + S * 0.3, gy + (r() - 0.5) * 8, x + S * 0.6, gy + (r() - 0.5) * 8, x + S, gy);
            c.stroke();
          }
        }
        c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, i * plank + plank - 2, S, 2);
      }
    } else if (kind === 'carpet') {
      const img = c.getImageData(0, 0, S, S);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 170 + (r() - 0.5) * 50;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      }
      c.putImageData(img, 0, 0);
      c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 2;
      for (let i = 0; i <= S; i += S / 4) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, S); c.moveTo(0, i); c.lineTo(S, i); c.stroke(); }
    } else {
      for (let i = 0; i < 1400; i++) {
        const x = r() * S, y = r() * S, rad = kind === 'terrazzo' ? 1.5 + r() * 3.5 : 10 + r() * 60;
        c.fillStyle = kind === 'terrazzo'
          ? `hsl(${r() * 40} ${8 + r() * 14}% ${55 + r() * 35}% / .7)`
          : `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.025 + r() * 0.03})`;
        c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
      }
      if (kind === 'concrete') {
        c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(S / 2, 0); c.lineTo(S / 2, S); c.moveTo(0, S / 2); c.lineTo(S, S / 2); c.stroke();
      }
    }
  }, true);
}

/** The room floor around the plates: dark carpet tiles with seams. */
export function groundTexture(): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, S, (c) => {
    const r = rng(7);
    c.fillStyle = '#17181b'; c.fillRect(0, 0, S, S);
    const img = c.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (r() - 0.5) * 10;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v + 1;
    }
    c.putImageData(img, 0, 0);
    // quarter-turned carpet tiles: alternate the weave direction
    c.strokeStyle = 'rgba(255,255,255,.025)'; c.lineWidth = 1;
    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * (S / 2), oy = Math.floor(q / 2) * (S / 2);
      for (let k = 4; k < S / 2; k += 6) {
        c.beginPath();
        if (q === 0 || q === 3) { c.moveTo(ox + k, oy); c.lineTo(ox + k, oy + S / 2); }
        else { c.moveTo(ox, oy + k); c.lineTo(ox + S / 2, oy + k); }
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillRect(0, 0, S, 2); c.fillRect(0, S / 2, S, 2); c.fillRect(0, 0, 2, S); c.fillRect(S / 2, 0, 2, S);
  }, true);
}

/** Soft radial dot, white → transparent. Tinted by material colour (glows, sparks, beams). */
export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

/** Spotlight cone shading: bright at the top, fading toward the floor. */
export function beamTexture(): THREE.CanvasTexture {
  return canvasTexture(4, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.25, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,.02)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  });
}

/** Fractured-floor overlay: dark fissures with a hot red edge, radiating from the centre. */
export function crackTexture(): THREE.CanvasTexture {
  const S = 512;
  return canvasTexture(S, S, (c) => {
    const r = rng(1234);
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const pts: [number, number][] = [[x, y]];
      for (let i = 0; i < 7; i++) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * len / 7; y += Math.sin(a) * len / 7;
        pts.push([x, y]);
        if (depth < 2 && r() < 0.25) branch(x, y, a + (r() < 0.5 ? 0.8 : -0.8), len * 0.5, w * 0.6, depth + 1);
      }
      for (const [col, lw] of [['rgba(255,70,50,.55)', w + 6], ['rgba(255,140,90,.9)', w + 1.5], ['rgba(10,4,4,.95)', w]] as const) {
        c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke();
      }
    };
    for (let i = 0; i < 7; i++) branch(S / 2 + (r() - 0.5) * 30, S / 2 + (r() - 0.5) * 30, (i / 7) * Math.PI * 2 + r() * 0.5, S * 0.42, 3.5, 0);
  });
}

/** Round red "!" badge (rebel) and gold star (promise), each 128². */
export function badgeTexture(kind: 'rebel' | 'star'): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c) => {
    if (kind === 'rebel') {
      c.fillStyle = '#e5484d'; c.beginPath(); c.arc(64, 64, 54, 0, Math.PI * 2); c.fill();
      c.lineWidth = 7; c.strokeStyle = '#1a0d0d'; c.stroke();
      c.fillStyle = '#fff6f0'; c.fillRect(56, 28, 16, 46); c.beginPath(); c.arc(64, 92, 9, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2, rad = i % 2 ? 24 : 58;
        c.lineTo(64 + Math.cos(a) * rad, 66 + Math.sin(a) * rad);
      }
      c.closePath(); c.fillStyle = '#ffd36b'; c.fill(); c.lineWidth = 6; c.strokeStyle = '#3a2a0a'; c.stroke();
    }
  });
}

export interface PlaqueSpec { title: string; sub: string; ownerColor: string | null; chip: string; chipColor: string }
export const PLAQUE_W = 640, PLAQUE_H = 156;

/** Department name plate: smoked graphite with a brass edge, owner colour as a side bar. */
export function drawPlaque(c: CanvasRenderingContext2D, p: PlaqueSpec): void {
  const W = PLAQUE_W, H = PLAQUE_H;
  c.clearRect(0, 0, W, H);
  c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 22);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#24262c'); g.addColorStop(1, '#111216');
  c.fillStyle = g; c.fill();
  c.lineWidth = 4; c.strokeStyle = '#c9a35f'; c.stroke();
  // owner bar
  c.save(); c.clip();
  c.fillStyle = p.ownerColor ?? '#4a4d55';
  c.fillRect(6, 6, 16, H - 12);
  c.restore();
  // highlight
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(30, 12); c.lineTo(W - 30, 12); c.stroke();

  const fit = (text: string, px: number, font: (n: number) => string, maxW: number) => {
    c.font = font(px);
    while (c.measureText(text).width > maxW && px > 12) c.font = font(--px);
  };
  const ctx = c as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };
  c.textBaseline = 'middle'; c.textAlign = 'left';
  // chip
  let chipW = 0;
  if (p.chip) {
    c.font = "700 26px 'Geist Mono', ui-monospace, monospace";
    chipW = c.measureText(p.chip).width + 30;
    c.fillStyle = p.chipColor; c.globalAlpha = 0.18;
    c.beginPath(); c.roundRect(W - 24 - chipW, H - 66, chipW, 42, 21); c.fill();
    c.globalAlpha = 1; c.strokeStyle = p.chipColor; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = p.chipColor; c.fillText(p.chip, W - 24 - chipW + 15, H - 44);
  }
  if ('fontStretch' in ctx) ctx.fontStretch = 'expanded';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
  c.fillStyle = '#f1ebdf';
  fit(p.title.toUpperCase(), 52, (n) => `800 ${n}px Archivo, 'Arial Black', system-ui, sans-serif`, W - 70);
  c.fillText(p.title.toUpperCase(), 40, 50);
  if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  c.fillStyle = '#b8b1a5';
  fit(p.sub, 36, (n) => `600 ${n}px Geist, system-ui, sans-serif`, W - 80 - chipW);
  c.fillText(p.sub, 40, H - 44);
}
