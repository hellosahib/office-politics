// three.js board renderer (D1, D20). One scene, tokens/tiles created once per id and mutated on update().
import * as THREE from 'three';
import type { DeptId, EmployeeId, EmployeeView, GameView, LoyaltyState, DepartmentView } from '../engine/types';

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

const R = 1.5;                 // hex circumradius (flat-top)
const SPACING = 2.1 * R;
const TILE_H = 0.2;
const TOK_R = 0.32, TOK_H = 0.14;
const TILT = THREE.MathUtils.degToRad(55);
const BG = '#0f1115';
const NEUTRAL_FILL = '#343a46', NEUTRAL_RIM = '#6b7280';
const LOYALTY_COLOR: Record<LoyaltyState, string> = {
  Loyal: '#ffcc33', Favorable: '#3ddc84', Neutral: '#9aa0a6', Skeptical: '#ff9f43', Rebel: '#ff3b30',
};
const DIM_OPACITY = 0.35;
// 2x2 grid inside the hex, shifted south so the label can sit on the north half
const GRID: [number, number][] = [[-0.45, 0], [0.45, 0], [-0.45, 0.72], [0.45, 0.72]];

const slotPos = (slot: DepartmentView['slot']) => {
  if (slot === 'center') return new THREE.Vector3();
  const a = (slot * Math.PI) / 3;
  return new THREE.Vector3(Math.sin(a) * SPACING, 0, -Math.cos(a) * SPACING);
};
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

interface Tile {
  group: THREE.Group; fill: THREE.Mesh; rim: THREE.Mesh; outline: THREE.Mesh; label: THREE.Sprite;
  fillMat: THREE.MeshStandardMaterial; rimMat: THREE.MeshBasicMaterial; labelMat: THREE.SpriteMaterial;
  labelKey: string; rimColor: THREE.Color; pulse: 0 | 1 | 2;
}
interface Token {
  group: THREE.Group; body: THREE.Mesh; top: THREE.Mesh; ring: THREE.Mesh; sel: THREE.Mesh;
  flag: THREE.Mesh; mole: THREE.Mesh; star: THREE.Mesh; baseY: number; interactive: boolean; selected: boolean;
}

