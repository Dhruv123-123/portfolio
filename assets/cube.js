import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HALF_PI = Math.PI / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Standard Western color scheme, white on U and green on F.
// `up` is how each face is drawn in a net and how it sits when brought to the front.
const FACES = {
  U: { n: V(0, 1, 0), up: V(0, 0, -1), color: 'white', name: 'white side: work', label: 'Work' },
  D: { n: V(0, -1, 0), up: V(0, 0, 1), color: 'yellow', name: 'yellow side: under construction', label: 'Under construction' },
  F: { n: V(0, 0, 1), up: V(0, 1, 0), color: 'green', name: 'green side: beliefs and rabbit holes', label: 'Beliefs and rabbit holes' },
  B: { n: V(0, 0, -1), up: V(0, 1, 0), color: 'blue', name: 'blue side: AI right now', label: 'AI right now' },
  R: { n: V(1, 0, 0), up: V(0, 1, 0), color: 'red', name: 'red side: training', label: 'Training' },
  L: { n: V(-1, 0, 0), up: V(0, 1, 0), color: 'orange', name: 'orange side: off the clock', label: 'Off the clock' },
};
for (const f of Object.values(FACES)) f.right = new THREE.Vector3().crossVectors(f.up, f.n);
const ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];
const COLORS = {
  white: 0xf4f4f1, yellow: 0xffd500, red: 0xb71234,
  orange: 0xff5800, blue: 0x0046ad, green: 0x009b48,
};
const AXIS_FACE = { x: ['R', 'L'], y: ['U', 'D'], z: ['F', 'B'] };

// ---------- DOM ----------
const stageEl = $('#stage');
const canvas = $('#cube');
const fx = $('#fx');
const floorEl = $('#floor');
const dock = $('#dock');
const hintEl = $('#hint');
const btnScramble = $('#scramble');
const btnSolve = $('#solve');
const btnReset = $('#reset');
const timeEl = $('#time');
const movesEl = $('#moves');
const statusEl = $('#status');
const seqEl = $('#seq');
const whereFace = $('#where-face');
const whereFit = $('#where-fit');
const netEl = $('#net');

// ---------- renderer ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  document.documentElement.classList.add('no-webgl');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const key = new THREE.DirectionalLight(0xffffff, 1.9);
key.position.set(-5, 7, 9);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.5);
rim.position.set(6, -2, -6);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
camera.position.set(0, 0, 14);

const floatG = new THREE.Group();
const spinG = new THREE.Group();
const cube = new THREE.Group();
scene.add(floatG);
floatG.add(spinG);
spinG.add(cube);

// ---------- build the cube ----------
const bodyGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.12);
const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1014, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.45 });

function tileGeometry() {
  const s = 0.8, r = 0.14, h = s / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-h + r, -h);
  sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r);
  sh.lineTo(h, h - r); sh.quadraticCurveTo(h, h, h - r, h);
  sh.lineTo(-h + r, h); sh.quadraticCurveTo(-h, h, -h, h - r);
  sh.lineTo(-h, -h + r); sh.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ExtrudeGeometry(sh, {
    depth: 0.02, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.016, bevelSegments: 3, curveSegments: 8,
  });
}
const tileGeo = tileGeometry();
const Z = V(0, 0, 1);

const cubies = [];
const tiles = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  if (!x && !y && !z) continue;
  const c = new THREE.Group();
  c.position.set(x, y, z);
  c.add(new THREE.Mesh(bodyGeo, bodyMat));
  for (const L of ORDER) {
    const f = FACES[L];
    if (Math.round(c.position.dot(f.n)) !== 1) continue;
    const mat = new THREE.MeshPhysicalMaterial({
      color: COLORS[f.color], roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.4, specularIntensity: 0.35,
      emissive: COLORS[f.color], emissiveIntensity: 0,
    });
    const t = new THREE.Mesh(tileGeo, mat);
    t.quaternion.setFromUnitVectors(Z, f.n);
    t.position.copy(f.n).multiplyScalar(0.47);
    t.userData = { color: f.color, n0: f.n.clone(), base: 0 };
    c.add(t);
    tiles.push(t);
  }
  c.userData.home = { p: c.position.clone(), q: c.quaternion.clone() };
  cube.add(c);
  cubies.push(c);
}
const centerOf = (L) => cubies.find((c) => c.position.equals(FACES[L].n));

