// three.js board renderer (D1, D20, docs/DESIGN.md). "Office noir": bevelled floor plates lit by a
// warm desk-lamp key light, owners shown as rim light, employees as portrait standees.
// Tiles are built once per layout and mutated on update(); all 28 employees share a handful of
// instanced meshes plus one merged card mesh, so token draw calls stay constant (~8).
import * as THREE from 'three';
import type { DeptId, EmployeeId, EmployeeView, GameView, LoyaltyState, DepartmentView } from '../engine/types';
import { TRAIT_LABEL } from '../engine/types';
import { drawPortrait, PORTRAIT_H, PORTRAIT_W, type TraitTag } from './portrait';
import {
  badgeTexture, beamTexture, crackTexture, drawPlaque, floorTexture, glowTexture, groundTexture,
  PLAQUE_H, PLAQUE_W, type FloorKind, type PlaqueSpec,
} from './textures';

export interface BoardOptions {
  /** employees the player may currently click (others rendered dimmed/non-interactive) */
  selectable?: EmployeeId[];
  /** the currently selected employee (ring/pulse) */
  selected?: EmployeeId | null;
  /** departments to outline (e.g. the event's dept) */
  highlightDepts?: DeptId[];
}
export interface Board {
  update(view: GameView, opts?: BoardOptions): void;
  onEmployeeClick(cb: (id: EmployeeId) => void): void;
  onDeptClick(cb: (id: DeptId) => void): void;
  onEmployeeHover(cb: (id: EmployeeId | null) => void): void;
  focusDept(id: DeptId | null): void;
  resize(): void;
  dispose(): void;
}

// ---------------------------------------------------------------- dimensions & palette
const R = 1.5;                       // hex circumradius (flat-top)
const SPACING = 2.1 * R;
const DEPTH = 0.16, BEVEL = 0.045;
const TOP = DEPTH + 2 * BEVEL;       // plate top surface height
const CARD_W = 0.6, CARD_H = 0.75, LEAN = 0.3, PLINTH_H = 0.07;
const TILT = THREE.MathUtils.degToRad(55);
const BG = '#0b0c0f';
const BRASS = '#d9ad62';
const NEUTRAL_FRAME = '#3b3d44';
const LOYALTY_COLOR: Record<LoyaltyState, string> = {
  Loyal: '#ffc94a', Favorable: '#4cc38a', Neutral: '#8e9099', Skeptical: '#f08c3a', Rebel: '#e5484d',
};
const POSTURE_YAW: Record<LoyaltyState, number> = { Loyal: 0, Favorable: 0, Neutral: 0.08, Skeptical: 0.22, Rebel: 0.62 };
// 2x2 grid inside the hex, shifted south so the name plate sits on the north half
const GRID: [number, number][] = [[-0.46, 0.14], [0.46, 0.14], [-0.46, 0.9], [0.46, 0.9]];
const FLOOR: Record<string, [FloorKind, string]> = {
  engineering: ['carpet', '#56677d'], product: ['concrete', '#7f8b89'], sales: ['wood', '#9c6c4b'],
  marketing: ['terrazzo', '#8d7d88'], finance: ['wood', '#6c4f3a'], operations: ['concrete', '#8a7f6b'], people: ['carpet', '#776a8a'],
};
const MAX_TOKENS = 32; // atlas is 8×4; cell 31 is the card backing

/** Traits as this view knows them: permanent always, hidden ones when non-null (public, or private intel). */
const traitTags = (e: EmployeeView, over: boolean): TraitTag[] => [
  { label: TRAIT_LABEL[e.permanentTrait], weight: 1, state: 'public' },
  ...([[e.hiddenTrait1, e.hiddenTrait1Public, 2], [e.hiddenTrait2, e.hiddenTrait2Public, 0]] as const).map(([t, pub, w]): TraitTag =>
    t ? { label: TRAIT_LABEL[t], weight: w, state: pub || over ? 'public' : 'private' } : { label: '???', weight: w, state: 'unknown' }),
];

const slotPos = (slot: DepartmentView['slot']) => {
  if (slot === 'center') return new THREE.Vector3();
  const a = (slot * Math.PI) / 3;
  return new THREE.Vector3(Math.sin(a) * SPACING, 0, -Math.cos(a) * SPACING);
};
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
const hexShape = (r: number) => {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0);
  }
  s.closePath();
  return s;
};
const hexRing = (outer: number, inner: number) => {
  const s = hexShape(outer);
  const h = new THREE.Path();
  for (let i = 0; i < 6; i++) { const a = (-i * Math.PI) / 3; i ? h.lineTo(Math.cos(a) * inner, Math.sin(a) * inner) : h.moveTo(inner, 0); }
  h.closePath();
  s.holes.push(h);
  return s;
};