export function createBoard(container: HTMLElement): Board {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(dpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(renderer.domElement);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight('#dfe6ff', '#1a1d24', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  sun.position.set(4, 10, 6);
  scene.add(sun);

  // ---- shared geometry
  const geo = {
    hex: new THREE.CylinderGeometry(R, R, TILE_H, 6).rotateY(Math.PI / 6).translate(0, TILE_H / 2, 0),
    rim: new THREE.RingGeometry(R * 0.9, R, 6, 1).rotateX(-Math.PI / 2),
    rimThick: new THREE.RingGeometry(R * 0.84, R, 6, 1).rotateX(-Math.PI / 2),
    outline: new THREE.RingGeometry(R * 1.04, R * 1.12, 6, 1).rotateX(-Math.PI / 2),
    ground: new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2),
    body: new THREE.CylinderGeometry(TOK_R, TOK_R, TOK_H, 32).translate(0, TOK_H / 2, 0),
    top: new THREE.CircleGeometry(TOK_R * 0.96, 32).rotateX(-Math.PI / 2),
    ring: new THREE.TorusGeometry(TOK_R + 0.03, 0.04, 8, 40).rotateX(Math.PI / 2),
    sel: new THREE.TorusGeometry(TOK_R + 0.12, 0.035, 8, 40).rotateX(Math.PI / 2),
    flag: new THREE.ConeGeometry(0.08, 0.26, 8),
    mole: new THREE.SphereGeometry(0.085, 12, 8),
    star: (() => {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5, r = i % 2 ? 0.05 : 0.12;
        i ? s.lineTo(Math.sin(a) * r, Math.cos(a) * r) : s.moveTo(0, r);
      }
      return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
    })(),
  };

  // ---- material / texture caches (keyed by string, so 28 tokens share a handful of materials)
  const mats = new Map<string, THREE.Material>();
  const mat = (key: string, dim: boolean, make: () => THREE.Material) => {
    const k = dim ? key + '|dim' : key;
    let m = mats.get(k);
    if (!m) {
      m = make();
      if (dim) Object.assign(m, { transparent: true, opacity: DIM_OPACITY, depthWrite: false });
      mats.set(k, m);
    }
    return m;
  };
  const basic = (color: string) => () => new THREE.MeshBasicMaterial({ color });
  const texs = new Map<string, THREE.CanvasTexture>();
  const canvasTex = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    let t = texs.get(key);
    if (t) return t;
    const s = dpr(), cv = document.createElement('canvas');
    cv.width = w * s; cv.height = h * s;
    const c = cv.getContext('2d')!;
    c.scale(s, s);
    draw(c);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    texs.set(key, t);
    return t;
  };

  const tokenTex = (text: string, bg: string) => canvasTex(`tok|${text}|${bg}`, 128, 128, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#fff'; c.font = 'bold 58px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 4;
    c.fillText(text, 64, 68);
  });

  const LW = 360, LH = 104;
  const labelTex = (title: string, sub: string, warn: string, warnColor: string) =>
    canvasTex(`lbl|${title}|${sub}|${warn}`, LW, LH, (c) => {
      c.fillStyle = 'rgba(15,17,21,.78)';
      c.beginPath(); c.roundRect(2, 2, LW - 4, LH - 4, 14); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const fit = (t: string, px: number, weight: string) => {
        c.font = `${weight} ${px}px system-ui, sans-serif`;
        while (c.measureText(t).width > LW - 24 && px > 10) c.font = `${weight} ${--px}px system-ui, sans-serif`;
      };
      c.fillStyle = '#fff'; fit(title, 32, 'bold'); c.fillText(title, LW / 2, warn ? 26 : 34);
      c.fillStyle = '#c9d1dc'; fit(sub, 26, '600'); c.fillText(sub, LW / 2, warn ? 56 : 72);
      if (warn) { c.fillStyle = warnColor; fit(warn, 22, 'bold'); c.fillText(warn, LW / 2, 84); }
    });

  // ---- static scene
  const ground = new THREE.Mesh(geo.ground, new THREE.MeshStandardMaterial({ color: '#151922', roughness: 1 }));
  ground.position.y = -0.01;
  scene.add(ground);
  const outlineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });

  const tiles = new Map<DeptId, Tile>();
  const tokens = new Map<EmployeeId, Token>();
  const deptPos = new Map<DeptId, THREE.Vector3>();
  let pickables: THREE.Object3D[] = [];
  let layoutKey = '';

  const clearLayout = () => {
    for (const t of tiles.values()) {
      scene.remove(t.group);
      t.fillMat.dispose(); t.rimMat.dispose(); t.labelMat.dispose();
    }
    tiles.clear(); tokens.clear(); deptPos.clear(); pickables = [];
  };

  const buildLayout = (view: GameView) => {
    clearLayout();
    for (const d of view.departments) {
      const group = new THREE.Group();
      group.position.copy(slotPos(d.slot));
      deptPos.set(d.id, group.position.clone());
      const fillMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
      const rimMat = new THREE.MeshBasicMaterial();
      const labelMat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
      const fill = new THREE.Mesh(geo.hex, fillMat);
      fill.userData.dept = d.id;
      const rim = new THREE.Mesh(geo.rim, rimMat);
      rim.position.y = TILE_H + 0.003;
      const outline = new THREE.Mesh(geo.outline, outlineMat);
      outline.position.y = 0.02;
      const label = new THREE.Sprite(labelMat);
      label.position.set(0, TILE_H + 0.45, -R * 0.62);
      label.scale.set(2.6, (2.6 * LH) / LW, 1);
      label.renderOrder = 10;
      group.add(fill, rim, outline, label);
      scene.add(group);
      pickables.push(fill);
      tiles.set(d.id, { group, fill, rim, outline, label, fillMat, rimMat, labelMat, labelKey: '', rimColor: new THREE.Color(), pulse: 0 });

      d.employeeIds.forEach((eid, i) => {
        const tg = new THREE.Group();
        const [gx, gz] = GRID[i % 4];
        tg.position.set(gx, TILE_H, gz);
        const mk = (g: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
          const m = new THREE.Mesh(g);
          m.position.set(x, y, z);
          tg.add(m);
          return m;
        };
        const body = mk(geo.body), top = mk(geo.top, 0, TOK_H + 0.002), ring = mk(geo.ring, 0, TOK_H * 0.5);
        const sel = mk(geo.sel, 0, 0.02);
        const flag = mk(geo.flag, TOK_R * 0.75, TOK_H + 0.14, -TOK_R * 0.75);
        const mole = mk(geo.mole, -TOK_R * 0.8, TOK_H + 0.09, -TOK_R * 0.8);
        const star = mk(geo.star, TOK_R * 0.82, TOK_H + 0.03, TOK_R * 0.6);
        sel.material = mat('sel', false, basic('#ffffff'));
        body.userData.emp = top.userData.emp = eid;
        group.add(tg);
        pickables.push(body, top);
        tokens.set(eid, { group: tg, body, top, ring, sel, flag, mole, star, baseY: TILE_H, interactive: true, selected: false });
      });
    }
    fitCamera();
  };

  // ---- update
  const update = (view: GameView, opts: BoardOptions = {}) => {
    const key = view.departments.map((d) => `${d.id}@${d.slot}:${d.employeeIds.join(',')}`).join('|');
    if (key !== layoutKey) { layoutKey = key; buildLayout(view); }
    const color = (p: number | null) => (p == null ? null : view.players.find((pl) => pl.id === p)?.color ?? null);
    const name = (p: number) => view.players.find((pl) => pl.id === p)?.name ?? `Player ${p + 1}`;
    const hl = new Set(opts.highlightDepts ?? []);

    for (const d of view.departments) {
      const t = tiles.get(d.id)!;
      const lead = color(d.teamLead);
      const mine = d.teamLead != null && d.teamLead === view.viewer;
      const fill = new THREE.Color(lead ?? NEUTRAL_FILL);
      if (lead) fill.lerp(new THREE.Color('#2a2f3a'), mine ? 0.45 : 0.6);
      const prot = d.protectedUntilRound > view.round;
      if (prot) fill.lerp(new THREE.Color('#8ec5ff'), 0.25);
      t.fillMat.color.copy(fill);
      t.fillMat.emissive.set(mine ? lead! : '#000000');
      t.fillMat.emissiveIntensity = mine ? 0.12 : 0;
      t.rimColor.set(lead ?? NEUTRAL_RIM);
      if (mine) t.rimColor.offsetHSL(0, 0, 0.12);
      t.rim.geometry = mine ? geo.rimThick : geo.rim;
      t.pulse = d.instability >= 2 ? 2 : d.instability === 1 ? 1 : 0;
      if (!t.pulse) t.rimMat.color.copy(t.rimColor);
      t.outline.visible = hl.has(d.id);

      const sub = (d.teamLead == null ? 'Neutral' : `Lead: ${name(d.teamLead)}${mine ? ' (you)' : ''}`)
        + (d.rebelCount > 0 ? ` · ${d.rebelCount} rebel${d.rebelCount > 1 ? 's' : ''}` : '');
      const warn = [['', 'Unstable', 'Leadership crisis', 'Full rebellion'][d.instability], prot ? 'Protected' : '']
        .filter(Boolean).join(' · ');
      const lk = `${d.name}|${sub}|${warn}`;
      if (lk !== t.labelKey) {
        t.labelKey = lk;
        t.labelMat.map = labelTex(d.name, sub, warn, d.instability >= 2 ? '#ff6b61' : d.instability ? '#ffb84d' : '#8ec5ff');
        t.labelMat.needsUpdate = true;
      }
    }

    const selectable = opts.selectable ? new Set(opts.selectable) : null;
    for (const e of view.employees) {
      const k = tokens.get(e.id);
      if (!k) continue;
      const dim = !!selectable && !selectable.has(e.id);
      k.interactive = !dim;
      k.selected = opts.selected === e.id;
      applyToken(k, e, color(e.politicalOwner), dim);
    }
    if (hoverId && !tokens.get(hoverId)?.interactive) setHover(null);
  };

  const applyToken = (k: Token, e: EmployeeView, owner: string | null, dim: boolean) => {
    const bg = owner ? new THREE.Color(owner).lerp(new THREE.Color('#1c2028'), 0.25).getStyle() : '#4b5160';
    const ini = initials(e.name);
    k.body.material = mat('body', dim, () => new THREE.MeshStandardMaterial({ color: '#232832', roughness: 0.6 }));
    k.top.material = mat(`top|${ini}|${bg}`, dim, () => new THREE.MeshBasicMaterial({ map: tokenTex(ini, bg) }));
    k.ring.material = mat(`ring|${e.loyalty}`, dim, basic(LOYALTY_COLOR[e.loyalty]));
    k.flag.material = mat('flag', dim, basic('#ff3b30'));
    k.mole.material = mat('mole', dim, basic('#b45cff'));
    k.star.material = mat('star', dim, basic('#fff1a8'));
    k.flag.visible = e.loyalty === 'Rebel';
    k.mole.visible = !!e.mole;
    k.star.visible = !!e.promise;
    k.sel.visible = k.selected;
  };

  // ---- camera fit: closed-form distance so every board point lands inside the frustum
  const camTarget = new THREE.Vector3(), wantTarget = new THREE.Vector3(), baseTarget = new THREE.Vector3();
  let camDist = 20, wantDist = 20, baseDist = 20, focused: DeptId | null = null;
  const dir = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT));
  const up = new THREE.Vector3(0, Math.cos(TILT), -Math.sin(TILT));
  const fitCamera = () => {
    const pts: THREE.Vector3[] = [];
    for (const p of deptPos.values())
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        for (const y of [0, TILE_H + 0.8]) pts.push(new THREE.Vector3(p.x + Math.cos(a) * R, y, p.z + Math.sin(a) * R));
      }
    if (!pts.length) return;
    const box = new THREE.Box3().setFromPoints(pts);
    baseTarget.set((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / 1.06;
    const tanH = tanV * camera.aspect;
    baseDist = 0;
    for (const p of pts) {
      const q = p.clone().sub(baseTarget);
      baseDist = Math.max(baseDist, q.dot(dir) + Math.abs(q.x) / tanH, q.dot(dir) + Math.abs(q.dot(up)) / tanV);
    }
    applyFocus();
    if (!started) { camTarget.copy(wantTarget); camDist = wantDist; started = true; }
  };
  let started = false;
  const applyFocus = () => {
    const p = focused ? deptPos.get(focused) : undefined;
    wantTarget.copy(baseTarget);
    wantDist = baseDist;
    if (p) { wantTarget.lerp(p, 0.6); wantDist *= 0.72; }
  };

  // ---- picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const empCbs: ((id: EmployeeId) => void)[] = [], deptCbs: ((id: DeptId) => void)[] = [];
  const hoverCbs: ((id: EmployeeId | null) => void)[] = [];
  const pick = (x: number, y: number): { emp?: EmployeeId; dept?: DeptId } => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(pickables, false)) {
      const emp = h.object.userData.emp as EmployeeId | undefined;
      if (emp && tokens.get(emp)?.interactive) return { emp };
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

  // ---- loop
  const amber = new THREE.Color('#ffb020'), red = new THREE.Color('#ff3b30');
  let raf = 0, prev = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min((now - prev) / 1000, 0.1), t = now / 1000;
    prev = now;
    if (moveEvt) { setHover(pick(moveEvt.clientX, moveEvt.clientY).emp ?? null); moveEvt = null; }
    const k = 1 - Math.exp(-dt * 6);
    camTarget.lerp(wantTarget, k);
    camDist += (wantDist - camDist) * k;
    camera.position.copy(camTarget).addScaledVector(dir, camDist);
    camera.lookAt(camTarget);
    for (const tile of tiles.values()) {
      if (!tile.pulse) continue;
      const s = 0.5 + 0.5 * Math.sin(t * (tile.pulse === 2 ? 6 : 3.5));
      tile.rimMat.color.copy(tile.pulse === 2 ? red : amber).multiplyScalar(0.55 + 0.45 * s);
    }
    outlineMat.opacity = 0.6 + 0.3 * Math.sin(t * 3);
    for (const [id, tok] of tokens) {
      const y = tok.baseY + (id === hoverId ? 0.1 : 0) + (tok.selected ? 0.08 + Math.sin(t * 3) * 0.05 : 0);
      tok.group.position.y += (y - tok.group.position.y) * Math.min(1, dt * 12);
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    update,
    onEmployeeClick: (cb) => void empCbs.push(cb),
    onDeptClick: (cb) => void deptCbs.push(cb),
    onEmployeeHover: (cb) => void hoverCbs.push(cb),
    focusDept: (id) => { focused = id; applyFocus(); },
    resize,
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      clearLayout();
      Object.values(geo).forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
      (ground.material as THREE.Material).dispose();
      outlineMat.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