// Monogram on the white center, where a real cube carries its logo.
async function addMonogram() {
  try { await Promise.race([document.fonts.load('600 140px Geist'), new Promise((r) => setTimeout(r, 1200))]); } catch (e) { /* fall back */ }
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#17181d';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '600 128px Geist, "Helvetica Neue", Arial, sans-serif';
  g.fillText('DR', 128, 136);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.quaternion.setFromUnitVectors(Z, FACES.U.n);
  m.position.copy(FACES.U.n).multiplyScalar(0.47 + 0.0365);
  centerOf('U').add(m);
}
addMonogram();

// ---------- sizing ----------
let W = 1, H = 1;
const RADIUS = 2.75;
function resize() {
  const r = stageEl.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false);
  fx.width = W * Math.min(window.devicePixelRatio || 1, 2);
  fx.height = H * Math.min(window.devicePixelRatio || 1, 2);
  camera.aspect = W / H;
  const top = 16;
  const bottom = r.bottom - dock.getBoundingClientRect().top + 8;
  const free = Math.max(160, H - top - bottom);
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const byH = (RADIUS / Math.tan(vHalf)) * (H / free);
  const byW = (RADIUS / Math.tan(hHalf)) / 0.92;
  camera.position.z = Math.max(byH, byW, 9);
  camera.setViewOffset(W, H, 0, (bottom - top) / 2, W, H);
  camera.updateProjectionMatrix();
  // Shadow sits under the projected bottom of the cube.
  const p = V(0, -2.35, 0).project(camera);
  floorEl.style.top = `${((1 - p.y) / 2) * H}px`;
  const w = (V(1.9, -2.35, 0).project(camera).x - p.x) * W;
  floorEl.style.width = `${Math.max(120, w * 2)}px`;
  floorEl.style.height = `${Math.max(24, w * 0.32)}px`;
}
new ResizeObserver(resize).observe(stageEl);
resize();

// ---------- orientation of the whole cube ----------
const TILT = new THREE.Quaternion()
  .setFromAxisAngle(V(1, 0, 0), 0.44)
  .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -0.6));
const TILT_INV = TILT.clone().invert();

function viewQuat(L, up) {
  const f = FACES[L];
  const u = (up || f.up).clone();
  const right = new THREE.Vector3().crossVectors(u, f.n);
  const m = new THREE.Matrix4().makeBasis(right, u, f.n).transpose();
  return TILT.clone().multiply(new THREE.Quaternion().setFromRotationMatrix(m));
}

// The face pointing most toward the camera, given an orientation.
function frontFace(q) {
  let best = null, bestZ = -2;
  for (const L of ORDER) {
    const z = FACES[L].n.clone().applyQuaternion(q).z;
    if (z > bestZ) { bestZ = z; best = L; }
  }
  return best;
}

// Nearest resting view: the given face in front, rolled whichever way is closest to upright.
function restingQuat(q, L = null) {
  const untilted = TILT_INV.clone().multiply(q);
  const face = L || frontFace(untilted);
  const f = FACES[face];
  const cands = [f.up, f.right, f.up.clone().negate(), f.right.clone().negate()];
  let best = cands[0], bestY = -2;
  for (const c of cands) {
    const y = c.clone().applyQuaternion(untilted).y;
    if (y > bestY) { bestY = y; best = c; }
  }
  return { face, q: viewQuat(face, best) };
}

let view = null; // { from, to, t0, dur }
function animateView(to, dur = 700) {
  if (reduceMotion || !dur) { cube.quaternion.copy(to); view = null; return; }
  view = { from: cube.quaternion.clone(), to: to.clone(), t0: performance.now(), dur };
}
function focusFace(L) {
  animateView(restingQuat(cube.quaternion, L).q, 650);
}