interface Tile {
  id: DeptId; group: THREE.Group; plate: THREE.Mesh;
  frameMat: THREE.MeshStandardMaterial; glow: THREE.Mesh; glowMat: THREE.MeshBasicMaterial;
  plaqueMat: THREE.MeshBasicMaterial; plaqueCanvas: HTMLCanvasElement; plaqueTex: THREE.CanvasTexture; plaqueKey: string;
  crack: THREE.Mesh; crackMat: THREE.MeshBasicMaterial; outline: THREE.Mesh;
  sweep: THREE.Mesh; sweepMat: THREE.MeshBasicMaterial;
  lead: number | null | undefined; frameCur: THREE.Color; frameTarget: THREE.Color; emissive: number; glowOpacity: number;
  pulse: 0 | 1 | 2; crackBase: number; crackFlash: number; sweepT: number; flash: number;
}
interface Tok {
  idx: number; id: EmployeeId; tile: Tile; base: THREE.Vector3;
  loyalty: LoyaltyState | undefined; ringCur: THREE.Color; ringTarget: THREE.Color; ringPulse: number;
  y: number; vy: number; lift: number; yaw: number; yawTarget: number; shake: number; halo: number; haloTarget: number;
  backCur: THREE.Color; backTarget: THREE.Color; dim: number; dimTarget: number;
  interactive: boolean; selected: boolean; promise: boolean; mole: boolean; rebel: boolean;
  /** what the atlas cell was last painted with (trait band text + compact flag + font tick) */
  cellKey: string; known: number;
}

