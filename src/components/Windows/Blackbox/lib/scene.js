/**
 * three.js replay scene: procedural airliner, terrain, sky, trajectory ribbon,
 * weather, day/night, and camera modes (chase, side, front, ground, orbit,
 * cockpit, cinematic). Units: 1 scene unit = 10 ft. North = -Z, East = +X, up = +Y.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const FT = 0.1 // scene units per foot
const DEG = Math.PI / 180

function makeTexture(kind) {
  const size = 512
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (kind === 'ocean') {
    g.fillStyle = '#123f6b'
    g.fillRect(0, 0, size, size)
    g.strokeStyle = 'rgba(180,220,255,0.18)'
    g.lineWidth = 2
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * size
      const x = Math.random() * size
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + 30, y - 6, x + 60 + Math.random() * 40, y)
      g.stroke()
    }
  } else if (kind === 'city') {
    g.fillStyle = '#3a3f46'
    g.fillRect(0, 0, size, size)
    g.fillStyle = '#4c5259'
    for (let i = 0; i < 400; i++) g.fillRect(Math.random() * size, Math.random() * size, 4 + Math.random() * 20, 4 + Math.random() * 20)
    g.strokeStyle = '#6a7079'
    g.lineWidth = 3
    for (let i = 0; i < size; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.moveTo(0, i); g.lineTo(size, i); g.stroke() }
  } else {
    g.fillStyle = '#4c6b2f'
    g.fillRect(0, 0, size, size)
    const cols = ['#5c7a36', '#3f5c28', '#6b7d3a', '#546b30', '#7a6a3c']
    for (let i = 0; i < 60; i++) {
      g.fillStyle = cols[i % cols.length]
      g.fillRect(Math.random() * size, Math.random() * size, 40 + Math.random() * 120, 30 + Math.random() * 90)
    }
    g.strokeStyle = 'rgba(30,40,20,0.5)'
    g.lineWidth = 2
    for (let i = 0; i < size; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.moveTo(0, i); g.lineTo(size, i); g.stroke() }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(400, 400)
  tex.anisotropy = 4
  return tex
}

function buildAircraft(kind) {
  const group = new THREE.Group()
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 0.2, roughness: 0.5 })
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8bec8, metalness: 0.3, roughness: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f38, metalness: 0.4, roughness: 0.5 })
  const accent = new THREE.MeshStandardMaterial({ color: 0xd9472b, metalness: 0.2, roughness: 0.5 })

  const scale = { airliner_twin: 1, airliner_quad: 1.35, regional_turboprop: 0.5, regional_jet: 0.55, narrowbody_tri: 0.95 }[kind] || 1
  const length = 18 * scale
  const radius = 1.05 * scale

  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - 2 * radius, 6, 16), white)
  fus.rotation.x = Math.PI / 2
  group.add(fus)
  const cockpit = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.5 * scale, 16, 1, true), dark)
  cockpit.rotation.x = Math.PI / 2
  cockpit.position.set(0, radius * 0.25, -length / 2 + radius * 1.6)
  group.add(cockpit)

  const halfSpan = 10.5 * scale
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, -2.6 * scale)
  wingShape.lineTo(halfSpan, -0.2 * scale)
  wingShape.lineTo(halfSpan, 0.8 * scale)
  wingShape.lineTo(0, 2.0 * scale)
  wingShape.lineTo(0, -2.6 * scale)
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.22 * scale, bevelEnabled: false })
  const rightWing = new THREE.Mesh(wingGeo, grey)
  rightWing.rotation.x = Math.PI / 2
  rightWing.position.set(0, -radius * 0.55, 0.6 * scale)
  const leftWing = rightWing.clone()
  leftWing.scale.x = -1
  rightWing.rotation.z = 5 * DEG
  leftWing.rotation.z = -5 * DEG
  group.add(rightWing, leftWing)

  const engines = kind === 'airliner_quad' ? [-0.62, -0.35, 0.35, 0.62] : kind === 'narrowbody_tri' ? [-0.4, 0.4] : [-0.42, 0.42]
  const engineR = (kind === 'regional_turboprop' ? 0.45 : 0.62) * scale
  for (const f of engines) {
    const x = f * halfSpan
    const z = 0.6 * scale + Math.abs(f) * halfSpan * 0.24 - 1.2 * scale
    if (kind === 'regional_turboprop') {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(engineR, engineR * 0.7, 2.4 * scale, 12), grey)
      nacelle.rotation.x = Math.PI / 2
      nacelle.position.set(x, -radius * 0.15, z - 1.0 * scale)
      group.add(nacelle)
      const prop = new THREE.Mesh(new THREE.CircleGeometry(1.5 * scale, 24), new THREE.MeshBasicMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
      prop.position.set(x, -radius * 0.15, z - 2.25 * scale)
      group.add(prop)
    } else {
      const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(engineR, engineR * 0.9, 2.2 * scale, 16, 1, true), grey)
      nacelle.rotation.x = Math.PI / 2
      nacelle.position.set(x, -radius * 1.15, z)
      const fan = new THREE.Mesh(new THREE.CircleGeometry(engineR * 0.95, 16), dark)
      fan.position.set(x, -radius * 1.15, z - 1.1 * scale)
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.25 * scale, radius * 0.7, 1.4 * scale), grey)
      pylon.position.set(x, -radius * 0.8, z + 0.2 * scale)
      group.add(nacelle, fan, pylon)
    }
  }
  if (kind === 'narrowbody_tri') {
    const tailEngine = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * scale, 0.5 * scale, 2.4 * scale, 16), grey)
    tailEngine.rotation.x = Math.PI / 2
    tailEngine.position.set(0, radius * 0.9, length / 2 - 2.5 * scale)
    group.add(tailEngine)
  }

  const finShape = new THREE.Shape()
  finShape.moveTo(0, 0)
  finShape.lineTo(3.2 * scale, 0)
  finShape.lineTo(2.6 * scale, 3.6 * scale)
  finShape.lineTo(1.7 * scale, 3.6 * scale)
  finShape.lineTo(0, 0)
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.16 * scale, bevelEnabled: false }), accent)
  fin.rotation.y = Math.PI / 2
  fin.position.set(0.08 * scale, radius * 0.6, length / 2 - 3.6 * scale)
  group.add(fin)
  const stabShape = new THREE.Shape()
  stabShape.moveTo(0, -1.2 * scale)
  stabShape.lineTo(4 * scale, 0.1 * scale)
  stabShape.lineTo(4 * scale, 0.5 * scale)
  stabShape.lineTo(0, 0.6 * scale)
  stabShape.lineTo(0, -1.2 * scale)
  const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.14 * scale, bevelEnabled: false })
  const rStab = new THREE.Mesh(stabGeo, grey)
  rStab.rotation.x = Math.PI / 2
  rStab.position.set(0, radius * 0.5, length / 2 - 2.2 * scale)
  const lStab = rStab.clone()
  lStab.scale.x = -1
  group.add(rStab, lStab)

  // Navigation and strobe lights (unlit, so they read at night)
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }))
  navL.position.set(-halfSpan, -radius * 0.5, 0.6 * scale)
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 6, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 }))
  navR.position.set(halfSpan, -radius * 0.5, 0.6 * scale)
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }))
  beacon.position.set(0, radius * 1.05, 0)
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  strobe.position.set(0, radius * 0.6 + 3.6 * scale, length / 2 - 2.4 * scale)
  group.add(navL, navR, beacon, strobe)
  group.userData.lights = { beacon, strobe }

  group.userData.length = length
  group.userData.radius = radius
  return group
}

export class ReplayScene {
  constructor(canvas, { onLightning } = {}) {
    this.canvas = canvas
    this.onLightning = onLightning
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.3, 60000)
    this.cameraMode = 'chase'
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.minDistance = 8
    this.controls.maxDistance = 400
    this.skyColor = new THREE.Color(0x7fb2e8)
    this.scene.background = this.skyColor
    this.scene.fog = new THREE.Fog(this.skyColor, 400, 9000)
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 1.3)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6)
    this.sun.position.set(300, 600, 200)
    this.scene.add(this.sun)
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0)
    this.moon.position.set(-400, 500, -200)
    this.scene.add(this.moon)

    this.world = new THREE.Group()
    this.scene.add(this.world)
    this.aircraft = null
    this.ground = null
    this.trail = null
    this.trailPositions = null
    this.clouds = new THREE.Group()
    this.scene.add(this.clouds)
    this.targetPos = new THREE.Vector3()
    this.smoothCam = new THREE.Vector3()
    this.smoothLook = new THREE.Vector3()
    this.firstFrame = true
    this.env = { night: 0, rain: 0, storm: false, fog: 0 }
    this.flash = 0
    this._nextFlash = 3
    this._cine = { sub: 'chase', timer: 0, anchor: new THREE.Vector3() }
    this._elapsed = 0
    this._buildStars()
    this._buildRain()
  }

  _buildStars() {
    const n = 1800
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection()
      if (v.y < 0.02) v.y = Math.abs(v.y) + 0.02
      v.multiplyScalar(40000)
      pos.set([v.x, v.y, v.z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 60, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    this.stars.frustumCulled = false
    this.scene.add(this.stars)
  }

  _buildRain() {
    const n = 2200
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 240, Math.random() * 160, (Math.random() - 0.5) * 240], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false }))
    this.rain.frustumCulled = false
    this.scene.add(this.rain)
  }

  /** env: { night: 0..1, rain: 0..1, storm: bool, fog: 0..1 } */
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
    this.clearGhost()
    this.clearFormation()
    this.firstFrame = true
    this._groundCam = null
    this._cine = { sub: 'chase', timer: 0, anchor: new THREE.Vector3() }
  }

  _buildTerrain(kind) {
    if (this.ground) { this.world.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.map?.dispose(); this.ground.material.dispose() }
    if (this.extras) this.world.remove(this.extras)
    this.extras = new THREE.Group()
    const night = this.env.night
    const texKind = kind === 'ocean' ? 'ocean' : kind === 'city' ? 'city' : 'flat'
    const tex = makeTexture(texKind)
    const size = 60000
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }))
    this.ground.rotation.x = -Math.PI / 2
    this.world.add(this.ground)
    const end = this.track[this.track.length - 1]
    const endHdg = (this.fdr.params.hdg_deg.keys[this.fdr.params.hdg_deg.keys.length - 1][1] || 0) * DEG
    const along = new THREE.Vector3(Math.sin(endHdg), 0, -Math.cos(endHdg))
    const right = new THREE.Vector3(-along.z, 0, along.x)
    if (kind === 'runway' || kind === 'city') {
      const runway = new THREE.Mesh(new THREE.PlaneGeometry(20, 1100), new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 1 }))
      runway.rotation.x = -Math.PI / 2
      runway.rotation.z = -endHdg
      runway.position.set(end.x * FT + along.x * 560, 0.2, end.z * FT + along.z * 560)
      this.extras.add(runway)
      const stripes = new THREE.Group()
      for (let i = 0; i < 20; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }))
        s.rotation.x = -Math.PI / 2
        s.position.set(0, 0.25, -520 + i * 55)
        stripes.add(s)
      }
      // Edge lights and approach lights: bright at night, subtle by day
      const edgeMat = new THREE.MeshBasicMaterial({ color: night > 0.3 ? 0xffffff : 0xdddddd })
      const appMat = new THREE.MeshBasicMaterial({ color: 0xffd080 })
      for (let i = 0; i <= 22; i++) {
        for (const side of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.35 + night * 0.4, 6, 6), edgeMat)
          l.position.set(side * 10.5, 0.5, -540 + i * 50)
          stripes.add(l)
        }
      }
      for (let i = 1; i <= 10; i++) {
        for (let j = -2; j <= 2; j++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.35 + night * 0.4, 6, 6), appMat)
          l.position.set(j * 2.2, 0.6, 560 + i * 30)
          stripes.add(l)
        }
      }
      stripes.rotation.y = -endHdg
      stripes.position.copy(runway.position)
      this.extras.add(stripes)
      if (kind === 'city') {
        const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 6000), new THREE.MeshStandardMaterial({ color: 0x1f4f7a, roughness: 0.6 }))
        water.rotation.x = -Math.PI / 2
        water.rotation.z = -endHdg
        water.position.set(end.x * FT, 0.3, end.z * FT)
        this.extras.add(water)
        this.extras.remove(runway, stripes)
        const bmat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.8, emissive: new THREE.Color(0xffc060), emissiveIntensity: night * 0.45 })
        for (let i = 0; i < 260; i++) {
          const side = i % 2 ? 1 : -1
          const dist = 150 + Math.random() * 400
          const d = -2500 + Math.random() * 5000
          const h = 6 + Math.random() * 40
          const b = new THREE.Mesh(new THREE.BoxGeometry(8 + Math.random() * 14, h, 8 + Math.random() * 14), bmat)
          const px = Math.cos(endHdg) * side * dist + Math.sin(endHdg) * d
          const pz = Math.sin(endHdg) * side * dist - Math.cos(endHdg) * d
          b.position.set(end.x * FT + px, h / 2, end.z * FT + pz)
          this.extras.add(b)
        }
      }
    }
    if (kind === 'flat') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1, emissive: new THREE.Color(0xffb060), emissiveIntensity: night * 0.35 })
      for (let i = 0; i < 120; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 6, 2 + Math.random() * 4, 3 + Math.random() * 6), mat)
        b.position.set(end.x * FT + (Math.random() - 0.5) * 3000, 1.5, end.z * FT + (Math.random() - 0.5) * 3000)
        this.extras.add(b)
      }
      // A scatter of distant town lights at night
      if (night > 0.3) {
        const lm = new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
        for (let i = 0; i < 400; i++) {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.9, 4, 4), lm)
          l.position.set(end.x * FT + (Math.random() - 0.5) * 12000, 0.8, end.z * FT + (Math.random() - 0.5) * 12000)
          this.extras.add(l)
        }
      }
    }
    // A faint "ship" light or two on the ocean at night, just for depth
    if (kind === 'ocean' && night > 0.3) {
      const lm = new THREE.MeshBasicMaterial({ color: 0xfff0c0 })
      for (let i = 0; i < 6; i++) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(1.2, 4, 4), lm)
        l.position.set(end.x * FT + (Math.random() - 0.5) * 20000, 0.8, end.z * FT + (Math.random() - 0.5) * 20000)
        this.extras.add(l)
      }
    }
    void right
    this.world.add(this.extras)
  }

  _buildTrail() {
    if (this.trail) { this.world.remove(this.trail); this.trail.geometry.dispose() }
    const n = this.track.length
    this.trailPositions = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const p = this.track[i]
      this.trailPositions[i * 3] = p.x * FT
      this.trailPositions[i * 3 + 1] = p.y * FT
      this.trailPositions[i * 3 + 2] = p.z * FT
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3))
    geo.setDrawRange(0, 0)
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.85 }))
    this.trail.frustumCulled = false
    this.world.add(this.trail)
    const ghost = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }))
    ghost.geometry.setDrawRange(0, n)
    ghost.frustumCulled = false
    if (this.ghost) this.world.remove(this.ghost)
    this.ghost = ghost
    this.world.add(ghost)
  }

  _buildClouds() {
    this.clouds.clear()
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 * (1 - this.env.night * 0.75), depthWrite: false })
    const alts = this.fdr.params.alt_ft.keys.map((k) => k[1])
    const maxAlt = Math.max(...alts)
    const minAlt = Math.min(...alts)
    const layer = Math.max(1500, minAlt + (maxAlt - minAlt) * 0.35)
    const count = 160 + Math.round(this.env.rain * 120)
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(60 + Math.random() * 160, 10), mat)
      cloud.rotation.x = -Math.PI / 2
      const along = this.track[Math.floor(Math.random() * this.track.length)]
      cloud.position.set(along.x * FT + (Math.random() - 0.5) * 6000, layer * FT + (Math.random() - 0.5) * 300, along.z * FT + (Math.random() - 0.5) * 6000)
      this.clouds.add(cloud)
    }
  }

  /**
   * Counterfactual ghost: from time t the ghost holds the altitude, heading and
   * ground speed the aircraft had at that instant, so the divergence is visible.
   */
  setGhost(t, pos, state) {
    this.clearGhost()
    const g = buildAircraft(this.fdr.aircraft_model || 'airliner_twin')
    g.traverse((o) => {
      if (o.material) {
        o.material = o.material.clone()
        o.material.transparent = true
        o.material.opacity = 0.28
        o.material.depthWrite = false
        if (o.material.color) o.material.color.set(0x9fd8ff)
        if (o.material.emissive) o.material.emissive.set(0x2a6aa0)
      }
    })
    this.world.add(g)
    const hdg = (state.hdg_deg || 0) * DEG
    this.ghost = {
      mesh: g,
      t,
      x: pos.x, y: Math.max(pos.y, 6), z: pos.z,
      hdg,
      gs: (state.gs_kt || state.ias_kt || 250) * 1.68781
    }
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
    const x = g.x + Math.sin(g.hdg) * d
    const z = g.z - Math.cos(g.hdg) * d
    g.mesh.position.set(x * FT, g.y * FT, z * FT)
    g.mesh.rotation.order = 'YXZ'
    g.mesh.rotation.y = -g.hdg
    g.mesh.rotation.x = 0
    g.mesh.rotation.z = 0
    const arr = this.ghostLine.geometry.getAttribute('position').array
    arr[0] = g.x * FT; arr[1] = g.y * FT; arr[2] = g.z * FT
    arr[3] = x * FT; arr[4] = g.y * FT; arr[5] = z * FT
    this.ghostLine.geometry.getAttribute('position').needsUpdate = true
  }

  /** Project a track position (feet) to canvas pixels. Returns { x, y, visible }. */
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

  /**
   * Formation: other recorded flights flown abreast of this one. Each keeps its own
   * manoeuvres and altitude changes, measured from its own t=0 and rotated so that
   * its initial heading matches this flight's, so at t=0 they are wingtip to wingtip
   * and afterwards each diverges the way it really did. entries: [{ id, fdr, track, sample, trackAt }]
   */
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
      mesh.traverse((o) => {
        if (o.material) {
          o.material = o.material.clone()
          o.material.transparent = true
          o.material.opacity = 0.6
          if (o.material.color) o.material.color.set(tint)
          if (o.material.emissive) o.material.emissive.set(tint).multiplyScalar(0.25)
        }
      })
      this.world.add(mesh)
      const side = i % 2 ? 1 : -1
      const lane = Math.ceil((i + 1) / 2) * 320
      const base = { x: p0.x + right.x * side * lane, y: p0.y, z: p0.z + right.z * side * lane }
      const o0 = e.trackAt(0)
      const hdgF = (e.sample(0).hdg_deg || 0) * DEG
      const rot = hdgP - hdgF
      const place = (t) => {
        const q = e.trackAt(t)
        const dx = q.x - o0.x
        const dz = q.z - o0.z
        return { x: base.x + dx * Math.cos(rot) - dz * Math.sin(rot), y: Math.max(6, base.y + (q.y - o0.y)), z: base.z + dx * Math.sin(rot) + dz * Math.cos(rot) }
      }
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
    const i = Math.max(0, Math.min(tr.length - 1, Math.round((t - tr[0].t) / dt)))
    return tr[i]
  }

  clearFormation() {
    for (const f of this.formation || []) { this.world.remove(f.mesh); this.world.remove(f.line); f.line.geometry.dispose() }
    this.formation = []
  }

  /** Move formation aircraft to time t (same relative clock). Returns their positions in feet for labels. */
  updateFormation(t) {
    const out = []
    for (const f of this.formation || []) {
      const inRange = t >= f.fdr.t_start && t <= f.fdr.t_end
      f.mesh.visible = inRange
      if (!inRange) { out.push(null); continue }
      const st = f.sample(t)
      const pos = f.place(t)
      f.mesh.position.set(pos.x * FT, pos.y * FT, pos.z * FT)
      f.mesh.rotation.order = 'YXZ'
      f.mesh.rotation.y = -((st.hdg_deg || 0) * DEG + f.rot)
      f.mesh.rotation.x = (st.pitch_deg || 0) * DEG
      f.mesh.rotation.z = -(st.roll_deg || 0) * DEG
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

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  _updateAtmosphere(state, dt) {
    const alt = state.alt_ft || 0
    const k = Math.min(1, alt / 40000)
    const night = this.env.night
    const day = new THREE.Color(0.5 - 0.42 * k, 0.7 - 0.5 * k, 0.91 - 0.45 * k)
    const dusk = new THREE.Color(0.12, 0.09, 0.18)
    const dark = new THREE.Color(0.015, 0.02, 0.05)
    const c = day.clone().lerp(night > 0.6 ? dark : dusk, night)
    // storm: grey it down
    if (this.env.storm) c.lerp(new THREE.Color(0.25, 0.27, 0.32), 0.55 * (1 - night))
    else if (this.env.rain > 0) c.lerp(new THREE.Color(0.45, 0.5, 0.58), 0.4 * this.env.rain * (1 - night))
    // lightning
    if (this.env.storm) {
      this._nextFlash -= dt
      if (this._nextFlash <= 0) {
        this.flash = 1
        this._nextFlash = 3 + Math.random() * 7
        this.onLightning && this.onLightning()
      }
    }
    this.flash *= Math.exp(-dt * 7)
    if (this.flash > 0.01) c.lerp(new THREE.Color(0.85, 0.88, 1), this.flash * 0.75)
    this.skyColor.copy(c)
    this.scene.fog.color.copy(c)
    const fogK = 1 - 0.75 * this.env.fog - 0.4 * this.env.rain
    this.scene.fog.near = (200 + k * 800) * fogK
    this.scene.fog.far = (6000 + k * 12000) * fogK
    this.hemi.intensity = (1.3 - night * 1.1 - this.env.rain * 0.3) + this.flash * 4
    this.sun.intensity = (1.6 - night * 1.5) * (this.env.storm ? 0.4 : 1) + this.flash * 2
    this.moon.intensity = night * 0.45
    this.stars.material.opacity = Math.max(0, night - 0.2) * (this.env.storm ? 0.2 : 1) * (1 - this.env.fog * 0.6)
  }

  _updateRain(dt, acPos, speedFt) {
    if (this.env.rain <= 0) return
    const attr = this.rain.geometry.getAttribute('position')
    const a = attr.array
    const fall = (120 + this.env.rain * 80) * dt
    const drift = Math.min(60, speedFt * 0.02) * dt
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= fall
      a[i + 2] += drift
      if (a[i + 1] < 0) a[i + 1] += 160
      if (a[i + 2] > 120) a[i + 2] -= 240
    }
    attr.needsUpdate = true
    this.rain.position.set(acPos.x, Math.max(0, acPos.y - 80), acPos.z)
  }

  /** state: sampled parameters; pos: track position in feet. */
  update(state, pos, dt) {
    if (!this.aircraft) return
    this._elapsed += dt
    const ac = this.aircraft
    ac.position.set(pos.x * FT, Math.max(0.6, pos.y * FT), pos.z * FT)
    ac.rotation.order = 'YXZ'
    ac.rotation.y = -(state.hdg_deg || 0) * DEG
    ac.rotation.x = (state.pitch_deg || 0) * DEG
    ac.rotation.z = -(state.roll_deg || 0) * DEG
    ac.updateMatrixWorld()
    // blinking lights
    const lights = ac.userData.lights
    if (lights) {
      lights.beacon.visible = Math.floor(this._elapsed * 1.2) % 2 === 0
      lights.strobe.visible = (this._elapsed % 1.4) < 0.08
    }

    const idx = Math.max(0, Math.min(this.track.length, Math.floor((state.t - this.track[0].t) / (this.track[1].t - this.track[0].t)) + 1))
    this.trail.geometry.setDrawRange(0, idx)

    this._updateAtmosphere(state, dt)
    this._updateGhost(state)
    this._updateRain(dt, ac.position, (state.gs_kt || state.ias_kt || 0) * 1.68781)
    this.stars.position.copy(ac.position)

    // Buffet: shake with stall warning or high angle of attack; sharper near impact
    const len = ac.userData.length
    let shake = 0
    if (state.stall_warn) shake = 0.9
    else if (typeof state.aoa_deg === 'number' && state.aoa_deg > 11) shake = Math.min(1, (state.aoa_deg - 11) / 8)
    if (typeof state.ra_ft === 'number' && state.ra_ft < 60 && Math.abs(state.vs_fpm || 0) > 800) shake = Math.max(shake, 0.6)
    const jitter = () => (Math.random() - 0.5) * shake * len * 0.03

    const hdgRad = (state.hdg_deg || 0) * DEG
    const nose = new THREE.Vector3(Math.sin(hdgRad), 0, -Math.cos(hdgRad))
    const right = new THREE.Vector3(-nose.z, 0, nose.x)
    let camPos
    let look = ac.position.clone()
    let mode = this.cameraMode

    if (mode === 'cockpit') {
      const local = new THREE.Vector3(0, ac.userData.radius * 0.55, -len / 2 - 0.3)
      this.camera.position.copy(ac.localToWorld(local)).add(new THREE.Vector3(jitter(), jitter(), jitter()))
      this.camera.quaternion.copy(ac.quaternion)
      this.renderer.render(this.scene, this.camera)
      return
    }
    if (mode === 'orbit') {
      this.controls.target.copy(ac.position)
      if (this.firstFrame) this.camera.position.copy(ac.position.clone().add(new THREE.Vector3(len * 1.8, len * 0.9, len * 1.8)))
      this.controls.update()
      this.firstFrame = false
      this.renderer.render(this.scene, this.camera)
      return
    }
    if (mode === 'cinematic') {
      const c = this._cine
      c.timer += dt
      if (c.timer > 8 || this.firstFrame) {
        const order = ['chase', 'flyby', 'side', 'front', 'low', 'flyby']
        c.sub = order[(order.indexOf(c.sub) + 1) % order.length]
        c.timer = 0
        this.firstFrame = true
        if (c.sub === 'flyby' || c.sub === 'low') {
          // park the camera ahead along the path and let the aircraft fly past
          const dtTrack = this.track[1].t - this.track[0].t
          const ahead = Math.min(this.track.length - 1, idx + Math.round(5 / dtTrack))
          const p = this.track[ahead]
          const side = Math.random() > 0.5 ? 1 : -1
          c.anchor.set(p.x * FT + right.x * side * len * 2.2, Math.max(2, p.y * FT + (c.sub === 'low' ? -len * 1.5 : len * 0.8)), p.z * FT + right.z * side * len * 2.2)
        }
      }
      mode = c.sub
    }
    if (mode === 'chase') {
      camPos = ac.position.clone().addScaledVector(nose, -len * 2.6).add(new THREE.Vector3(0, len * 0.7, 0))
    } else if (mode === 'side') {
      camPos = ac.position.clone().addScaledVector(right, len * 2.4).add(new THREE.Vector3(0, len * 0.35, 0))
    } else if (mode === 'front') {
      camPos = ac.position.clone().addScaledVector(nose, len * 2.4).add(new THREE.Vector3(0, len * 0.5, 0))
    } else if (mode === 'flyby' || mode === 'low') {
      camPos = this._cine.anchor
    } else if (mode === 'ground') {
      const end = this.track[this.track.length - 1]
      camPos = new THREE.Vector3(end.x * FT + 400, 30, end.z * FT + 300)
      if (!this._groundCam) this._groundCam = camPos.clone()
      camPos = this._groundCam
    }
    if (this.firstFrame || dt > 1) {
      this.smoothCam.copy(camPos)
      this.smoothLook.copy(look)
      this.firstFrame = false
    } else {
      const fixed = mode === 'ground' || mode === 'flyby' || mode === 'low'
      const a = fixed ? 1 : 1 - Math.exp(-dt * 4)
      this.smoothCam.lerp(camPos, a)
      this.smoothLook.lerp(look, 1 - Math.exp(-dt * 8))
    }
    this.camera.position.copy(this.smoothCam).add(new THREE.Vector3(jitter(), jitter(), jitter()))
    this.camera.lookAt(this.smoothLook)
    if (mode === 'chase') this.camera.rotateZ(-(state.roll_deg || 0) * DEG * 0.25)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) { m.map?.dispose(); m.dispose() }
      }
    })
    this.renderer.dispose()
  }
}