// ---------- layer turns ----------
let chain = Promise.resolve();
let pending = 0;
function enqueue(fn) {
  pending++;
  chain = chain.then(fn).catch((e) => console.error(e)).finally(() => { pending--; refreshUI(); });
  refreshUI();
  return chain;
}
const busy = () => pending > 0;

function grabLayer(axis, layer) {
  const pivot = new THREE.Group();
  cube.add(pivot);
  for (const c of cubies) if (Math.round(c.position.dot(axis)) === layer) pivot.attach(c);
  return pivot;
}
const _m = new THREE.Matrix4();
function releaseLayer(pivot) {
  for (const c of [...pivot.children]) {
    cube.attach(c);
    c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
    _m.makeRotationFromQuaternion(c.quaternion);
    const e = _m.elements;
    for (let i = 0; i < 16; i++) e[i] = Math.round(e[i]);
    c.quaternion.setFromRotationMatrix(_m);
  }
  cube.remove(pivot);
}

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function spinLayer(pivot, axis, from, to, dur, ease = easeOut) {
  if (!dur || reduceMotion && dur > 0) {
    pivot.quaternion.setFromAxisAngle(axis, to);
    releaseLayer(pivot);
    return Promise.resolve();
  }
  return new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      pivot.quaternion.setFromAxisAngle(axis, from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(step);
      else { releaseLayer(pivot); res(); }
    };
    requestAnimationFrame(step);
  });
}

// amount: 1 = clockwise quarter, 2 = half, 3 = counter-clockwise quarter
function turn(face, amount, dur) {
  const n = FACES[face].n;
  const angle = amount === 3 ? HALF_PI : -amount * HALF_PI;
  const pivot = grabLayer(n, 1);
  return spinLayer(pivot, n, 0, angle, dur, amount === 2 ? easeInOut : easeOut);
}

const fmtMove = (m) => m.f + (m.a === 2 ? '2' : m.a === 3 ? '′' : '');
const invert = (m) => ({ f: m.f, a: (4 - m.a) % 4 });
function simplify(list) {
  const out = [];
  for (const m of list) {
    const top = out[out.length - 1];
    if (top && top.f === m.f) {
      const a = (top.a + m.a) % 4;
      out.pop();
      if (a) out.push({ f: m.f, a });
    } else out.push({ ...m });
  }
  return out;
}

// From a turn about a cube-local axis, back to notation.
function notationFor(axis, layer, quarters) {
  let a = axis.clone(), L = layer, k = quarters;
  if (a.x + a.y + a.z < 0) { a.negate(); L = -L; k = -k; }
  const key = a.x ? 'x' : a.y ? 'y' : 'z';
  const face = AXIS_FACE[key][L > 0 ? 0 : 1];
  const s = L > 0 ? 1 : -1;
  const amount = (((-s * k) % 4) + 4) % 4;
  return amount ? { f: face, a: amount } : null;
}

// ---------- state ----------
let history = [];          // every turn since the cube was last solved
let phase = 'idle';        // idle | free | scrambling | scrambled | solving | auto | intro
let moveCount = 0;
let tStart = 0;
let lastScramble = '';
let best = null;
try { best = JSON.parse(localStorage.getItem('dr-cube-best') || 'null'); } catch (e) { best = null; }