export function createBoard(container: HTMLElement): Board {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const still = () => !!reduceMotion?.matches;
  const small = () => Math.min(container.clientWidth, container.clientHeight) < 600;
  // Width check: unless a card is drawn wide enough on screen to read full trait rows (big screens,
  // focused department), its trait band shows 3-letter pills ("AMB+1 ???+2 ???0"). Phones always get pills.
  let compact = true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(renderer.domElement);
  // Vignette + lamp pool as a DOM overlay: free, and it frames the board in every host page.
  const vignette = document.createElement('div');
  vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
    + 'background:radial-gradient(120% 90% at 42% 38%, rgba(255,190,110,.07) 0%, rgba(0,0,0,0) 45%, rgba(4,4,6,.72) 100%)';
  container.appendChild(vignette);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 20, 60);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  // ---- lights: cool ambient fill, warm desk-lamp key (shadows), cold rim from the windows
  scene.add(new THREE.HemisphereLight('#8ea2c8', '#1b140e', 0.75));
  const key = new THREE.DirectionalLight('#ffd6a0', 2.6);
  key.position.set(-7, 13, 5);
  key.castShadow = true;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 40;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#7c9cff', 0.6);
  rim.position.set(4, 5, -12);
  scene.add(rim);

  // ---- textures
  const tex = {
    ground: groundTexture(), glow: glowTexture(), beam: beamTexture(), crack: crackTexture(),
    rebel: badgeTexture('rebel'), star: badgeTexture('star'),
    floors: new Map<FloorKind, THREE.CanvasTexture>(),
  };
  const floorTex = (k: FloorKind) => {
    let t = tex.floors.get(k);
    if (!t) { t = floorTexture(k); t.repeat.set(0.33, 0.33); t.anisotropy = maxAniso; tex.floors.set(k, t); }
    return t;
  };
  tex.ground.repeat.set(10, 10);
  tex.ground.anisotropy = maxAniso;

  // portrait atlas: 8×4 cells of 256×320; cell 31 = plain backing card
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = PORTRAIT_W * 8; atlasCanvas.height = PORTRAIT_H * 4;
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = maxAniso;
  const cellUV = (i: number) => {
    const col = i % 8, row = Math.floor(i / 8), iu = 2 / atlasCanvas.width, iv = 2 / atlasCanvas.height;
    return { u0: col / 8 + iu, u1: (col + 1) / 8 - iu, vt: 1 - row / 4 - iv, vb: 1 - (row + 1) / 4 + iv };
  };

  // ---- shared geometry
  const geo = {
    plate: new THREE.ExtrudeGeometry(hexShape(R - BEVEL), { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 1 })
      .rotateX(-Math.PI / 2).translate(0, BEVEL, 0),
    frame: new THREE.ExtrudeGeometry(hexRing(R * 0.965, R * 0.9), { depth: 0.025, bevelEnabled: false }).rotateX(-Math.PI / 2),
    flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    plaque: new THREE.PlaneGeometry(1.8, (1.8 * PLAQUE_H) / PLAQUE_W),
    outline: new THREE.ShapeGeometry(hexRing(R * 1.12, R * 1.04)).rotateX(-Math.PI / 2),
    sweep: new THREE.ShapeGeometry(hexRing(R, R * 0.86)).rotateX(-Math.PI / 2),
    ground: new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2),
    plinth: new THREE.CylinderGeometry(0.16, 0.19, PLINTH_H, 28).translate(0, PLINTH_H / 2, 0),
    ring: new THREE.TorusGeometry(0.22, 0.022, 8, 40).rotateX(Math.PI / 2),
    halo: new THREE.TorusGeometry(0.15, 0.018, 8, 32).rotateX(Math.PI / 2),
    badge: new THREE.PlaneGeometry(1, 1),
    beam: new THREE.CylinderGeometry(0.06, 0.5, 4, 32, 1, true).translate(0, 2, 0),
  };

  // ---- shared materials
  const sideMat = new THREE.MeshStandardMaterial({ color: '#2a2b30', metalness: 0.55, roughness: 0.38 });
  const outlineMat = new THREE.MeshBasicMaterial({ color: BRASS, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const ground = new THREE.Mesh(geo.ground, new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- token meshes (instanced) + merged card mesh
  const inst = (g: THREE.BufferGeometry, m: THREE.Material, castShadow = false) => {
    const mesh = new THREE.InstancedMesh(g, m, MAX_TOKENS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = castShadow;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  };
  const plinths = inst(geo.plinth, new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.35, roughness: 0.45 }), true);
  const rings = inst(geo.ring, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  const halos = inst(geo.halo, new THREE.MeshBasicMaterial({ color: '#ffd36b', toneMapped: false }));
  const stars = inst(geo.badge, new THREE.MeshBasicMaterial({ map: tex.star, transparent: true, depthWrite: false, toneMapped: false }));
  const badges = inst(geo.badge, new THREE.MeshBasicMaterial({ map: tex.rebel, transparent: true, depthWrite: false, toneMapped: false }));
  const moles = inst(geo.badge, new THREE.MeshBasicMaterial({ map: tex.glow, color: '#9b6bff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  for (const m of [plinths, rings]) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOKENS * 3), 3).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
  stars.renderOrder = badges.renderOrder = 3;

  const QUADS = MAX_TOKENS * 2;
  const cardGeo = new THREE.BufferGeometry();
  const cardPos = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const cardCol = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const cardUV = new THREE.BufferAttribute(new Float32Array(QUADS * 4 * 2), 2);
  const idx: number[] = [];
  for (let q = 0; q < QUADS; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  cardGeo.setIndex(idx);
  cardGeo.setAttribute('position', cardPos);
  cardGeo.setAttribute('color', cardCol);
  cardGeo.setAttribute('uv', cardUV);
  cardGeo.setDrawRange(0, 0);
  const cards = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  cards.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.5 });
  cards.castShadow = true;
  cards.frustumCulled = false;
  scene.add(cards);

  // selection spotlight: a fake volumetric cone + floor pool (no extra real light)
  const beam = new THREE.Mesh(geo.beam, new THREE.MeshBasicMaterial({ map: tex.beam, color: '#ffdca6', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const pool = new THREE.Mesh(geo.flat, new THREE.MeshBasicMaterial({ map: tex.glow, color: '#ffcf8a', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  pool.scale.setScalar(1.2);
  beam.visible = pool.visible = false;
  scene.add(beam, pool);

  // capture sparks
  const SPARKS = 96;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new THREE.BufferAttribute(new Float32Array(SPARKS * 3).fill(-100), 3).setUsage(THREE.DynamicDrawUsage);
  const sparkCol = new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', sparkPos);
  sparkGeo.setAttribute('color', sparkCol);
  const sparkVel = new Float32Array(SPARKS * 3), sparkLife = new Float32Array(SPARKS), sparkBase = new Float32Array(SPARKS * 3);
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, map: tex.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sparks.frustumCulled = false;
  sparks.visible = false;
  scene.add(sparks);
  let sparkNext = 0;
  const burst = (at: THREE.Vector3, color: THREE.Color, n: number) => {
    for (let i = 0; i < n; i++) {
      const s = sparkNext++ % SPARKS, a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
      sparkPos.setXYZ(s, at.x + Math.cos(a) * 0.3, TOP + 0.1, at.z + Math.sin(a) * 0.3);
      sparkVel[s * 3] = Math.cos(a) * sp; sparkVel[s * 3 + 1] = 2 + Math.random() * 3; sparkVel[s * 3 + 2] = Math.sin(a) * sp;
      sparkLife[s] = 0.7 + Math.random() * 0.6;
      sparkBase[s * 3] = color.r; sparkBase[s * 3 + 1] = color.g; sparkBase[s * 3 + 2] = color.b;
    }
    sparks.visible = true;
  };

  // ---- layout
  const tiles = new Map<DeptId, Tile>();
  const toks: Tok[] = [];
  const tokById = new Map<EmployeeId, Tok>();
  const deptPos = new Map<DeptId, THREE.Vector3>();
  let plates: THREE.Mesh[] = [];
  let layoutKey = '';
  let lastView: GameView | null = null;

  const clearLayout = () => {
    for (const t of tiles.values()) {
      scene.remove(t.group);
      (t.plate.material as THREE.Material[])[0].dispose();
      for (const m of [t.frameMat, t.glowMat, t.plaqueMat, t.crackMat, t.sweepMat]) m.dispose();
      t.plaqueTex.dispose();
    }
    tiles.clear(); toks.length = 0; tokById.clear(); deptPos.clear(); plates = [];
  };

  /** Clears the atlas and paints the backing card; portrait cells are (re)painted by update() via cellKey. */
  const paintAtlas = () => {
    const c = atlasCanvas.getContext('2d')!;
    c.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    for (const t of toks) t.cellKey = '';
    // backing card (tinted per vertex with the owner colour)
    c.fillStyle = '#d6d6d6';
    c.beginPath(); c.roundRect(7 * PORTRAIT_W + 2, 3 * PORTRAIT_H + 2, PORTRAIT_W - 4, PORTRAIT_H - 4, 30); c.fill();
    atlas.needsUpdate = true;
  };
  const paintCell = (t: Tok, e: EmployeeView, tags: TraitTag[]) => {
    const c = atlasCanvas.getContext('2d')!;
    const x = (t.idx % 8) * PORTRAIT_W, y = Math.floor(t.idx / 8) * PORTRAIT_H;
    c.clearRect(x, y, PORTRAIT_W, PORTRAIT_H);
    drawPortrait(c, e, x, y, tags, compact);
    atlas.needsUpdate = true;
  };

  const buildLayout = (view: GameView) => {
    clearLayout();
    lastView = view;
    for (const d of view.departments) {
      const group = new THREE.Group();
      group.position.copy(slotPos(d.slot));
      deptPos.set(d.id, group.position.clone());
      const [kind, tint] = FLOOR[d.id] ?? ['concrete', '#7a7a7a'];
      const topMat = new THREE.MeshStandardMaterial({ map: floorTex(kind), color: tint, roughness: kind === 'wood' ? 0.55 : 0.85, metalness: 0 });
      const plate = new THREE.Mesh(geo.plate, [topMat, sideMat]);
      plate.receiveShadow = true;
      plate.castShadow = true;
      plate.userData.dept = d.id;
      const frameMat = new THREE.MeshStandardMaterial({ color: '#202126', metalness: 0.8, roughness: 0.3, emissive: '#000000' });
      const frame = new THREE.Mesh(geo.frame, frameMat);
      frame.position.y = TOP - 0.004;
      const glowMat = new THREE.MeshBasicMaterial({ map: tex.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const glow = new THREE.Mesh(geo.flat, glowMat);
      glow.scale.setScalar(R * 3.4);
      glow.position.y = 0.012;
      const plaqueCanvas = document.createElement('canvas');
      plaqueCanvas.width = PLAQUE_W; plaqueCanvas.height = PLAQUE_H;
      const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
      plaqueTex.colorSpace = THREE.SRGBColorSpace;
      plaqueTex.anisotropy = maxAniso;
      const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true, toneMapped: false });
      const plaque = new THREE.Mesh(geo.plaque, plaqueMat);
      plaque.position.set(0, TOP + 0.3, -R * 0.7);
      plaque.rotation.x = -0.75;
      plaque.renderOrder = 2;
      const crackMat = new THREE.MeshBasicMaterial({ map: tex.crack, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const crack = new THREE.Mesh(geo.flat, crackMat);
      crack.scale.setScalar(R * 1.7);
      crack.position.y = TOP + 0.003;
      crack.visible = false;
      const outline = new THREE.Mesh(geo.outline, outlineMat);
      outline.position.y = 0.02;
      outline.visible = false;
      const sweepMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const sweep = new THREE.Mesh(geo.sweep, sweepMat);
      sweep.position.y = TOP + 0.03;
      sweep.visible = false;
      group.add(plate, frame, glow, plaque, crack, outline, sweep);
      scene.add(group);
      plates.push(plate);
      const tile: Tile = {
        id: d.id, group, plate, frameMat, glow, glowMat, plaqueMat, plaqueCanvas, plaqueTex, plaqueKey: '', crack, crackMat, outline, sweep, sweepMat,
        lead: undefined, frameCur: new THREE.Color(NEUTRAL_FRAME), frameTarget: new THREE.Color(NEUTRAL_FRAME), emissive: 0, glowOpacity: 0,
        pulse: 0, crackBase: 0, crackFlash: 0, sweepT: -1, flash: 0,
      };
      tiles.set(d.id, tile);

      d.employeeIds.forEach((eid, i) => {
        const [gx, gz] = GRID[i % 4];
        const t: Tok = {
          idx: toks.length, id: eid, tile, base: new THREE.Vector3(gx, TOP, gz).add(group.position),
          loyalty: undefined, ringCur: new THREE.Color(LOYALTY_COLOR.Neutral), ringTarget: new THREE.Color(), ringPulse: 0,
          y: 0, vy: 0, lift: 0, yaw: 0, yawTarget: 0, shake: 0, halo: 0, haloTarget: 0,
          backCur: new THREE.Color(NEUTRAL_FRAME), backTarget: new THREE.Color(), dim: 1, dimTarget: 1,
          interactive: true, selected: false, promise: false, mole: false, rebel: false, cellKey: '', known: -1,
        };
        if (toks.length < MAX_TOKENS - 1) { toks.push(t); tokById.set(eid, t); }
      });
    }
    // static per-layout card UVs
    for (const t of toks) {
      const face = cellUV(t.idx), back = cellUV(MAX_TOKENS - 1);
      [[back, t.idx * 2], [face, t.idx * 2 + 1]].forEach(([uv, q]) => {
        const { u0, u1, vt, vb } = uv as ReturnType<typeof cellUV>;
        const o = (q as number) * 4;
        cardUV.setXY(o, u0, vb); cardUV.setXY(o + 1, u1, vb); cardUV.setXY(o + 2, u1, vt); cardUV.setXY(o + 3, u0, vt);
      });
    }
    cardUV.needsUpdate = true;
    cardGeo.setDrawRange(0, toks.length * 12);
    plinths.count = rings.count = toks.length;
    paintAtlas();
    fitCamera();
    settle = still() ? 0 : 1;
  };

  // ---- update
  const tmpC = new THREE.Color();
  const update = (view: GameView, opts: BoardOptions = {}) => {
    const key = view.departments.map((d) => `${d.id}@${d.slot}:${d.employeeIds.join(',')}`).join('|');
    if (key !== layoutKey) { layoutKey = key; buildLayout(view); }
    lastView = view;
    const color = (p: number | null) => (p == null ? null : view.players.find((pl) => pl.id === p)?.color ?? null);
    const name = (p: number) => view.players.find((pl) => pl.id === p)?.name ?? `Player ${p + 1}`;
    const hl = new Set(opts.highlightDepts ?? []);
    const animate = !still();

    for (const d of view.departments) {
      const t = tiles.get(d.id);
      if (!t) continue;
      const lead = color(d.teamLead);
      const mine = d.teamLead != null && d.teamLead === view.viewer;
      if (t.lead !== undefined && t.lead !== d.teamLead && animate) {
        t.sweepT = 0;
        t.sweepMat.color.set(lead ?? '#c9c9c9');
        t.flash = 1;
        burst(deptPos.get(d.id)!, new THREE.Color(lead ?? '#d0d0d0'), lead ? 48 : 20);
      }
      t.lead = d.teamLead;
      t.frameTarget.set(lead ?? NEUTRAL_FRAME);
      t.emissive = lead ? (mine ? 1.6 : 0.9) : 0;
      t.glowOpacity = lead ? (mine ? 0.42 : 0.26) : 0;
      t.glowMat.color.set(lead ?? '#000000');
      t.pulse = d.instability >= 2 ? 2 : d.instability === 1 ? 1 : 0;
      t.crackBase = [0, 0.22, 0.5, 0.78, 1][Math.min(4, d.rebelCount)];
      t.outline.visible = hl.has(d.id);

      const prot = d.protectedUntilRound > view.round;
      const chip = d.instability ? ['', 'UNSTABLE', 'CRISIS', 'REBELLION'][d.instability]
        : prot ? 'PROTECTED' : d.rebelCount ? `${d.rebelCount} REBEL` : '';
      const chipColor = d.instability >= 2 ? '#ff6b61' : d.instability ? '#ffb340' : prot ? '#7cc4ff' : '#ff8a80';
      const spec: PlaqueSpec = {
        title: d.name,
        sub: (d.teamLead == null ? 'Neutral floor' : `Lead: ${mine ? 'You' : name(d.teamLead)}`)
          + (d.rebelCount && d.instability ? ` · ${d.rebelCount} rebels` : ''),
        ownerColor: lead, chip, chipColor,
      };
      const pk = JSON.stringify(spec) + fontsTick;
      if (pk !== t.plaqueKey) {
        t.plaqueKey = pk;
        drawPlaque(t.plaqueCanvas.getContext('2d')!, spec);
        t.plaqueTex.needsUpdate = true;
      }
    }

    const selectable = opts.selectable ? new Set(opts.selectable) : null;
    const over = view.phase === 'gameOver';
    for (const e of view.employees) {
      const k = tokById.get(e.id);
      if (!k) continue;
      // Trait band: repaint this token's atlas cell only when what the viewer knows changes.
      const tags = traitTags(e, over);
      const ck = JSON.stringify(tags) + compact + fontsTick;
      if (ck !== k.cellKey) {
        k.cellKey = ck;
        paintCell(k, e, tags);
        const known = tags.filter((x) => x.state !== 'unknown').length;
        if (k.known >= 0 && known > k.known && animate) { k.vy = 2.2; k.ringPulse = 1; }
        k.known = known;
      }
      const dim = !!selectable && !selectable.has(e.id);
      k.interactive = !dim;
      k.selected = opts.selected === e.id;
      k.dimTarget = dim ? 0.32 : 1;
      if (k.loyalty !== undefined && k.loyalty !== e.loyalty && animate) {
        k.vy = 2.6;
        k.ringPulse = 1;
        if (e.loyalty === 'Rebel') { k.shake = 1; k.tile.crackFlash = 1; }
      }
      if (k.loyalty === undefined) k.ringCur.set(LOYALTY_COLOR[e.loyalty]);
      k.loyalty = e.loyalty;
      k.ringTarget.set(LOYALTY_COLOR[e.loyalty]);
      k.yawTarget = POSTURE_YAW[e.loyalty] * (k.idx % 2 ? -1 : 1);
      k.haloTarget = e.loyalty === 'Loyal' ? 1 : 0;
      const owner = color(e.politicalOwner);
      k.backTarget.set(owner ?? NEUTRAL_FRAME);
      if (owner && e.loyalty === 'Loyal') k.backTarget.lerp(tmpC.set('#ffd36b'), 0.25);
      k.promise = !!e.promise;
      k.mole = !!e.mole;
      k.rebel = e.loyalty === 'Rebel';
    }
    if (hoverId && !tokById.get(hoverId)?.interactive) setHover(null);
  };

  // ---- camera fit: closed-form distance so every board point lands inside the frustum
  const camTarget = new THREE.Vector3(), wantTarget = new THREE.Vector3(), baseTarget = new THREE.Vector3();
  let camDist = 20, wantDist = 20, baseDist = 20, focused: DeptId | null = null, camYaw = 0, settle = 0;
  const dir = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
  const up = new THREE.Vector3(0, Math.cos(TILT), -Math.sin(TILT));
  const fitCamera = () => {
    const pts: THREE.Vector3[] = [];
    for (const p of deptPos.values())
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        for (const y of [0, TOP + 0.75]) pts.push(new THREE.Vector3(p.x + Math.cos(a) * R, y, p.z + Math.sin(a) * R));
      }
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    baseTarget.set((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / 1.05;
    const tanH = tanV * camera.aspect;
    baseDist = 0;
    for (const p of pts) {
      const q = p.clone().sub(baseTarget);
      baseDist = Math.max(baseDist, q.dot(dir) + Math.abs(q.x) / tanH, q.dot(dir) + Math.abs(q.dot(up)) / tanV);
    }
    const fog = scene.fog as THREE.Fog;
    fog.near = baseDist * 1.05; fog.far = baseDist * 2.6;
    applyFocus();
    if (!started) {
      started = true;
      camTarget.copy(wantTarget);
      camDist = wantDist * (still() ? 1 : 1.55);
      camYaw = still() ? 0 : 0.55;
    }
  };
  let started = false;
  const applyFocus = () => {
    const p = focused ? deptPos.get(focused) : undefined;
    wantTarget.copy(baseTarget);
    wantDist = baseDist;
    if (p) { wantTarget.lerp(p, 0.65); wantDist *= 0.68; }
    const cardPx = (CARD_W * container.clientHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * wantDist);
    const want = container.clientWidth < 700 || cardPx < (compact ? 130 : 110); // hysteresis
    if (want !== compact) { compact = want; compactDirty = true; }
  };
  let compactDirty = false;

  // ---- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const empCbs: ((id: EmployeeId) => void)[] = [], deptCbs: ((id: DeptId) => void)[] = [];
  const hoverCbs: ((id: EmployeeId | null) => void)[] = [];
  const pick = (x: number, y: number): { emp?: EmployeeId; dept?: DeptId } => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    cardGeo.computeBoundingSphere();
    plinths.computeBoundingSphere();
    for (const h of ray.intersectObjects([cards, plinths, ...plates], false)) {
      let tok: Tok | undefined;
      if (h.object === cards && h.faceIndex != null) tok = toks[Math.floor(h.faceIndex / 4)];
      else if (h.object === plinths && h.instanceId != null) tok = toks[h.instanceId];
      if (tok) { if (tok.interactive) return { emp: tok.id }; continue; }
      if (h.object.userData.dept) return { dept: h.object.userData.dept };
    }
    return {};
  };
  let hoverId: EmployeeId | null = null;
  const setHover = (id: EmployeeId | null) => {
    if (id === hoverId) return;
    hoverId = id;
    renderer.domElement.style.cursor = id ? 'pointer' : '';
    hoverCbs.forEach((cb) => cb(id));
  };
  let down: { x: number; y: number } | null = null;
  let moveEvt: PointerEvent | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    const hit = pick(e.clientX, e.clientY);
    if (hit.emp) empCbs.forEach((cb) => cb(hit.emp!));
    else if (hit.dept) deptCbs.forEach((cb) => cb(hit.dept!));
  };
  const onMove = (e: PointerEvent) => { if (e.pointerType === 'mouse') moveEvt = e; };
  const onLeave = () => { moveEvt = null; setHover(null); };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);

  // ---- per-frame token placement
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qx = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const e1 = new THREE.Euler(), cardM = new THREE.Matrix4();
  const badgeQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0));
  const CORNERS: [number, number, number][] = [[-CARD_W / 2, 0, 0], [CARD_W / 2, 0, 0], [CARD_W / 2, CARD_H, 0], [-CARD_W / 2, CARD_H, 0]];
  const graphite = new THREE.Color('#2b2c31'), amber = new THREE.Color('#ffb020'), red = new THREE.Color('#ff3b30'), white = new THREE.Color('#ffffff');

  const placeTokens = (t: number, dt: number) => {
    let nh = 0, ns = 0, nb = 0, nm = 0;
    const k = 1 - Math.exp(-dt * 7);
    for (const tok of toks) {
      // spring bounce
      if (tok.y !== 0 || tok.vy !== 0) {
        tok.vy += (-140 * tok.y - 9 * tok.vy) * dt;
        tok.y += tok.vy * dt;
        if (Math.abs(tok.y) < 1e-4 && Math.abs(tok.vy) < 1e-3) tok.y = tok.vy = 0;
      }
      tok.yaw += (tok.yawTarget - tok.yaw) * k;
      tok.halo += (tok.haloTarget - tok.halo) * k;
      tok.dim += (tok.dimTarget - tok.dim) * k;
      tok.ringCur.lerp(tok.ringTarget, 1 - Math.exp(-dt * 4));
      tok.backCur.lerp(tok.backTarget, 1 - Math.exp(-dt * 4));
      tok.ringPulse = Math.max(0, tok.ringPulse - dt * 1.6);
      tok.shake = Math.max(0, tok.shake - dt * 1.4);
      const lift = (tok.id === hoverId ? 0.09 : 0) + (tok.selected ? 0.12 + Math.sin(t * 3) * 0.03 : 0);
      tok.lift += (lift - tok.lift) * Math.min(1, dt * 12);
      const ly = tok.lift;
      const yaw = tok.yaw + Math.sin(t * 40) * tok.shake * 0.25;

      // plinth + loyalty ring
      m4.compose(tok.base, q.identity(), s.set(1, 1, 1));
      plinths.setMatrixAt(tok.idx, m4);
      tmpC.copy(tok.backCur).lerp(graphite, 0.6).multiplyScalar(tok.dim);
      plinths.setColorAt(tok.idx, tmpC);
      v.copy(tok.base); v.y += PLINTH_H * 0.5;
      const rs = 1 + tok.ringPulse * 0.6 + (tok.selected ? 0.12 : 0);
      m4.compose(v, q, s.set(rs, 1, rs));
      rings.setMatrixAt(tok.idx, m4);
      tmpC.copy(tok.ringCur).lerp(white, tok.ringPulse * 0.5).multiplyScalar(tok.dim);
      rings.setColorAt(tok.idx, tmpC);

      // card: translate → yaw → lean back
      v.copy(tok.base); v.y += PLINTH_H + tok.y + ly;
      e1.set(-LEAN, yaw, 0, 'YXZ');
      q.setFromEuler(e1);
      cardM.compose(v, q, s.set(1, 1, 1));
      for (let back = 0; back < 2; back++) {
        const o = (tok.idx * 2 + (back ? 0 : 1)) * 4;
        const grow = back ? 1.07 : 1;
        for (let c = 0; c < 4; c++) {
          const [cx, cy] = CORNERS[c];
          v.set(cx * grow, back ? cy * 1.05 - 0.015 : cy, back ? -0.012 : 0).applyMatrix4(cardM);
          cardPos.setXYZ(o + c, v.x, v.y, v.z);
          if (back) tmpC.copy(tok.backCur).multiplyScalar(tok.dim * (1 + tok.ringPulse * 0.6));
          else tmpC.setScalar(tok.dim);
          cardCol.setXYZ(o + c, tmpC.r, tmpC.g, tmpC.b);
        }
      }
      // halo (Loyal), star (promise), badge (rebel), shimmer (mole)
      if (tok.halo > 0.01) {
        v.set(0, CARD_H + 0.18 + (still() ? 0 : Math.sin(t * 2 + tok.idx) * 0.015), 0).applyMatrix4(cardM);
        m4.compose(v, qx.identity(), s.setScalar(tok.halo));
        halos.setMatrixAt(nh++, m4);
      }
      if (tok.promise) {
        v.set(CARD_W / 2 - 0.02, CARD_H - 0.02, 0.04).applyMatrix4(cardM);
        m4.compose(v, badgeQ, s.setScalar(0.2 * (still() ? 1 : 1 + Math.sin(t * 3 + tok.idx) * 0.08)));
        stars.setMatrixAt(ns++, m4);
      }
      if (tok.rebel) {
        v.set(-CARD_W / 2 + 0.03, CARD_H - 0.02, 0.04).applyMatrix4(cardM);
        m4.compose(v, badgeQ, s.setScalar(0.22 + tok.shake * 0.12));
        badges.setMatrixAt(nb++, m4);
      }
      if (tok.mole) {
        v.set(0, CARD_H * 0.5, -0.06).applyMatrix4(cardM);
        const pulse = still() ? 1 : 0.9 + Math.sin(t * 2.4 + tok.idx) * 0.14;
        m4.compose(v, q, s.set(1.15 * pulse, 1.35 * pulse, 1));
        moles.setMatrixAt(nm++, m4);
      }
    }
    cardPos.needsUpdate = cardCol.needsUpdate = true;
    for (const [mesh, n] of [[plinths, toks.length], [rings, toks.length], [halos, nh], [stars, ns], [badges, nb], [moles, nm]] as const) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    (moles.material as THREE.MeshBasicMaterial).opacity = still() ? 0.7 : 0.55 + Math.sin(t * 1.7) * 0.25;

    const sel = toks.find((x) => x.selected);
    beam.visible = pool.visible = !!sel;
    if (sel) {
      beam.position.copy(sel.base); pool.position.copy(sel.base); pool.position.y += 0.006;
      (beam.material as THREE.MeshBasicMaterial).opacity = still() ? 0.45 : 0.4 + Math.sin(t * 2) * 0.08;
    }
  };

  const placeTiles = (t: number, dt: number) => {
    const k = 1 - Math.exp(-dt * 3);
    for (const tile of tiles.values()) {
      tile.frameCur.lerp(tile.frameTarget, k);
      tile.flash = Math.max(0, tile.flash - dt * 1.2);
      tile.crackFlash = Math.max(0, tile.crackFlash - dt * 0.9);
      let em = tile.emissive, glowOp = tile.glowOpacity;
      tile.frameMat.color.copy(tile.frameCur).multiplyScalar(0.35);
      tile.frameMat.emissive.copy(tile.frameCur);
      if (tile.pulse) {
        const sp = still() ? 0.5 : 0.5 + 0.5 * Math.sin(t * (tile.pulse === 2 ? 6 : 3.2));
        // unstable floors flicker like a failing tube light
        const flick = tile.pulse === 1 && !still() && Math.sin(t * 23.0) * Math.sin(t * 7.3) > 0.82 ? 0.25 : 1;
        tile.frameMat.emissive.copy(tile.pulse === 2 ? red : amber);
        em = (0.6 + 1.2 * sp) * flick;
        glowOp = Math.max(glowOp, 0.18 + 0.2 * sp);
        tile.glowMat.color.copy(tile.pulse === 2 ? red : amber);
      } else if (tile.lead != null) {
        tile.glowMat.color.copy(tile.frameCur);
      }
      tile.frameMat.emissiveIntensity = em + tile.flash * 2.5;
      tile.glowMat.opacity = glowOp + tile.flash * 0.5;
      tile.glow.visible = tile.glowMat.opacity > 0.01;
      // cracks
      const cOp = Math.min(1, tile.crackBase + tile.crackFlash);
      tile.crackMat.opacity = cOp;
      tile.crack.visible = cOp > 0.01;
      tile.crackMat.color.setScalar(1 + tile.crackFlash * 1.5);
      // capture sweep
      if (tile.sweepT >= 0) {
        tile.sweepT += dt / 0.9;
        const p = Math.min(1, tile.sweepT);
        tile.sweep.visible = true;
        tile.sweep.scale.setScalar(0.25 + p * 1.15);
        tile.sweepMat.opacity = (1 - p) * 0.9;
        if (tile.sweepT >= 1) { tile.sweepT = -1; tile.sweep.visible = false; }
      }
    }
    outlineMat.opacity = still() ? 0.85 : 0.6 + 0.3 * Math.sin(t * 3);
    // sparks
    if (sparks.visible) {
      let alive = 0;
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6 * dt;
        sparkPos.setXYZ(i, sparkPos.getX(i) + sparkVel[i * 3] * dt, Math.max(TOP, sparkPos.getY(i) + sparkVel[i * 3 + 1] * dt), sparkPos.getZ(i) + sparkVel[i * 3 + 2] * dt);
        const f = Math.max(0, sparkLife[i]);
        sparkCol.setXYZ(i, sparkBase[i * 3] * f * 1.6, sparkBase[i * 3 + 1] * f * 1.6, sparkBase[i * 3 + 2] * f * 1.6);
        if (sparkLife[i] > 0) alive++; else sparkPos.setY(i, -100);
      }
      sparkPos.needsUpdate = sparkCol.needsUpdate = true;
      sparks.visible = alive > 0;
    }
  };

  // ---- loop (paused while the tab is hidden)
  let raf = 0, prev = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 0.1), t = now / 1000;
    prev = now;
    if (compactDirty && lastView) { compactDirty = false; update(lastView, lastOpts); }
    if (moveEvt) { setHover(pick(moveEvt.clientX, moveEvt.clientY).emp ?? null); moveEvt = null; }
    // camera: slow settle on load, then a gentle glide for focusDept
    settle = Math.max(0, settle - dt / 2.2);
    const k = still() ? 1 : 1 - Math.exp(-dt * (settle > 0 ? 1.6 : 3.2));
    camTarget.lerp(wantTarget, k);
    camDist += (wantDist - camDist) * k;
    camYaw += (0 - camYaw) * k;
    const d = v.set(Math.sin(camYaw) * Math.cos(TILT), Math.sin(TILT), Math.cos(camYaw) * Math.cos(TILT));
    camera.position.copy(camTarget).addScaledVector(d, camDist);
    camera.lookAt(camTarget);
    key.target.position.copy(camTarget);
    key.position.copy(camTarget).add(s.set(-7, 13, 5));
    placeTiles(t, dt);
    placeTokens(t, dt);
    renderer.render(scene, camera);
  };
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden) { prev = performance.now(); raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', onVis);
  raf = requestAnimationFrame(frame);

  // Web fonts arrive after the first paint: redraw plaques and portraits once they do.
  let fontsTick = 0;
  document.fonts?.ready.then(() => {
    fontsTick++;
    paintAtlas();
    for (const t of tiles.values()) t.plaqueKey = '';
    if (lastView) update(lastView, lastOpts);
  });
  let lastOpts: BoardOptions = {};

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    const sz = small() ? 1024 : 2048;
    if (key.shadow.mapSize.x !== sz) { key.shadow.mapSize.set(sz, sz); key.shadow.map?.dispose(); key.shadow.map = null; }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    update: (view, opts = {}) => { lastOpts = opts; update(view, opts); },
    onEmployeeClick: (cb) => void empCbs.push(cb),
    onDeptClick: (cb) => void deptCbs.push(cb),
    onEmployeeHover: (cb) => void hoverCbs.push(cb),
    focusDept: (id) => { focused = id; applyFocus(); },
    resize,
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      clearLayout();
      Object.values(geo).forEach((g) => g.dispose());
      for (const m of [plinths, rings, halos, stars, badges, moles]) { (m.material as THREE.Material).dispose(); m.dispose(); }
      for (const o of [cards, beam, pool, ground] as THREE.Mesh[]) (o.material as THREE.Material).dispose();
      cards.customDepthMaterial?.dispose();
      cardGeo.dispose(); sparkGeo.dispose(); (sparks.material as THREE.Material).dispose();
      sideMat.dispose(); outlineMat.dispose(); atlas.dispose();
      [tex.ground, tex.glow, tex.beam, tex.crack, tex.rebel, tex.star, ...tex.floors.values()].forEach((t) => t.dispose());
      renderer.dispose();
      el.remove();
      vignette.remove();
    },
  };
}

