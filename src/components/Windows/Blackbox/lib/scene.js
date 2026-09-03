/**
 * Replay renderer, second generation.
 *
 * three.js with a physically based pipeline: procedural sky (Preetham/Hosek via
 * three's Sky), PMREM environment lighting from that sky, cascaded-free but
 * high-resolution directional shadows on the aircraft, SMAA anti-aliasing,
 * bloom for lights and strobes, ACES filmic tone mapping. The world is built
 * procedurally: a lathe-built airliner with control surfaces that move with the
 * recorded inputs, a heightfield terrain from layered value noise, a shaded
 * ocean with animated normals, volumetric-looking cloud sprites, runway with
 * markings, PAPI and approach lighting, contrails at altitude, rain, lightning.
 *
 * Units: 1 scene unit = 10 ft. North = -Z, East = +X, up = +Y.
 * Public API is unchanged from the first renderer: setup(fdr, track, env),
 * setCameraMode(mode), update(state, pos, dt), resize(), project(pos),
 * setGhost/clearGhost, setFormation/clearFormation/updateFormation, dispose().
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const FT = 0.1
const DEG = Math.PI / 180

// ---------- noise ----------
function makeNoise(seed = 1) {
  const perm = new Uint8Array(512)
  let s = seed
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const grad = (h, x, y) => { const g = h & 3; return (g & 1 ? -x : x) + (g & 2 ? -y : y) }
  const n2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
    x -= Math.floor(x); y -= Math.floor(y)
    const u = fade(x), v = fade(y)
    const a = perm[X] + Y, b = perm[X + 1] + Y
    const l = (t, p, q) => p + t * (q - p)
    return l(v, l(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)), l(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1)))
  }
  return (x, y, oct = 5, lac = 2.1, gain = 0.5) => {
    let amp = 1, f = 1, sum = 0, norm = 0
    for (let i = 0; i < oct; i++) { sum += amp * n2(x * f, y * f); norm += amp; amp *= gain; f *= lac }
    return sum / norm
  }
}
const noise = makeNoise(7)

// ---------- textures ----------
function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function waterNormalTexture() {
  const size = 256
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const h = (nx, ny) => noise(nx / 22, ny / 22, 4, 2.3, 0.55)
      const dx = h(x + 1, y) - h(x - 1, y)
      const dy = h(x, y + 1) - h(x, y - 1)
      const i = (y * size + x) * 4
      img.data[i] = 128 + dx * 520
      img.data[i + 1] = 128 + dy * 520
      img.data[i + 2] = 255
      img.data[i + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function groundTexture(kind) {
  return canvasTexture(1024, (g, size) => {
    if (kind === 'city') {
      g.fillStyle = '#4a4e55'
      g.fillRect(0, 0, size, size)
      for (let i = 0; i < 1400; i++) {
        const w = 6 + Math.random() * 26, h = 6 + Math.random() * 26
        const v = 60 + Math.random() * 70
        g.fillStyle = `rgb(${v},${v + 4},${v + 10})`
        g.fillRect(Math.random() * size, Math.random() * size, w, h)
      }
      g.strokeStyle = '#8a8f98'
      g.lineWidth = 4
      for (let i = 0; i < size; i += 96) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.moveTo(0, i); g.lineTo(size, i); g.stroke() }
    } else if (kind === 'mountains') {
      for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
        const n = noise(x / 90, y / 90, 4)
        const v = 70 + n * 60
        g.fillStyle = `rgb(${v * 0.9},${v * 0.85},${v * 0.7})`
        g.fillRect(x, y, 4, 4)
      }
    } else {
      // farmland patchwork
      g.fillStyle = '#4c6b2f'
      g.fillRect(0, 0, size, size)
      const cols = ['#5c7a36', '#3f5c28', '#6b7d3a', '#546b30', '#7a6a3c', '#8c7a44', '#4a6a45']
      for (let i = 0; i < 160; i++) {
        g.fillStyle = cols[i % cols.length]
        g.globalAlpha = 0.7 + Math.random() * 0.3
        g.fillRect(Math.random() * size, Math.random() * size, 40 + Math.random() * 160, 30 + Math.random() * 120)
      }
      g.globalAlpha = 1
      g.strokeStyle = 'rgba(25,32,18,0.55)'
      g.lineWidth = 3
      for (let i = 0; i < size; i += 160) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.moveTo(0, i); g.lineTo(size, i); g.stroke() }
      // hedgerows and tree clumps
      g.fillStyle = 'rgba(30,50,25,0.8)'
      for (let i = 0; i < 700; i++) { g.beginPath(); g.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 5, 0, Math.PI * 2); g.fill() }
    }
  }, 300)
}

function cloudSprite() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  for (let i = 0; i < 26; i++) {
    const x = 128 + (Math.random() - 0.5) * 120, y = 128 + (Math.random() - 0.5) * 70, r = 30 + Math.random() * 50
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,0.28)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// ---------- aircraft ----------
function airfoilShape(chord, thick) {
  const s = new THREE.Shape()
  const pts = []
  for (let i = 0; i <= 20; i++) {
    const x = i / 20
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4)
    pts.push([x * chord, yt * chord])
  }
  s.moveTo(pts[0][0], pts[0][1])
  for (const [x, y] of pts) s.lineTo(x, y)
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0], -pts[i][1] * 0.6)
  s.closePath()
  return s
}

function buildAircraft(kind) {
  const group = new THREE.Group()
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, metalness: 0.15, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 })
  const belly = new THREE.MeshPhysicalMaterial({ color: 0xb9c0cc, metalness: 0.3, roughness: 0.45 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1f28, metalness: 0.5, roughness: 0.4 })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0f1a2a, metalness: 0.9, roughness: 0.1, clearcoat: 1 })
  const accent = new THREE.MeshPhysicalMaterial({ color: 0xd63b2f, metalness: 0.2, roughness: 0.4, clearcoat: 0.5 })
  const engineMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd6, metalness: 0.6, roughness: 0.35 })

  const scale = { airliner_twin: 1, airliner_quad: 1.35, regional_turboprop: 0.5, regional_jet: 0.55, narrowbody_tri: 0.95 }[kind] || 1
  const length = 18 * scale
  const radius = 1.05 * scale

  // Fuselage as a lathe: pointed nose, constant section, tapering tail cone with up-sweep handled by offset ring
  const profile = []
  const N = 24
  for (let i = 0; i <= N; i++) {
    const t = i / N // 0 nose .. 1 tail
    let r
    if (t < 0.12) r = radius * Math.sin((t / 0.12) * Math.PI * 0.5) ** 0.7
    else if (t < 0.7) r = radius
    else r = radius * Math.max(0.06, 1 - ((t - 0.7) / 0.3) ** 1.4)
    profile.push(new THREE.Vector2(Math.max(0.01, r), (t - 0.5) * length))
  }
  const fusGeo = new THREE.LatheGeometry(profile, 40)
  fusGeo.rotateX(-Math.PI / 2) // lathe axis y -> z; nose toward -z
  const fus = new THREE.Mesh(fusGeo, paint)
  fus.castShadow = true
  fus.receiveShadow = true
  group.add(fus)
  // belly stripe darker
  const bellyMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.005, radius * 1.005, length * 0.55, 40, 1, true, Math.PI * 0.62, Math.PI * 0.76), belly)
  bellyMesh.rotation.x = Math.PI / 2
  bellyMesh.position.z = 0.05 * scale
  group.add(bellyMesh)
  // cockpit glazing
  const cock = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.98, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), glass)
  cock.rotation.x = -Math.PI / 2 - 0.3
  cock.position.set(0, radius * 0.15, -length / 2 + radius * 1.35)
  cock.scale.set(1, 0.5, 0.9)
  group.add(cock)
  // window line
  const winTex = canvasTexture(512, (g, size) => { g.clearRect(0, 0, size, size); g.fillStyle = 'rgba(20,28,40,0.95)'; for (let x = 8; x < size; x += 18) { g.beginPath(); g.roundRect(x, size / 2 - 5, 9, 10, 3); g.fill() } }, 1)
  const winMat = new THREE.MeshStandardMaterial({ map: winTex, transparent: true, roughness: 0.3, metalness: 0.5, depthWrite: false })
  const win = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.006, radius * 1.006, length * 0.62, 48, 1, true, -Math.PI * 0.2, Math.PI * 0.4), winMat)
  win.rotation.x = Math.PI / 2
  win.rotation.y = Math.PI / 2
  win.position.set(0, radius * 0.22, 0.4 * scale)
  const win2 = win.clone(); win2.rotation.y = -Math.PI / 2
  group.add(win, win2)

  // Wings with airfoil section, sweep, taper, dihedral, winglets
  const halfSpan = 10.5 * scale
  const rootChord = 4.4 * scale, tipChord = 1.4 * scale
  const wingGeo = new THREE.ExtrudeGeometry(airfoilShape(1, 0.11), { depth: 1, bevelEnabled: false, steps: 1 })
  // scale: x chord, y thickness, z span; we build a tapered wing by morphing positions
  const pos = wingGeo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const cx = pos.getX(i), cy = pos.getY(i), cz = pos.getZ(i) // cz 0..1 along span
    const chord = rootChord + (tipChord - rootChord) * cz
    const sweep = cz * halfSpan * Math.tan(27 * DEG)
    const dihedral = cz * halfSpan * Math.tan(5.5 * DEG)
    pos.setXYZ(i, cz * halfSpan, cy * chord + dihedral - radius * 0.55, cx * chord + sweep - rootChord * 0.35 + 0.6 * scale)
  }
  wingGeo.computeVertexNormals()
  const rWing = new THREE.Mesh(wingGeo, paint)
  rWing.castShadow = true
  const lWing = rWing.clone()
  lWing.scale.x = -1
  group.add(rWing, lWing)
  // winglets
  const wlGeo = new THREE.ExtrudeGeometry(airfoilShape(1, 0.08), { depth: 1, bevelEnabled: false })
  const wp = wlGeo.getAttribute('position')
  for (let i = 0; i < wp.count; i++) {
    const cx = wp.getX(i), cy = wp.getY(i), cz = wp.getZ(i)
    const chord = tipChord * (1 - cz * 0.5)
    wp.setXYZ(i, halfSpan + cy * chord + cz * 0.4 * scale, cz * 1.6 * scale + halfSpan * Math.tan(5.5 * DEG) - radius * 0.55, cx * chord + halfSpan * Math.tan(27 * DEG) - rootChord * 0.35 + 0.6 * scale + cz * 0.5 * scale)
  }
  wlGeo.computeVertexNormals()
  const rWl = new THREE.Mesh(wlGeo, accent)
  const lWl = rWl.clone(); lWl.scale.x = -1
  group.add(rWl, lWl)

  // Control surfaces: ailerons (outer trailing edge), flaps (inner), pivot groups
  const surfaces = {}
  const mkSurface = (spanFrom, spanTo, chordFrac, mat, name) => {
    const s0 = spanFrom * halfSpan, s1 = spanTo * halfSpan
    const c0 = rootChord + (tipChord - rootChord) * spanFrom, c1 = rootChord + (tipChord - rootChord) * spanTo
    const geo = new THREE.BufferGeometry()
    const z = (sp, c) => c * (1 - chordFrac) + sp * halfSpan * Math.tan(27 * DEG) - rootChord * 0.35 + 0.6 * scale
    const y = (sp) => sp * halfSpan * Math.tan(5.5 * DEG) - radius * 0.55
    const v = new Float32Array([
      s0, y(spanFrom), z(spanFrom, c0), s1, y(spanTo), z(spanTo, c1), s1, y(spanTo), z(spanTo, c1) + c1 * chordFrac,
      s0, y(spanFrom), z(spanFrom, c0), s1, y(spanTo), z(spanTo, c1) + c1 * chordFrac, s0, y(spanFrom), z(spanFrom, c0) + c0 * chordFrac
    ])
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: mat, metalness: 0.2, roughness: 0.4, side: THREE.DoubleSide }))
    // hinge: translate so the hinge line is at origin, then rotate the group
    const pivot = new THREE.Group()
    const hx = (s0 + s1) / 2, hy = y((spanFrom + spanTo) / 2), hz = z((spanFrom + spanTo) / 2, (c0 + c1) / 2)
    mesh.position.set(-hx, -hy, -hz)
    pivot.position.set(hx, hy, hz)
    pivot.rotation.y = -Math.atan(Math.tan(27 * DEG))
    pivot.add(mesh)
    pivot.userData.sweepFix = true
    surfaces[name] = pivot
    return pivot
  }
  const rAil = mkSurface(0.68, 0.96, 0.24, 0xe6e9ee, 'rAil'), lAil = mkSurface(0.68, 0.96, 0.24, 0xe6e9ee, 'lAil')
  const rFlap = mkSurface(0.12, 0.62, 0.3, 0xdfe3ea, 'rFlap'), lFlap = mkSurface(0.12, 0.62, 0.3, 0xdfe3ea, 'lFlap')
  lAil.scale.x = -1; lFlap.scale.x = -1
  group.add(rAil, lAil, rFlap, lFlap)

  // Engines
  const engines = kind === 'airliner_quad' ? [-0.62, -0.35, 0.35, 0.62] : kind === 'narrowbody_tri' ? [-0.42, 0.42] : [-0.42, 0.42]
  const engineR = (kind === 'regional_turboprop' ? 0.42 : 0.66) * scale
  const fans = []
  for (const f of engines) {
    const x = f * halfSpan
    const z = Math.abs(f) * halfSpan * Math.tan(27 * DEG) - rootChord * 0.35 + 0.6 * scale - 1.0 * scale
    const y = -radius * 1.2 + Math.abs(f) * halfSpan * Math.tan(5.5 * DEG)
    if (kind === 'regional_turboprop') {
      const nac = new THREE.Mesh(new THREE.CapsuleGeometry(engineR, 2.2 * scale, 6, 16), engineMat)
      nac.rotation.x = Math.PI / 2
      nac.position.set(x, y + radius * 0.9, z)
      nac.castShadow = true
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6 * scale, 32), new THREE.MeshBasicMaterial({ color: 0xb7bec9, transparent: true, opacity: 0.22, side: THREE.DoubleSide }))
      disc.position.set(x, y + radius * 0.9, z - 1.4 * scale)
      group.add(nac, disc)
      fans.push(disc)
    } else {
      const nacProfile = []
      for (let i = 0; i <= 12; i++) { const t = i / 12; nacProfile.push(new THREE.Vector2(engineR * (0.92 + 0.12 * Math.sin(t * Math.PI)), (t - 0.5) * 2.4 * scale)) }
      const nac = new THREE.Mesh(new THREE.LatheGeometry(nacProfile, 32), engineMat)
      nac.geometry.rotateX(-Math.PI / 2)
      nac.position.set(x, y, z)
      nac.castShadow = true
      const inlet = new THREE.Mesh(new THREE.RingGeometry(engineR * 0.55, engineR * 0.9, 32), dark)
      inlet.position.set(x, y, z - 1.21 * scale)
      const spinner = new THREE.Mesh(new THREE.ConeGeometry(engineR * 0.22, engineR * 0.6, 16), accent)
      spinner.rotation.x = -Math.PI / 2
      spinner.position.set(x, y, z - 1.3 * scale)
      const fan = new THREE.Mesh(new THREE.CircleGeometry(engineR * 0.58, 24), new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.8, roughness: 0.35 }))
      fan.position.set(x, y, z - 1.15 * scale)
      const bladeTex = canvasTexture(128, (g, size) => { g.clearRect(0, 0, size, size); g.strokeStyle = 'rgba(200,210,225,0.9)'; g.lineWidth = 3; for (let a = 0; a < 22; a++) { g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a / 22 * Math.PI * 2) * 60, 64 + Math.sin(a / 22 * Math.PI * 2) * 60); g.stroke() } }, 1)
      fan.material.map = bladeTex
      fan.material.transparent = true
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.28 * scale, radius * 0.9, 1.6 * scale), belly)
      pylon.position.set(x, y + radius * 0.55, z + 0.5 * scale)
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(engineR * 0.4, engineR * 0.5, 0.8 * scale, 20, 1, true), dark)
      exhaust.rotation.x = Math.PI / 2
      exhaust.position.set(x, y, z + 1.4 * scale)
      group.add(nac, inlet, spinner, fan, pylon, exhaust)
      fans.push(fan)
    }
  }
  if (kind === 'narrowbody_tri') {
    const tailEngine = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.5 * scale, 2.6 * scale, 24), engineMat)
    tailEngine.rotation.x = Math.PI / 2
    tailEngine.position.set(0, radius * 0.95, length / 2 - 2.6 * scale)
    group.add(tailEngine)
  }

  // Empennage
  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0); finShape.lineTo(3.4 * scale, 0); finShape.lineTo(2.9 * scale, 3.8 * scale); finShape.lineTo(2.0 * scale, 3.8 * scale); finShape.lineTo(0, 0)
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.18 * scale, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), accent)
  fin.rotation.y = Math.PI / 2
  fin.position.set(0.09 * scale, radius * 0.6, length / 2 - 3.8 * scale)
  fin.castShadow = true
  group.add(fin)
  // rudder hinge
  const rudder = new THREE.Group()
  const rudMesh = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0.9 * scale, 0); s.lineTo(0.7 * scale, 3.6 * scale); s.lineTo(0, 3.6 * scale); s.lineTo(0, 0); return s })(), { depth: 0.14 * scale, bevelEnabled: false }), paint)
  rudMesh.rotation.y = Math.PI / 2
  rudMesh.position.set(0.07 * scale, 0, 0)
  rudder.add(rudMesh)
  rudder.position.set(0, radius * 0.6, length / 2 - 0.5 * scale)
  group.add(rudder)
  surfaces.rudder = rudder
  // stabilisers + elevators
  const stabShape = new THREE.Shape()
  stabShape.moveTo(0, -1.3 * scale); stabShape.lineTo(4.2 * scale, 0.2 * scale); stabShape.lineTo(4.2 * scale, 0.6 * scale); stabShape.lineTo(0, 0.7 * scale); stabShape.lineTo(0, -1.3 * scale)
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.14 * scale, bevelEnabled: false })
  const stabPivot = new THREE.Group()
  const rStab = new THREE.Mesh(stabGeo, paint); rStab.rotation.x = Math.PI / 2
  const lStab = rStab.clone(); lStab.scale.x = -1
  stabPivot.add(rStab, lStab)
  stabPivot.position.set(0, radius * 0.5, length / 2 - 2.2 * scale)
  group.add(stabPivot)
  surfaces.stab = stabPivot
  const elevPivot = new THREE.Group()
  const elevShape = new THREE.Shape()
  elevShape.moveTo(0, 0); elevShape.lineTo(4.1 * scale, 0); elevShape.lineTo(4.1 * scale, 0.45 * scale); elevShape.lineTo(0, 0.55 * scale); elevShape.lineTo(0, 0)
  const rEl = new THREE.Mesh(new THREE.ExtrudeGeometry(elevShape, { depth: 0.1 * scale, bevelEnabled: false }), belly); rEl.rotation.x = Math.PI / 2
  const lEl = rEl.clone(); lEl.scale.x = -1
  elevPivot.add(rEl, lEl)
  elevPivot.position.set(0, radius * 0.5, length / 2 - 1.5 * scale)
  group.add(elevPivot)
  surfaces.elevator = elevPivot

  // Landing gear (retractable)
  const gear = new THREE.Group()
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.4 })
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.9 })
  const mkLeg = (x, z, wheels) => {
    const leg = new THREE.Group()
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, radius * 1.3, 10), strutMat)
    strut.position.y = -radius * 0.65
    leg.add(strut)
    for (let i = 0; i < wheels; i++) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.22 * scale, 0.11 * scale, 10, 20), tyreMat)
      w.rotation.y = Math.PI / 2
      w.position.set((i - (wheels - 1) / 2) * 0.28 * scale, -radius * 1.3, 0)
      leg.add(w)
    }
    leg.position.set(x, -radius * 0.6, z)
    return leg
  }
  gear.add(mkLeg(0, -length / 2 + 2.6 * scale, 2), mkLeg(-1.6 * scale, 1.2 * scale, 4), mkLeg(1.6 * scale, 1.2 * scale, 4))
  group.add(gear)
  gear.visible = false

  // Lights: nav, beacon, strobes, landing lights (emissive spheres bloom)
  const lightMat = (c) => new THREE.MeshBasicMaterial({ color: c })
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 8, 8), lightMat(0xff2020))
  navL.position.set(-halfSpan, halfSpan * Math.tan(5.5 * DEG) - radius * 0.55, halfSpan * Math.tan(27 * DEG) - rootChord * 0.35 + 0.6 * scale)
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 8, 8), lightMat(0x20ff50))
  navR.position.set(halfSpan, navL.position.y, navL.position.z)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), lightMat(0xff2a2a))
  beacon.position.set(0, radius * 1.02, 0.2 * scale)
  const beacon2 = beacon.clone(); beacon2.position.y = -radius * 1.02
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 8, 8), lightMat(0xffffff))
  strobe.position.set(0, radius * 0.6 + 3.8 * scale, length / 2 - 3.0 * scale)
  const strobeL = strobe.clone(); strobeL.position.copy(navL.position).add(new THREE.Vector3(0, 0, 0.25 * scale))
  const strobeR = strobe.clone(); strobeR.position.copy(navR.position).add(new THREE.Vector3(0, 0, 0.25 * scale))
  const landing = new THREE.SpotLight(0xfff4d6, 0, 400, 0.35, 0.6, 1.2)
  landing.position.set(0, -radius * 0.3, -length / 2 + 3 * scale)
  landing.target.position.set(0, -radius * 6, -length * 2.5)
  group.add(navL, navR, beacon, beacon2, strobe, strobeL, strobeR, landing, landing.target)
  group.userData.lights = { beacon: [beacon, beacon2], strobes: [strobe, strobeL, strobeR], landing }
  group.userData.fans = fans
  group.userData.surfaces = surfaces
  group.userData.gear = gear
  group.userData.length = length
  group.userData.radius = radius
  group.userData.halfSpan = halfSpan
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return group
}

// ---------- scene ----------
export class ReplayScene {
  constructor(canvas, { onLightning } = {}) {
    this.canvas = canvas
    this.onLightning = onLightning
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.55
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 90000)
    this.cameraMode = 'chase'
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.minDistance = 6
    this.controls.maxDistance = 500

    // Sky + sun
    this.sky = new Sky()
    this.sky.scale.setScalar(80000)
    // The sky shader is HDR and the sun disc overflows a half-float target, which turns bloom into NaN
    // for whole frames whenever the sun is in view. Clamp it before it reaches the composer.
    const clampSky = (sky) => { sky.material.fragmentShader = sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( min( texColor, vec3( 24.0 ) ), 1.0 );'); sky.material.needsUpdate = true }
    clampSky(this.sky)
    this.scene.add(this.sky)
    this.sunDir = new THREE.Vector3(0.3, 0.6, 0.4).normalize()
    const u = this.sky.material.uniforms
    u.turbidity.value = 4
    u.rayleigh.value = 1.0
    u.mieCoefficient.value = 0.006
    u.mieDirectionalG.value = 0.8
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envScene = new THREE.Scene()
    this.envSky = new Sky()
    this.envSky.scale.setScalar(80000)
    clampSky(this.envSky)
    this.envScene.add(this.envSky)
    this._envTarget = null

    this.sun = new THREE.DirectionalLight(0xffffff, 3.2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 400
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -60
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 60
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.05
    this.scene.add(this.sun, this.sun.target)
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x2b3a22, 0.6)
    this.scene.add(this.hemi)
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0)
    this.moon.position.set(-400, 500, -200)
    this.scene.add(this.moon)
    this.scene.fog = new THREE.FogExp2(0x9fbbe0, 0.000018)

    this.world = new THREE.Group()
    this.scene.add(this.world)
    this.clouds = new THREE.Group()
    this.scene.add(this.clouds)
    this.aircraft = null
    this.ground = null
    this.trail = null
    this.env = { night: 0, rain: 0, storm: false, fog: 0 }
    this.flash = 0
    this._nextFlash = 3
    this._cine = { sub: 'chase', timer: 0, anchor: new THREE.Vector3() }
    this._elapsed = 0
    this.smoothCam = new THREE.Vector3()
    this.smoothLook = new THREE.Vector3()
    this.firstFrame = true
    this.quality = 'high'
    this._buildStars()
    this._buildRain()
    this._buildContrail()
    this._buildComposer()
  }

  _buildComposer() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height)
    // Multisampled render target: anti-aliasing without a separate SMAA pass
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.5, 1.15)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.scene.background = new THREE.Color(0x0b0f18)
  }

  _buildStars() {
    const n = 2400
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection()
      if (v.y < 0.03) v.y = Math.abs(v.y) + 0.03
      v.multiplyScalar(60000)
      pos.set([v.x, v.y, v.z], i * 3)
      const w = 0.6 + Math.random() * 0.4
      col.set([w, w, w + Math.random() * 0.1], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 90, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    this.stars.frustumCulled = false
    this.scene.add(this.stars)
  }

  _buildRain() {
    const n = 3000
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 240, Math.random() * 160, (Math.random() - 0.5) * 240], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.3, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }))
    this.rain.frustumCulled = false
    this.scene.add(this.rain)
  }

  _buildContrail() {
    // ring buffer of contrail puffs behind each engine
    this.contrailN = 400
    const pos = new Float32Array(this.contrailN * 3)
    const age = new Float32Array(this.contrailN)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('age', new THREE.BufferAttribute(age, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'attribute float age; varying float vA; void main(){ vA = age; vec4 mv = modelViewMatrix * vec4(position,1.0); float d = max(1.0, -mv.z); gl_PointSize = clamp((6.0 + age * 40.0) * (300.0 / d), 0.0, 96.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; uniform float uOpacity; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.1, d) * (1.0 - vA) * uOpacity * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }'
    })
    this.contrail = new THREE.Points(geo, mat)
    this.contrail.frustumCulled = false
    this.contrailHead = 0
    this.scene.add(this.contrail)
  }

  setup(fdr, track, env = {}) {
    this.fdr = fdr
    this.track = track
    this.env = { night: 0, rain: 0, storm: false, fog: 0, ...env }
    if (this.aircraft) this.world.remove(this.aircraft)
    this.aircraft = buildAircraft(fdr.aircraft_model || 'airliner_twin')
    this.world.add(this.aircraft)
    this._buildTerrain(fdr.terrain || 'flat')
    this._buildTrail()
    this._buildClouds()
    this.rain.material.opacity = this.env.rain * 0.7
    const age = this.contrail.geometry.getAttribute('age')
    age.array.fill(1)
    age.needsUpdate = true
    this._setSun(this.env.night)
    this.clearGhost()
    this.clearFormation()
    this.firstFrame = true
    this._groundCam = null
    this._cine = { sub: 'chase', timer: 0, anchor: new THREE.Vector3() }
  }

  _setSun(night) {
    // Sun elevation from the record's time of day: full day high, dusk low and warm, night below horizon
    const el = night >= 1 ? -8 : night > 0 ? 4 : 38
    const az = 140
    const phi = (90 - el) * DEG
    const theta = az * DEG
    this.sunDir.setFromSphericalCoords(1, phi, theta)
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir)
    this.envSky.material.uniforms.sunPosition.value.copy(this.sunDir)
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) this.envSky.material.uniforms[k].value = this.sky.material.uniforms[k].value
    if (this._envTarget) this._envTarget.dispose()
    this._envTarget = this.pmrem.fromScene(this.envScene)
    this.scene.environment = this._envTarget.texture
    this.scene.environmentIntensity = night >= 1 ? 0.08 : night > 0 ? 0.3 : 0.5
    this.sun.position.copy(this.sunDir).multiplyScalar(300)
    this.sun.intensity = night >= 1 ? 0.05 : night > 0 ? 1.0 : 2.2
    this.sun.color.set(night > 0 ? 0xffb070 : 0xfff2dc)
    this.moon.intensity = night >= 1 ? 0.6 : 0
    this.hemi.intensity = night >= 1 ? 0.22 : night > 0 ? 0.35 : 0.6
    this.renderer.toneMappingExposure = night >= 1 ? 0.55 : 0.55
  }

  _buildTerrain(kind) {
    if (this.ground) { this.world.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.map?.dispose(); this.ground.material.dispose() }
    if (this.extras) this.world.remove(this.extras)
    if (this.water) { this.world.remove(this.water); this.water = null }
    this.extras = new THREE.Group()
    const night = this.env.night
    const end = this.track[this.track.length - 1]
    const endHdg = (this.fdr.params.hdg_deg.keys[this.fdr.params.hdg_deg.keys.length - 1][1] || 0) * DEG
    const along = new THREE.Vector3(Math.sin(endHdg), 0, -Math.cos(endHdg))
    const right = new THREE.Vector3(-along.z, 0, along.x)

    if (kind === 'ocean') {
      const geo = new THREE.PlaneGeometry(80000, 80000, 1, 1)
      this.waterNormals = this.waterNormals || waterNormalTexture()
      this.waterNormals.repeat.set(2600, 2600)
      const mat = new THREE.MeshPhysicalMaterial({ color: night > 0.5 ? 0x04101c : 0x0d3a5c, roughness: 0.18, metalness: 0.05, normalMap: this.waterNormals, normalScale: new THREE.Vector2(0.9, 0.9), clearcoat: 0.9, clearcoatRoughness: 0.15 })
      this.ground = new THREE.Mesh(geo, mat)
      this.ground.rotation.x = -Math.PI / 2
      this.ground.receiveShadow = true
      this.world.add(this.ground)
      this.water = this.ground
    } else {
      // heightfield terrain, flat under the track, rising with distance for mountains
      const size = 60000
      const seg = kind === 'mountains' ? 220 : 120
      const geo = new THREE.PlaneGeometry(size, size, seg, seg)
      geo.rotateX(-Math.PI / 2)
      const p = geo.getAttribute('position')
      const col = new Float32Array(p.count * 3)
      const baseC = new THREE.Color(kind === 'city' ? 0x5a5f68 : 0x4c6b2f)
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i)
        const dx = x - end.x * FT, dz = z - end.z * FT
        const dist = Math.sqrt(dx * dx + dz * dz)
        let h = 0
        const n = noise(x / 9000 + 3, z / 9000 + 7, 5)
        if (kind === 'mountains') {
          const relief = Math.min(1, Math.max(0, (dist - 1200) / 6000))
          h = Math.max(0, n * 1400 * relief + noise(x / 2600, z / 2600, 4) * 350 * relief)
        } else if (kind === 'flat' || kind === 'runway') {
          const relief = Math.min(1, Math.max(0, (dist - 3000) / 12000))
          h = Math.max(0, n * 220 * relief)
        }
        p.setY(i, h)
        const c = baseC.clone()
        if (kind === 'mountains') {
          const t = Math.min(1, h / 1500)
          c.setRGB(0.3 + 0.35 * t, 0.36 + 0.25 * t, 0.22 + 0.4 * t)
          if (h > 1100) c.setRGB(0.85, 0.87, 0.9)
        } else {
          c.offsetHSL(0, 0, (noise(x / 700, z / 700, 3) - 0.5) * 0.12)
        }
        col.set([c.r, c.g, c.b], i * 3)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.computeVertexNormals()
      const tex = groundTexture(kind === 'city' ? 'city' : kind === 'mountains' ? 'mountains' : 'flat')
      const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.95, metalness: 0 })
      this.ground = new THREE.Mesh(geo, mat)
      this.ground.receiveShadow = true
      this.world.add(this.ground)
      // distant water for city (river) and coast
      if (kind === 'city') {
        const water = new THREE.Mesh(new THREE.PlaneGeometry(320, 8000), new THREE.MeshPhysicalMaterial({ color: night > 0.5 ? 0x06121e : 0x1f4f7a, roughness: 0.2, clearcoat: 0.8 }))
        water.rotation.x = -Math.PI / 2
        water.rotation.z = -endHdg
        water.position.set(end.x * FT, 0.4, end.z * FT)
        this.extras.add(water)
      }
    }

    // runway with markings, edge lights, PAPI and approach lights
    if (kind === 'runway' || kind === 'city') {
      const runway = new THREE.Group()
      const rwTex = canvasTexture(1024, (g, size) => {
        g.fillStyle = '#3a3a3f'; g.fillRect(0, 0, size, size)
        g.fillStyle = '#2f2f33'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * size, Math.random() * size, 2, 40)
        g.fillStyle = '#e9e9e9'
        for (let y = 60; y < size; y += 120) g.fillRect(size / 2 - 6, y, 12, 60) // centreline
        for (let i = 0; i < 6; i++) { g.fillRect(size / 2 - 200 + i * 30, 0, 14, 70); g.fillRect(size / 2 + 40 + i * 30, 0, 14, 70) } // threshold bars
        g.fillRect(size / 2 - 120, 130, 30, 60); g.fillRect(size / 2 + 90, 130, 30, 60) // aiming point
        for (let y = 0; y < size; y += 8) { g.fillRect(6, y, 4, 4); g.fillRect(size - 10, y, 4, 4) }
      }, 1)
      rwTex.repeat.set(1, 6)
      const rw = new THREE.Mesh(new THREE.PlaneGeometry(22, 1200), new THREE.MeshStandardMaterial({ map: rwTex, roughness: 0.9 }))
      rw.rotation.x = -Math.PI / 2
      rw.position.set(0, 0.3, 0)
      rw.receiveShadow = true
      runway.add(rw)
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const amberMat = new THREE.MeshBasicMaterial({ color: 0xffc050 })
      const greenMat = new THREE.MeshBasicMaterial({ color: 0x40ff70 })
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff3030 })
      const rl = 0.28 + night * 0.35
      for (let i = 0; i <= 24; i++) for (const side of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl, 6, 6), lightMat); l.position.set(side * 11.6, 0.5, -600 + i * 50); runway.add(l) }
      for (let j = -5; j <= 5; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl, 6, 6), greenMat); l.position.set(j * 2, 0.5, -600); runway.add(l) }
      for (let j = -5; j <= 5; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl, 6, 6), redMat); l.position.set(j * 2, 0.5, 600); runway.add(l) }
      // approach lighting system: centreline bars with crossbar
      for (let i = 1; i <= 12; i++) { for (let j = -2; j <= 2; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl, 6, 6), amberMat); l.position.set(j * 1.1, 0.6, -600 - i * 30); runway.add(l) } }
      for (let j = -12; j <= 12; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl, 6, 6), lightMat); l.position.set(j * 1.5, 0.6, -600 - 300); runway.add(l) }
      // PAPI: two red two white
      for (let j = 0; j < 4; j++) { const l = new THREE.Mesh(new THREE.SphereGeometry(rl * 1.2, 6, 6), j < 2 ? lightMat : redMat); l.position.set(-16 - j * 1.6, 0.6, -520); runway.add(l) }
      runway.rotation.y = -endHdg
      // threshold about 600 units before the final point along the heading
      runway.position.set(end.x * FT + along.x * 500, 0, end.z * FT + along.z * 500)
      this.extras.add(runway)
      // terminal buildings and hangars near the runway
      const bmat = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.8, emissive: new THREE.Color(0xffc060), emissiveIntensity: night * 0.35 })
      for (let i = 0; i < 24; i++) {
        const h = 4 + Math.random() * 10
        const b = new THREE.Mesh(new THREE.BoxGeometry(14 + Math.random() * 30, h, 10 + Math.random() * 30), bmat)
        const d = -200 + Math.random() * 900, s = (i % 2 ? 1 : -1) * (60 + Math.random() * 120)
        b.position.set(end.x * FT + along.x * d + right.x * s, h / 2, end.z * FT + along.z * d + right.z * s)
        b.castShadow = true
        this.extras.add(b)
      }
    }
    if (kind === 'city') {
      const bmat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.7, metalness: 0.1, emissive: new THREE.Color(0xffc060), emissiveIntensity: night * 0.5 })
      for (let i = 0; i < 420; i++) {
        const side = i % 2 ? 1 : -1
        const dist = 200 + Math.random() * 700
        const d = -3500 + Math.random() * 7000
        const h = 6 + Math.pow(Math.random(), 2.2) * 90
        const b = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 16, h, 8 + Math.random() * 16), bmat)
        b.position.set(end.x * FT + along.x * d + right.x * side * dist, h / 2, end.z * FT + along.z * d + right.z * side * dist)
        b.castShadow = true
        this.extras.add(b)
      }
    }
    if (kind === 'flat' || kind === 'mountains') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1, emissive: new THREE.Color(0xffb060), emissiveIntensity: night * 0.4 })
      for (let i = 0; i < 160; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 7, 2 + Math.random() * 5, 3 + Math.random() * 7), mat)
        b.position.set(end.x * FT + (Math.random() - 0.5) * 4000, 1.5, end.z * FT + (Math.random() - 0.5) * 4000)
        this.extras.add(b)
      }
      if (night > 0.3) {
        const lm = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
        const pts = []
        for (let i = 0; i < 1400; i++) pts.push(new THREE.Vector3(end.x * FT + (Math.random() - 0.5) * 16000, 0.8, end.z * FT + (Math.random() - 0.5) * 16000))
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        this.extras.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9a0, size: 6, sizeAttenuation: true })))
        void lm
      }
    }
    if (kind === 'ocean' && night > 0.3) {
      const pts = []
      for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(end.x * FT + (Math.random() - 0.5) * 24000, 0.8, end.z * FT + (Math.random() - 0.5) * 24000))
      this.extras.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xfff0c0, size: 10, sizeAttenuation: true })))
    }
    this.world.add(this.extras)
  }

  _buildTrail() {
    if (this.trail) { this.world.remove(this.trail); this.trail.geometry.dispose() }
    if (this.ghostPath) { this.world.remove(this.ghostPath) }
    const n = this.track.length
    const positions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const p = this.track[i]
      positions[i * 3] = p.x * FT; positions[i * 3 + 1] = p.y * FT; positions[i * 3 + 2] = p.z * FT
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setDrawRange(0, 0)
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.9 }))
    this.trail.frustumCulled = false
    this.world.add(this.trail)
    this.ghostPath = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }))
    this.ghostPath.geometry.setDrawRange(0, n)
    this.ghostPath.frustumCulled = false
    this.world.add(this.ghostPath)
  }

  _buildClouds() {
    this.clouds.clear()
    this.cloudTex = this.cloudTex || cloudSprite()
    const alts = this.fdr.params.alt_ft.keys.map((k) => k[1])
    const maxAlt = Math.max(...alts), minAlt = Math.min(...alts)
    const layer = Math.max(1500, minAlt + (maxAlt - minAlt) * 0.35)
    const count = 220 + Math.round(this.env.rain * 160)
    const mat = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, opacity: 0.6 * (1 - this.env.night * 0.7), depthWrite: false, color: this.env.storm ? 0x8a94a6 : 0xe8eef6 })
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(mat)
      const along = this.track[Math.floor(Math.random() * this.track.length)]
      const size = 180 + Math.random() * 520
      s.scale.set(size, size * 0.45, 1)
      s.position.set(along.x * FT + (Math.random() - 0.5) * 9000, layer * FT + (Math.random() - 0.5) * 400, along.z * FT + (Math.random() - 0.5) * 9000)
      this.clouds.add(s)
    }
    // high cirrus veil
    if (!this.env.storm) {
      for (let i = 0; i < 60; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, opacity: 0.25 * (1 - this.env.night * 0.7), depthWrite: false }))
        const along = this.track[Math.floor(Math.random() * this.track.length)]
        s.scale.set(1400, 500, 1)
        s.position.set(along.x * FT + (Math.random() - 0.5) * 20000, (maxAlt + 6000) * FT, along.z * FT + (Math.random() - 0.5) * 20000)
        this.clouds.add(s)
      }
    }
  }

  // ----- public helpers kept from the first renderer -----
  project(pos) {
    const v = new THREE.Vector3(pos.x * FT, pos.y * FT, pos.z * FT)
    const cam = this.camera
    const dir = v.clone().sub(cam.position)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const dist = dir.length()
    if (dir.dot(fwd) <= 0) return { x: 0, y: 0, visible: false, dist }
    v.project(cam)
    const rect = this.canvas.getBoundingClientRect()
    return { x: (v.x + 1) * 0.5 * rect.width, y: (1 - v.y) * 0.5 * rect.height, visible: v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1, dist }
  }

  setGhost(t, pos, state) {
    this.clearGhost()
    const g = buildAircraft(this.fdr.aircraft_model || 'airliner_twin')
    g.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone()
        o.material.transparent = true
        o.material.opacity = 0.3
        o.material.depthWrite = false
        if (o.material.color) o.material.color.set(0x9fd8ff)
        if (o.material.emissive) o.material.emissive.set(0x2a6aa0)
      }
      o.castShadow = false
    })
    this.world.add(g)
    const hdg = (state.hdg_deg || 0) * DEG
    this.ghost = { mesh: g, t, x: pos.x, y: Math.max(pos.y, 6), z: pos.z, hdg, gs: (state.gs_kt || state.ias_kt || 250) * 1.68781 }
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    this.ghostLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.5 }))
    this.ghostLine.frustumCulled = false
    this.world.add(this.ghostLine)
  }
  clearGhost() {
    if (this.ghost) { this.world.remove(this.ghost.mesh); this.ghost = null }
    if (this.ghostLine) { this.world.remove(this.ghostLine); this.ghostLine.geometry.dispose(); this.ghostLine = null }
  }
  _updateGhost(state) {
    if (!this.ghost) return
    const g = this.ghost
    const dtg = state.t - g.t
    g.mesh.visible = dtg >= 0
    if (dtg < 0) { this.ghostLine.visible = false; return }
    this.ghostLine.visible = true
    const d = g.gs * dtg
    const x = g.x + Math.sin(g.hdg) * d, z = g.z - Math.cos(g.hdg) * d
    g.mesh.position.set(x * FT, g.y * FT, z * FT)
    g.mesh.rotation.set(0, -g.hdg, 0, 'YXZ')
    const arr = this.ghostLine.geometry.getAttribute('position').array
    arr[0] = g.x * FT; arr[1] = g.y * FT; arr[2] = g.z * FT; arr[3] = x * FT; arr[4] = g.y * FT; arr[5] = z * FT
    this.ghostLine.geometry.getAttribute('position').needsUpdate = true
  }

  setFormation(entries) {
    this.clearFormation()
    if (!entries || !entries.length) return
    const tints = [0x9fd8ff, 0xffb3e6, 0xb8ffb0, 0xffe08a, 0xd0b3ff, 0xffc7a0]
    const p0 = this._trackAtPrimary(0)
    const hdgP = (this.fdr.params.hdg_deg.keys[0][1] || 0) * DEG
    const right = new THREE.Vector3(Math.cos(hdgP), 0, Math.sin(hdgP))
    this.formation = entries.map((e, i) => {
      const mesh = buildAircraft(e.fdr.aircraft_model || 'airliner_twin')
      const tint = tints[i % tints.length]
      mesh.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; if (o.material.color) o.material.color.set(tint); if (o.material.emissive) o.material.emissive.set(tint).multiplyScalar(0.25) } o.castShadow = false })
      this.world.add(mesh)
      const side = i % 2 ? 1 : -1
      const lane = Math.ceil((i + 1) / 2) * 320
      const base = { x: p0.x + right.x * side * lane, y: p0.y, z: p0.z + right.z * side * lane }
      const o0 = e.trackAt(0)
      const hdgF = (e.sample(0).hdg_deg || 0) * DEG
      const rot = hdgP - hdgF
      const place = (t) => { const q = e.trackAt(t); const dx = q.x - o0.x, dz = q.z - o0.z; return { x: base.x + dx * Math.cos(rot) - dz * Math.sin(rot), y: Math.max(6, base.y + (q.y - o0.y)), z: base.z + dx * Math.sin(rot) + dz * Math.cos(rot) } }
      const pts = []
      for (let t = e.fdr.t_start; t <= e.fdr.t_end; t += 1) { const q = place(t); pts.push(new THREE.Vector3(q.x * FT, q.y * FT, q.z * FT)) }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.4 }))
      line.frustumCulled = false
      this.world.add(line)
      return { ...e, mesh, line, place, rot, tint }
    })
  }
  _trackAtPrimary(t) {
    const tr = this.track
    const dt = tr[1].t - tr[0].t
    return tr[Math.max(0, Math.min(tr.length - 1, Math.round((t - tr[0].t) / dt)))]
  }
  clearFormation() {
    for (const f of this.formation || []) { this.world.remove(f.mesh); this.world.remove(f.line); f.line.geometry.dispose() }
    this.formation = []
  }
  updateFormation(t) {
    const out = []
    for (const f of this.formation || []) {
      const inRange = t >= f.fdr.t_start && t <= f.fdr.t_end
      f.mesh.visible = inRange
      if (!inRange) { out.push(null); continue }
      const st = f.sample(t)
      const pos = f.place(t)
      f.mesh.position.set(pos.x * FT, pos.y * FT, pos.z * FT)
      f.mesh.rotation.set((st.pitch_deg || 0) * DEG, -((st.hdg_deg || 0) * DEG + f.rot), -(st.roll_deg || 0) * DEG, 'YXZ')
      out.push({ pos, state: st })
    }
    return out
  }

  setCameraMode(mode) {
    this.cameraMode = mode
    this.controls.enabled = mode === 'orbit'
    this.firstFrame = true
    if (this.aircraft) this.aircraft.visible = mode !== 'cockpit'
    this._cine.timer = 0
    this._cine.sub = 'chase'
  }

  setQuality(q) {
    this.quality = q
    this.bloom.enabled = q !== 'low'
    this.renderer.shadowMap.enabled = q === 'high'
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1))
    this.resize()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width)), h = Math.max(1, Math.floor(rect.height))
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  _updateAtmosphere(state, dt) {
    const alt = state.alt_ft || 0
    const k = Math.min(1, alt / 40000)
    const night = this.env.night
    const u = this.sky.material.uniforms
    u.rayleigh.value = 1.0 - k * 0.7
    u.turbidity.value = (this.env.storm ? 14 : this.env.rain > 0 ? 8 : 4) - k * 2
    u.mieCoefficient.value = this.env.storm ? 0.02 : 0.006
    if (this.env.storm) {
      this._nextFlash -= dt
      if (this._nextFlash <= 0) { this.flash = 1; this._nextFlash = 3 + Math.random() * 7; this.onLightning && this.onLightning() }
    }
    this.flash *= Math.exp(-dt * 7)
    const fogK = 1 + this.env.fog * 6 + this.env.rain * 2 + this.env.storm * 3
    this.scene.fog.density = (0.000018 * fogK) / (1 + k * 2.5)
    this.scene.fog.color.setRGB(0.62 - night * 0.6, 0.73 - night * 0.7, 0.88 - night * 0.82).lerp(new THREE.Color(0.3, 0.32, 0.36), this.env.storm ? 0.6 : this.env.rain * 0.4)
    if (this.flash > 0.01) this.scene.fog.color.lerp(new THREE.Color(0.9, 0.92, 1), this.flash * 0.7)
    this.hemi.intensity = (night >= 1 ? 0.22 : 0.6) * (this.env.storm ? 0.5 : 1) + this.flash * 4
    this.stars.material.opacity = Math.max(0, night - 0.15) * (this.env.storm ? 0.15 : 1) * (1 - this.env.fog * 0.6) * (0.5 + 0.5 * k)
    this.stars.visible = this.stars.material.opacity > 0.01
    this.rain.visible = this.env.rain > 0
    this.bloom.strength = 0.18 + night * 0.5 + this.flash * 1.5
  }

  _updateRain(dt, acPos, speedFt) {
    if (this.env.rain <= 0) return
    const attr = this.rain.geometry.getAttribute('position')
    const a = attr.array
    const fall = (120 + this.env.rain * 80) * dt
    const drift = Math.min(60, speedFt * 0.02) * dt
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= fall; a[i + 2] += drift
      if (a[i + 1] < 0) a[i + 1] += 160
      if (a[i + 2] > 120) a[i + 2] -= 240
    }
    attr.needsUpdate = true
    this.rain.position.set(acPos.x, Math.max(0, acPos.y - 80), acPos.z)
  }

  _updateContrail(state, dt) {
    const advancing = this._lastT !== undefined && state.t !== this._lastT
    this._lastT = state.t
    const alt = state.alt_ft || 0
    const on = alt > 26000 && !this.env.night ? 1 : alt > 26000 ? 0.6 : 0
    this.contrail.material.uniforms.uOpacity.value = on
    this.contrail.visible = on > 0
    if (on <= 0) return
    const age = this.contrail.geometry.getAttribute('age')
    const pos = this.contrail.geometry.getAttribute('position')
    for (let i = 0; i < this.contrailN; i++) age.array[i] = Math.min(1, age.array[i] + dt * 0.04)
    if (on > 0 && this.aircraft && advancing) {
      const ac = this.aircraft
      const hs = ac.userData.halfSpan, r = ac.userData.radius
      for (const f of [-0.42, 0.42]) {
        const local = new THREE.Vector3(f * hs, -r * 1.2, ac.userData.length * 0.15)
        const w = ac.localToWorld(local)
        const i = this.contrailHead
        pos.array[i * 3] = w.x + (Math.random() - 0.5) * 0.6; pos.array[i * 3 + 1] = w.y + (Math.random() - 0.5) * 0.6; pos.array[i * 3 + 2] = w.z
        age.array[i] = 0
        this.contrailHead = (i + 1) % this.contrailN
      }
    }
    age.needsUpdate = true
    pos.needsUpdate = true
  }

  _animateAircraft(state, dt) {
    const ac = this.aircraft
    const u = ac.userData
    // engines
    const n1 = typeof state.n1_pct === 'number' ? state.n1_pct : 60
    for (const f of u.fans) f.rotation.z += dt * (2 + n1 * 0.6)
    // control surfaces from recorded inputs
    const sp = Math.max(-1, Math.min(1, state.stick_pitch || 0))
    const sr = Math.max(-1, Math.min(1, state.stick_roll || 0))
    u.surfaces.elevator.rotation.x = -sp * 25 * DEG
    u.surfaces.rAil.rotation.x = -sr * 20 * DEG
    u.surfaces.lAil.rotation.x = sr * 20 * DEG
    const flaps = typeof state.flaps === 'number' ? Math.min(1, state.flaps / 30) : 0
    u.surfaces.rFlap.rotation.x = flaps * 35 * DEG
    u.surfaces.lFlap.rotation.x = flaps * 35 * DEG
    if (typeof state.ths_deg === 'number') u.surfaces.stab.rotation.x = -state.ths_deg * 0.4 * DEG
    // gear extension
    const gearDown = state.gear === 1
    u.gear.visible = gearDown
    // lights
    this._elapsed += 0
    for (const b of u.lights.beacon) b.visible = Math.floor(this._elapsed * 1.3) % 2 === 0
    const strobeOn = (this._elapsed % 1.3) < 0.06 || ((this._elapsed + 0.15) % 1.3) < 0.06
    for (const s of u.lights.strobes) s.visible = strobeOn
    u.lights.landing.intensity = gearDown && (state.alt_ft || 0) < 10000 ? 4000 * (0.5 + this.env.night) : 0
  }

  /** state: sampled parameters; pos: track position in feet. */
  update(state, pos, dt) {
    if (!this.aircraft) return
    this._elapsed += dt
    const ac = this.aircraft
    ac.position.set(pos.x * FT, Math.max(0.6, pos.y * FT), pos.z * FT)
    ac.rotation.set((state.pitch_deg || 0) * DEG, -(state.hdg_deg || 0) * DEG, -(state.roll_deg || 0) * DEG, 'YXZ')
    ac.updateMatrixWorld()
    this._animateAircraft(state, dt)

    const idx = Math.max(0, Math.min(this.track.length, Math.floor((state.t - this.track[0].t) / (this.track[1].t - this.track[0].t)) + 1))
    this.trail.geometry.setDrawRange(0, idx)

    this._updateAtmosphere(state, dt)
    this._updateGhost(state)
    this._updateRain(dt, ac.position, (state.gs_kt || state.ias_kt || 0) * 1.68781)
    this._updateContrail(state, dt)
    this.stars.position.copy(ac.position)
    this.sky.position.copy(ac.position)
    if (this.env.rain <= 0) this.rain.position.copy(ac.position)
    if (this.water) { this.waterNormals.offset.x += dt * 0.02; this.waterNormals.offset.y += dt * 0.013 }
    // shadow camera follows the aircraft
    this.sun.position.copy(ac.position).addScaledVector(this.sunDir, 300)
    this.sun.target.position.copy(ac.position)
    this.sun.target.updateMatrixWorld()

    const len = ac.userData.length
    let shake = 0
    if (state.stall_warn) shake = 0.9
    else if (typeof state.aoa_deg === 'number' && state.aoa_deg > 11) shake = Math.min(1, (state.aoa_deg - 11) / 8)
    if (typeof state.ra_ft === 'number' && state.ra_ft < 60 && Math.abs(state.vs_fpm || 0) > 800) shake = Math.max(shake, 0.6)
    if (this.env.storm) shake = Math.max(shake, 0.15)
    const jitter = () => (Math.random() - 0.5) * shake * len * 0.03

    const hdgRad = (state.hdg_deg || 0) * DEG
    const nose = new THREE.Vector3(Math.sin(hdgRad), 0, -Math.cos(hdgRad))
    const right = new THREE.Vector3(-nose.z, 0, nose.x)
    let camPos
    const look = ac.position.clone()
    let mode = this.cameraMode

    if (mode === 'cockpit') {
      const local = new THREE.Vector3(0, ac.userData.radius * 0.55, -len / 2 - 0.3)
      this.camera.position.copy(ac.localToWorld(local)).add(new THREE.Vector3(jitter(), jitter(), jitter()))
      this.camera.quaternion.copy(ac.quaternion)
      this.composer.render()
      return
    }
    if (mode === 'orbit') {
      this.controls.target.copy(ac.position)
      if (this.firstFrame) this.camera.position.copy(ac.position.clone().add(new THREE.Vector3(len * 1.8, len * 0.9, len * 1.8)))
      this.controls.update()
      this.firstFrame = false
      this.composer.render()
      return
    }
    if (mode === 'cinematic') {
      const c = this._cine
      c.timer += dt
      if (c.timer > 8 || this.firstFrame) {
        const order = ['chase', 'flyby', 'side', 'front', 'low', 'flyby', 'wing']
        c.sub = order[(order.indexOf(c.sub) + 1) % order.length]
        c.timer = 0
        this.firstFrame = true
        if (c.sub === 'flyby' || c.sub === 'low') {
          const dtTrack = this.track[1].t - this.track[0].t
          const ahead = Math.min(this.track.length - 1, idx + Math.round(5 / dtTrack))
          const p = this.track[ahead]
          const side = Math.random() > 0.5 ? 1 : -1
          c.anchor.set(p.x * FT + right.x * side * len * 2.2, Math.max(2, p.y * FT + (c.sub === 'low' ? -len * 1.5 : len * 0.8)), p.z * FT + right.z * side * len * 2.2)
        }
      }
      mode = c.sub
    }
    if (mode === 'chase') camPos = ac.position.clone().addScaledVector(nose, -len * 2.6).add(new THREE.Vector3(0, len * 0.7, 0))
    else if (mode === 'side') camPos = ac.position.clone().addScaledVector(right, len * 2.4).add(new THREE.Vector3(0, len * 0.35, 0))
    else if (mode === 'front') camPos = ac.position.clone().addScaledVector(nose, len * 2.4).add(new THREE.Vector3(0, len * 0.5, 0))
    else if (mode === 'wing') { camPos = ac.localToWorld(new THREE.Vector3(ac.userData.halfSpan * 0.55, ac.userData.radius * 0.9, len * 0.35)); this.smoothCam.copy(camPos) }
    else if (mode === 'flyby' || mode === 'low') camPos = this._cine.anchor
    else if (mode === 'ground') {
      const end = this.track[this.track.length - 1]
      camPos = new THREE.Vector3(end.x * FT + 400, 30, end.z * FT + 300)
      if (!this._groundCam) this._groundCam = camPos.clone()
      camPos = this._groundCam
    }
    if (this.firstFrame || dt > 1) {
      this.smoothCam.copy(camPos); this.smoothLook.copy(look); this.firstFrame = false
    } else {
      const fixed = mode === 'ground' || mode === 'flyby' || mode === 'low' || mode === 'wing'
      this.smoothCam.lerp(camPos, fixed ? 1 : 1 - Math.exp(-dt * 4))
      this.smoothLook.lerp(look, 1 - Math.exp(-dt * 8))
    }
    this.camera.position.copy(this.smoothCam).add(new THREE.Vector3(jitter(), jitter(), jitter()))
    this.camera.lookAt(mode === 'wing' ? ac.localToWorld(new THREE.Vector3(0, ac.userData.radius * 0.3, -len * 0.6)) : this.smoothLook)
    if (mode === 'chase') this.camera.rotateZ(-(state.roll_deg || 0) * DEG * 0.25)
    this.composer.render()
  }

  dispose() {
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { m.map?.dispose(); m.dispose() } }
    })
    if (this._envTarget) this._envTarget.dispose()
    this.pmrem.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }
}