const fmtTime = (ms) => {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

function record(m, source) {
  if (!m) return;
  history.push(m);
  if (source === 'user') {
    if (phase === 'idle') { phase = 'free'; setStatus('Turned by hand. Put it back, or press Solve.'); }
    if (phase === 'scrambled') { phase = 'solving'; tStart = performance.now(); setStatus('Timer running.'); }
    if (phase === 'solving') moveCount++;
  }
  updateNet();
  if (source === 'user') checkSolved();
}

function isSolved() { return faceFits().every((n) => n === 9); }

function checkSolved() {
  if (!isSolved()) return;
  history = [];
  if (phase === 'solving') {
    const ms = performance.now() - tStart;
    const isBest = !best || ms < best;
    if (isBest) { best = ms; try { localStorage.setItem('dr-cube-best', JSON.stringify(ms)); } catch (e) { /* private mode */ } }
    timeEl.textContent = fmtTime(ms);
    phase = 'idle';
    setStatus(`<strong>Solved in ${fmtTime(ms)}</strong> with ${moveCount} turns.${isBest ? ' New best.' : ` Best is ${fmtTime(best)}.`}`);
    celebrate();
  } else {
    phase = 'idle';
    setStatus('Back in one piece. Scramble it for a timed solve.');
  }
  seqEl.textContent = '';
  refreshUI();
}

function setStatus(html) { statusEl.innerHTML = html; }

function refreshUI() {
  const solved = isSolved();
  const locked = phase === 'scrambling' || phase === 'auto' || phase === 'intro';
  btnScramble.disabled = locked;
  btnSolve.disabled = locked || solved || !history.length;
  btnReset.disabled = locked || (solved && phase === 'idle' && !moveCount);
  movesEl.textContent = moveCount;
}

// ---------- the net (cube map) and per-face progress ----------
for (const L of ORDER) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'net-face';
  b.dataset.face = L;
  b.setAttribute('aria-label', `Show the ${FACES[L].name}`);
  b.setAttribute('aria-pressed', 'false');
  b.title = FACES[L].label;
  b.appendChild(document.createElement('i'));
  b.addEventListener('click', () => focusFace(L));
  netEl.appendChild(b);
}

const _n = new THREE.Vector3();
let fits = { U: 9, D: 9, F: 9, B: 9, R: 9, L: 9 };
function faceFits() { return ORDER.map((L) => fits[L]); }

function updateNet() {
  const next = { U: 0, D: 0, F: 0, B: 0, R: 0, L: 0 };
  for (const t of tiles) {
    const c = t.parent;
    _n.copy(t.userData.n0).applyQuaternion(c.quaternion).round();
    const L = ORDER.find((k) => FACES[k].n.equals(_n));
    if (!L) continue;
    const f = FACES[L];
    if (t.userData.color === f.color) next[L]++;
  }
  fits = next;
  showFit();
}

let active = null;
function setActive(L) {
  if (L === active) return;
  active = L;
  document.documentElement.dataset.face = L;
  for (const a of document.querySelectorAll('.face')) a.classList.toggle('active', a.dataset.face === L);
  for (const b of netEl.children) b.setAttribute('aria-pressed', String(b.dataset.face === L));
  whereFace.textContent = FACES[L].label;
  showFit();
}
function showFit() {
  if (!active) return;
  const n = fits[active];
  whereFit.textContent = n === 9 ? '' : `${n}/9 in place`;
}

// ---------- pointer interaction ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const cubeQ = new THREE.Quaternion();
let drag = null;
const orbitVel = new THREE.Vector2();
let settleAt = 0;

function toScreen(local) {
  const p = cube.localToWorld(local.clone()).project(camera);
  return new THREE.Vector2(((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H);
}

function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(cube.children, true)[0];
  if (!hit || !hit.face) return null;
  let c = hit.object;
  while (c && !cubies.includes(c)) c = c.parent;
  if (!c) return null;
  cube.getWorldQuaternion(cubeQ);
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(cubeQ.clone().invert());
  const ax = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 'x' : 'z') : (Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z');
  const normal = V(0, 0, 0);
  normal[ax] = Math.sign(n[ax]);
  if (Math.round(c.position.dot(normal)) !== 1) return null;
  return { cubie: c, normal, point: cube.worldToLocal(hit.point.clone()), tile: hit.object.geometry === tileGeo ? hit.object : null };
}

function orbitBy(dx, dy) {
  const len = Math.hypot(dx, dy);
  if (!len) return;
  const q = new THREE.Quaternion().setFromAxisAngle(V(dy / len, dx / len, 0), len * 0.0068);
  cube.quaternion.premultiply(q);
}

canvas.addEventListener('pointerdown', (e) => {
  if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  canvas.setPointerCapture(e.pointerId);
  hintEl.classList.add('gone');
  view = null;
  orbitVel.set(0, 0);
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), mode: 'pending', hit: pick(e), w: 0 };
  setHover(null);
});

