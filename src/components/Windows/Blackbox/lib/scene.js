/**
 * three.js replay scene: procedural airliner, terrain, sky, trajectory ribbon,
 * and camera modes. Units: 1 scene unit = 10 ft. North = -Z, East = +X, up = +Y.
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
    // flat farmland
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
  const length = 18 * scale // ~180 ft for a widebody at scale 1
  const radius = 1.05 * scale

  // Fuselage: nose along -Z
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - 2 * radius, 6, 16), white)
  fus.rotation.x = Math.PI / 2
  group.add(fus)
  // Cockpit windows band
  const cockpit = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 0.85, 0.5 * scale, 16, 1, true), dark)
  cockpit.rotation.x = Math.PI / 2
  cockpit.position.set(0, radius * 0.25, -length / 2 + radius * 1.6)
  group.add(cockpit)

  // Wings: swept trapezoid, extruded thin
  const halfSpan = 10.5 * scale
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, -2.6 * scale)
  wingShape.lineTo(halfSpan, -0.2 * scale)
  wingShape.lineTo(halfSpan, 0.8 * scale)
  wingShape.lineTo(0, 2.0 * scale)
  wingShape.lineTo(0, -2.6 * scale)
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.22 * scale, bevelEnabled: false })
  // extrude along z; rotate so span is along x, chord along z, thickness along y
  const rightWing = new THREE.Mesh(wingGeo, grey)
  rightWing.rotation.x = Math.PI / 2
  rightWing.position.set(0, -radius * 0.55, 0.6 * scale)
  const leftWing = rightWing.clone()
  leftWing.scale.x = -1
  // dihedral
  rightWing.rotation.z = 5 * DEG
  leftWing.rotation.z = -5 * DEG
  group.add(rightWing, leftWing)

  // Engines
  const engines = kind === 'airliner_quad' ? [-0.62, -0.35, 0.35, 0.62] : kind === 'narrowbody_tri' ? [-0.4, 0.4] : [-0.42, 0.42]
  const engineR = (kind === 'regional_turboprop' ? 0.45 : 0.62) * scale
  for (const f of engines) {
    const x = f * halfSpan
    const z = 0.6 * scale + (Math.abs(f) * halfSpan) * 0.24 - 1.2 * scale
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

  // Vertical fin
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
  // Horizontal stabiliser
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

  group.userData.length = length
  return group
}

export class ReplayScene {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 60000)
    this.cameraMode = 'chase'
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.minDistance = 8
    this.controls.maxDistance = 400
    this.skyColor = new THREE.Color(0x7fb2e8)
    this.scene.background = this.skyColor
    this.scene.fog = new THREE.Fog(this.skyColor, 400, 9000)
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x3a4a2a, 1.3)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(300, 600, 200)
    this.scene.add(sun)

    this.world = new THREE.Group()
    this.scene.add(this.world)
    this.aircraft = null
    this.ground = null
    this.trail = null
    this.trailPositions = null
    this.trailCount = 0
    this.clouds = new THREE.Group()
    this.scene.add(this.clouds)
    this.targetPos = new THREE.Vector3()
    this.smoothCam = new THREE.Vector3()
    this.smoothLook = new THREE.Vector3()
    this.firstFrame = true
  }

  setup(fdr, track) {
    this.fdr = fdr
    this.track = track
    if (this.aircraft) this.world.remove(this.aircraft)
    this.aircraft = buildAircraft(fdr.aircraft_model || 'airliner_twin')
    this.world.add(this.aircraft)
    this._buildTerrain(fdr.terrain || 'flat')
    this._buildTrail()
    this._buildClouds()
    this.firstFrame = true
  }

  _buildTerrain(kind) {
    if (this.ground) { this.world.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.map?.dispose(); this.ground.material.dispose() }
    if (this.extras) { this.world.remove(this.extras) }
    this.extras = new THREE.Group()
    const texKind = kind === 'ocean' ? 'ocean' : kind === 'city' ? 'city' : 'flat'
    const tex = makeTexture(texKind)
    const size = 60000
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }))
    this.ground.rotation.x = -Math.PI / 2
    this.world.add(this.ground)
    const end = this.track[this.track.length - 1]
    const endHdg = (this.fdr.params.hdg_deg.keys[this.fdr.params.hdg_deg.keys.length - 1][1] || 0) * DEG
    if (kind === 'runway' || kind === 'city') {
      // A runway aligned with the final heading, threshold near the final position
      const runway = new THREE.Mesh(new THREE.PlaneGeometry(20, 1100), new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 1 }))
      runway.rotation.x = -Math.PI / 2
      runway.rotation.z = -endHdg
      const along = new THREE.Vector3(Math.sin(endHdg), 0, -Math.cos(endHdg))
      runway.position.set(end.x * FT + along.x * 560, 0.2, end.z * FT + along.z * 560)
      this.extras.add(runway)
      const stripes = new THREE.Group()
      for (let i = 0; i < 20; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }))
        s.rotation.x = -Math.PI / 2
        s.position.set(0, 0.25, -520 + i * 55)
        stripes.add(s)
      }
      stripes.rotation.y = -endHdg
      stripes.position.copy(runway.position)
      this.extras.add(stripes)
      if (kind === 'city') {
        // River of water with buildings either side of the final track
        const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 6000), new THREE.MeshStandardMaterial({ color: 0x1f4f7a, roughness: 0.6 }))
        water.rotation.x = -Math.PI / 2
        water.rotation.z = -endHdg
        water.position.set(end.x * FT, 0.3, end.z * FT)
        this.extras.add(water)
        this.extras.remove(runway, stripes)
        const bmat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.8 })
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
      // A few landmarks so motion is visible near the ground
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 })
      for (let i = 0; i < 120; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 6, 2 + Math.random() * 4, 3 + Math.random() * 6), mat)
        b.position.set(end.x * FT + (Math.random() - 0.5) * 3000, 1.5, end.z * FT + (Math.random() - 0.5) * 3000)
        this.extras.add(b)
      }
    }
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
    // Ghost of the full path
    const ghost = new THREE.Line(geo.clone(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }))
    ghost.geometry.setDrawRange(0, n)
    ghost.frustumCulled = false
    if (this.ghost) this.world.remove(this.ghost)
    this.ghost = ghost
    this.world.add(ghost)
  }

  _buildClouds() {
    this.clouds.clear()
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false })
    const alts = this.fdr.params.alt_ft.keys.map((k) => k[1])
    const maxAlt = Math.max(...alts)
    const minAlt = Math.min(...alts)
    const layer = Math.max(1500, minAlt + (maxAlt - minAlt) * 0.35)
    for (let i = 0; i < 160; i++) {
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(60 + Math.random() * 160, 10), mat)
      cloud.rotation.x = -Math.PI / 2
      const along = this.track[Math.floor(Math.random() * this.track.length)]
      cloud.position.set(along.x * FT + (Math.random() - 0.5) * 6000, layer * FT + (Math.random() - 0.5) * 300, along.z * FT + (Math.random() - 0.5) * 6000)
      this.clouds.add(cloud)
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode
    this.controls.enabled = mode === 'orbit'
    this.firstFrame = true
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** state: sampled parameters; pos: track position in feet. */
  update(state, pos, dt) {
    if (!this.aircraft) return
    const ac = this.aircraft
    ac.position.set(pos.x * FT, Math.max(0.6, pos.y * FT), pos.z * FT)
    ac.rotation.order = 'YXZ'
    ac.rotation.y = -(state.hdg_deg || 0) * DEG
    ac.rotation.x = (state.pitch_deg || 0) * DEG
    ac.rotation.z = -(state.roll_deg || 0) * DEG

    // Trail draw range follows time
    const idx = Math.max(0, Math.min(this.track.length, Math.floor((state.t - this.track[0].t) / (this.track[1].t - this.track[0].t)) + 1))
    this.trail.geometry.setDrawRange(0, idx)

    // Sky darkens with altitude
    const alt = state.alt_ft || 0
    const k = Math.min(1, alt / 40000)
    this.skyColor.setRGB(0.5 - 0.42 * k, 0.7 - 0.5 * k, 0.91 - 0.45 * k)
    this.scene.fog.color.copy(this.skyColor)
    this.scene.fog.near = 200 + k * 800
    this.scene.fog.far = 6000 + k * 12000

    // Camera
    const len = ac.userData.length
    const hdgRad = (state.hdg_deg || 0) * DEG
    // Local nose is -Z; after yaw rotation.y = -hdg the nose points (sin hdg, 0, -cos hdg)
    const nose = new THREE.Vector3(Math.sin(hdgRad), 0, -Math.cos(hdgRad))
    let camPos
    let look = ac.position.clone()
    if (this.cameraMode === 'chase') {
      camPos = ac.position.clone().addScaledVector(nose, -len * 2.6).add(new THREE.Vector3(0, len * 0.7, 0))
    } else if (this.cameraMode === 'side') {
      const right = new THREE.Vector3(-nose.z, 0, nose.x)
      camPos = ac.position.clone().addScaledVector(right, len * 2.4).add(new THREE.Vector3(0, len * 0.35, 0))
    } else if (this.cameraMode === 'front') {
      camPos = ac.position.clone().addScaledVector(nose, len * 2.4).add(new THREE.Vector3(0, len * 0.5, 0))
    } else if (this.cameraMode === 'ground') {
      const end = this.track[this.track.length - 1]
      camPos = new THREE.Vector3(end.x * FT + 400, 30, end.z * FT + 300)
      if (!this._groundCam) this._groundCam = camPos.clone()
      camPos = this._groundCam
    } else if (this.cameraMode === 'orbit') {
      this.controls.target.copy(ac.position)
      if (this.firstFrame) {
        this.camera.position.copy(ac.position.clone().add(new THREE.Vector3(len * 1.8, len * 0.9, len * 1.8)))
      }
      this.controls.update()
      this.firstFrame = false
      this.renderer.render(this.scene, this.camera)
      return
    }
    if (this.firstFrame || dt > 1) {
      this.smoothCam.copy(camPos)
      this.smoothLook.copy(look)
      this.firstFrame = false
    } else {
      const a = this.cameraMode === 'ground' ? 1 : 1 - Math.exp(-dt * 4)
      this.smoothCam.lerp(camPos, a)
      this.smoothLook.lerp(look, 1 - Math.exp(-dt * 8))
    }
    this.camera.position.copy(this.smoothCam)
    this.camera.lookAt(this.smoothLook)
    if (this.cameraMode === 'chase') this.camera.rotateZ(-(state.roll_deg || 0) * DEG * 0.25)
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