function decide(dx, dy) {
  const h = drag.hit;
  const locked = phase === 'scrambling' || phase === 'auto' || phase === 'intro';
  if (!h || busy() || locked) { drag.mode = 'orbit'; canvas.classList.add('grabbing'); return; }
  const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)].filter((a) => Math.abs(a.dot(h.normal)) < 0.5);
  const d = new THREE.Vector2(dx, dy);
  let pickT = null, pickDir = null, pickLen = 0, score = -1;
  for (const a of axes) {
    for (const t of [a, a.clone().negate()]) {
      const s0 = toScreen(h.point);
      const s1 = toScreen(h.point.clone().addScaledVector(t, 0.6));
      const dir = s1.sub(s0);
      const len = dir.length();
      if (len < 1e-3) continue;
      const sc = d.dot(dir) / len;
      if (sc > score) { score = sc; pickT = t; pickDir = dir.clone().divideScalar(len); pickLen = len / 0.6; }
    }
  }
  if (!pickT) { drag.mode = 'orbit'; return; }
  const axis = new THREE.Vector3().crossVectors(h.normal, pickT);
  const layer = Math.round(h.cubie.position.dot(axis));
  if (layer === 0) { drag.mode = 'orbit'; canvas.classList.add('grabbing'); return; }
  drag.mode = 'layer';
  drag.axis = axis;
  drag.layer = layer;
  drag.dir = pickDir;
  drag.pxPerRad = pickLen * 1.1;
  drag.angle = 0;
  drag.vel = 0;
  drag.pivot = grabLayer(axis, layer);
  pending++;
  canvas.classList.add('grabbing');
}

canvas.addEventListener('pointermove', (e) => {
  if (!drag) { hover(e); return; }
  if (e.pointerId !== drag.id) return;
  const now = performance.now();
  const dt = Math.max(1, now - drag.t);
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (drag.mode === 'pending') {
    if (Math.hypot(dx, dy) < 7) return;
    decide(dx, dy);
  }
  if (drag.mode === 'orbit') {
    const mx = e.clientX - drag.x, my = e.clientY - drag.y;
    orbitBy(mx, my);
    orbitVel.set(mx, my).multiplyScalar(16 / dt);
  } else if (drag.mode === 'layer') {
    const a = (dx * drag.dir.x + dy * drag.dir.y) / drag.pxPerRad;
    drag.vel = (a - drag.angle) / dt;
    drag.angle = a;
    drag.pivot.quaternion.setFromAxisAngle(drag.axis, a);
  }
  drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  canvas.classList.remove('grabbing');
  if (d.mode === 'layer') {
    let k = Math.round((d.angle + d.vel * 110) / HALF_PI);
    if (k === 0 && Math.abs(d.angle) > 0.45) k = Math.sign(d.angle);
    const target = k * HALF_PI;
    const dur = Math.min(200, 70 + Math.abs(target - d.angle) * 160);
    pending--;
    enqueue(async () => {
      await spinLayer(d.pivot, d.axis, d.angle, target, dur);
      record(notationFor(d.axis, d.layer, k), 'user');
    });
  } else if (d.mode === 'orbit') {
    settleAt = performance.now() + 260;
  } else if (d.mode === 'pending' && d.hit) {
    const L = ORDER.find((k) => FACES[k].n.equals(d.hit.normal));
    if (L) focusFace(L);
  } else if (d.mode === 'pending') {
    settleAt = performance.now();
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

let hovered = null;
function setHover(t) {
  if (hovered === t) return;
  if (hovered) hovered.material.emissiveIntensity = hovered.userData.base;
  hovered = t;
  if (hovered) hovered.material.emissiveIntensity = hovered.userData.base + 0.12;
}
function hover(e) {
  if (e.pointerType !== 'mouse') return;
  const h = pick(e);
  setHover(h && h.tile ? h.tile : null);
}
canvas.addEventListener('pointerleave', () => setHover(null));
// On touch screens a swipe that starts on the cube turns it; one that starts beside it can still scroll the page.
canvas.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (e.touches.length === 1 && pick({ clientX: t.clientX, clientY: t.clientY })) e.preventDefault();
}, { passive: false });

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = e.key.toUpperCase();
  if (FACES[k] && k.length === 1) {
    const locked = phase === 'scrambling' || phase === 'auto' || phase === 'intro';
    if (locked || drag) return;
    const amount = e.shiftKey ? 3 : 1;
    enqueue(async () => {
      await turn(k, amount, 140);
      record({ f: k, a: amount }, 'user');
    });
    e.preventDefault();
    return;
  }
  const arrows = { ArrowLeft: [V(0, 1, 0), -HALF_PI], ArrowRight: [V(0, 1, 0), HALF_PI], ArrowUp: [V(1, 0, 0), -HALF_PI], ArrowDown: [V(1, 0, 0), HALF_PI] };
  if (arrows[e.key] && !(e.target.closest && e.target.closest('.face, .panel-foot'))) {
    const [axis, ang] = arrows[e.key];
    const base = view ? view.to : cube.quaternion;
    const raw = TILT.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)).multiply(TILT_INV).multiply(base);
    animateView(restingQuat(raw).q, 520);
    e.preventDefault();
  }
});

// ---------- scramble / solve / reset ----------
function randomScramble(n) {
  const out = [];
  const axisOf = { U: 'y', D: 'y', R: 'x', L: 'x', F: 'z', B: 'z' };
  while (out.length < n) {
    const f = ORDER[Math.floor(Math.random() * 6)];
    const p1 = out[out.length - 1], p2 = out[out.length - 2];
    if (p1 && p1.f === f) continue;
    if (p1 && p2 && axisOf[p1.f] === axisOf[f] && axisOf[p2.f] === axisOf[f]) continue;
    out.push({ f, a: 1 + Math.floor(Math.random() * 3) });
  }
  return out;
}

btnScramble.addEventListener('click', () => {
  if (drag || phase === 'scrambling' || phase === 'auto' || phase === 'intro') return;
  const seq = randomScramble(20);
  lastScramble = seq.map(fmtMove).join(' ');
  phase = 'scrambling';
  moveCount = 0;
  timeEl.textContent = fmtTime(0);
  setStatus('Scrambling…');
  seqEl.textContent = lastScramble;
  enqueue(async () => {
    for (const m of seq) {
      await turn(m.f, m.a, reduceMotion ? 0 : 95);
      record(m, 'scramble');
    }
    if (isSolved()) { phase = 'idle'; history = []; return; }
    phase = 'scrambled';
    setStatus('Scrambled. The timer starts on your first turn.');
  });
});

btnSolve.addEventListener('click', () => {
  if (!history.length || busy()) return;
  const plan = simplify(history).reverse().map(invert);
  const wasTiming = phase === 'solving' || phase === 'scrambled';
  phase = 'auto';
  setStatus(`Solving myself in ${plan.length} turns by undoing yours.`);
  const dur = reduceMotion ? 0 : Math.max(55, Math.min(150, 3200 / plan.length));
  enqueue(async () => {
    for (const m of plan) {
      await turn(m.f, m.a, dur);
      record(m, 'auto');
    }
    history = [];
    phase = 'idle';
    moveCount = 0;
    if (wasTiming) timeEl.textContent = fmtTime(0);
    setStatus('Solved. Scramble again and try it yourself.');
    seqEl.textContent = '';
    updateNet();
  });
});

btnReset.addEventListener('click', () => {
  if (busy()) return;
  for (const c of cubies) { c.position.copy(c.userData.home.p); c.quaternion.copy(c.userData.home.q); }
  history = [];
  phase = 'idle';
  moveCount = 0;
  timeEl.textContent = fmtTime(0);
  seqEl.textContent = '';
  setStatus('Solved. Scramble it, then try to put it back.');
  updateNet();
  refreshUI();
});

// ---------- celebration ----------
let spin = null;
let flashT0 = 0;
const confetti = [];
function celebrate() {
  if (reduceMotion) return;
  spin = { t0: performance.now(), dur: 1300 };
  flashT0 = performance.now();
}
function drawConfetti() {
  const g = fx.getContext('2d');
  g.clearRect(0, 0, fx.width, fx.height);
  if (!confetti.length) return;
  const dpr = fx.width / Math.max(1, W);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.vy += 0.32 * dpr; p.vx *= 0.99;
    p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= 0.008;
    if (p.life <= 0 || p.y > fx.height + 40) { confetti.splice(i, 1); continue; }
    g.save();
    g.globalAlpha = Math.min(1, p.life * 1.5);
    g.translate(p.x, p.y); g.rotate(p.r);
    g.fillStyle = p.c;
    g.beginPath();
    g.roundRect(-p.s / 2, -p.s / 2, p.s, p.s, p.s * 0.22);
    g.fill();
    g.restore();
  }
}

// ---------- intro: the cube solves itself into place ----------
async function intro() {
  const home = viewQuat('U');
  if (reduceMotion) { cube.quaternion.copy(home); setActive('U'); updateNet(); refreshUI(); return; }
  phase = 'intro';
  const seq = randomScramble(11);
  for (const m of seq) await turn(m.f, m.a, 0);
  updateNet();
  cube.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -1.9).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.5)).multiply(home));
  setActive(frontFace(cube.quaternion));
  await new Promise((r) => setTimeout(r, 450));
  animateView(home, 1900);
  enqueue(async () => {
    for (const m of seq.slice().reverse().map(invert)) {
      await turn(m.f, m.a, 120);
      updateNet();
    }
    history = [];
    phase = 'idle';
    setActive('U');
  });
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame(now) {
  const t = clock.getElapsedTime();
  if (!reduceMotion) floatG.position.y = Math.sin(t * 0.9) * 0.045;

  if (view) {
    const k = Math.min(1, (now - view.t0) / view.dur);
    cube.quaternion.slerpQuaternions(view.from, view.to, easeInOut(k));
    if (k >= 1) view = null;
  } else if (!drag && orbitVel.lengthSq() > 0.04) {
    orbitBy(orbitVel.x, orbitVel.y);
    orbitVel.multiplyScalar(0.92);
    settleAt = now + 220;
  } else if (!drag && settleAt && now >= settleAt) {
    settleAt = 0;
    orbitVel.set(0, 0);
    animateView(restingQuat(cube.quaternion).q, 520);
  }

  if (spin) {
    const k = Math.min(1, (now - spin.t0) / spin.dur);
    spinG.rotation.y = easeInOut(k) * Math.PI * 2;
    if (k >= 1) { spin = null; spinG.rotation.y = 0; }
  }
  if (flashT0) {
    const k = (now - flashT0) / 900;
    const v = k >= 1 ? 0 : Math.sin(k * Math.PI) * 0.35;
    for (const tile of tiles) tile.material.emissiveIntensity = tile.userData.base + v;
    if (k >= 1) flashT0 = 0;
  }

  if (phase === 'solving') timeEl.textContent = fmtTime(now - tStart);

  if (phase !== 'intro') {
    cube.getWorldQuaternion(cubeQ);
    let top = null, topZ = -2, curZ = -2;
    for (const L of ORDER) {
      const z = FACES[L].n.clone().applyQuaternion(cubeQ).z;
      if (z > topZ) { topZ = z; top = L; }
      if (L === active) curZ = z;
    }
    if (top !== active && topZ > curZ + 0.08) setActive(top);
  }

  renderer.render(scene, camera);
  drawConfetti();
  requestAnimationFrame(frame);
}

updateNet();
refreshUI();
setActive('U');
requestAnimationFrame(frame);
intro().then(refreshUI);
