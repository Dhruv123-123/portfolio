/**
 * Atlas globe: every accident with a position becomes a point of light on a dark
 * sphere. Points appear as the year slider advances and pulse when fresh.
 * Units: sphere radius R. +Y is north.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const R = 100
const DEG = Math.PI / 180

export function latLonToVec3(lat, lon, r = R) {
  const phi = (90 - lat) * DEG
  const theta = (lon + 180) * DEG
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

const POINT_VS = `
attribute float size;
attribute vec3 color;
attribute float year;
attribute float approx;
attribute float dim;
uniform float uYear;
uniform float uTime;
uniform float uPixelRatio;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vFresh;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float age = uYear - year;
  float vis = step(0.0, age);
  float fresh = 1.0 - clamp(age / 1.2, 0.0, 1.0);
  float pulse = fresh * (0.6 + 0.4 * sin(uTime * 7.0));
  float s = size * (1.0 + 3.0 * pulse) * (1.0 - 0.55 * dim);
  gl_PointSize = s * uPixelRatio * (uScale / -mv.z) * vis;
  gl_Position = projectionMatrix * mv;
  vColor = mix(color, vec3(1.0, 0.95, 0.85), fresh * 0.9);
  vAlpha = vis * (approx > 0.5 ? 0.45 : 0.95) * (1.0 - 0.7 * dim);
  vFresh = fresh;
}`

const POINT_FS = `
varying vec3 vColor;
varying float vAlpha;
varying float vFresh;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.05, r);
  float halo = smoothstep(0.5, 0.2, r) * 0.35;
  gl_FragColor = vec4(vColor, (core + halo + vFresh * 0.3) * vAlpha);
}`

const GLOW_VS = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const GLOW_FS = `
varying vec3 vNormal;
uniform vec3 uColor;
void main() {
  float i = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
  gl_FragColor = vec4(uColor, 1.0) * i;
}`

export class Globe {
  constructor(canvas, { onHover, onClick } = {}) {
    this.canvas = canvas
    this.onHover = onHover
    this.onClick = onClick
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070d)
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 10000)
    this.camera.position.set(0, 70, 390)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.rotateSpeed = 0.5
    this.controls.minDistance = 125
    this.controls.maxDistance = 700
    this.controls.enablePan = false
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.year = 2100
    this.items = []
    this.selectedId = null
    this.hoverId = null
    this.running = false
    this._raf = null
    this._last = 0
    this._elapsed = 0
    this._idleTimer = 0
    this._fly = null
    this._build()
    this._bind()
  }

  _build() {
    // Body of the planet
    const body = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), new THREE.MeshPhongMaterial({ color: 0x0b1222, emissive: 0x050912, specular: 0x1a2a4a, shininess: 18 }))
    this.scene.add(body)
    this.body = body
    this.sun = new THREE.DirectionalLight(0x9fb8ff, 1.1)
    this.sun.position.set(-300, 200, 260)
    this.scene.add(this.sun)
    this.ambient = new THREE.AmbientLight(0x2a3a5a, 0.9)
    this.scene.add(this.ambient)
    this._sunTarget = null

    // Graticule
    const gridPts = []
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 3) {
        gridPts.push(latLonToVec3(lat, lon, R + 0.15), latLonToVec3(lat, lon + 3, R + 0.15))
      }
    }
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -90; lat < 90; lat += 3) {
        gridPts.push(latLonToVec3(lat, lon, R + 0.15), latLonToVec3(lat + 3, lon, R + 0.15))
      }
    }
    const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts)
    this.grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x1b2946, transparent: true, opacity: 0.55 }))
    this.scene.add(this.grid)

    // Atmosphere glow
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 64, 64),
      new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, uniforms: { uColor: { value: new THREE.Color(0x3d6bff) } }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
    )
    this.scene.add(this.glow)

    // Stars
    const starPos = new Float32Array(2600 * 3)
    for (let i = 0; i < 2600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2600 + Math.random() * 1400)
      starPos.set([v.x, v.y, v.z], i * 3)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.7 }))
    this.scene.add(this.stars)

    // Selection marker: ring + beam
    this.marker = new THREE.Group()
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 40), new THREE.MeshBasicMaterial({ color: 0xffbf00, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }))
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.5, 48), new THREE.MeshBasicMaterial({ color: 0xffbf00, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }))
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.6, 26, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffbf00, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
    beam.position.z = 13
    beam.rotation.x = Math.PI / 2
    this.marker.add(ring, ring2, beam)
    this.marker.visible = false
    this.scene.add(this.marker)
    this.markerRings = [ring, ring2]

    this.arcs = new THREE.Group()
    this.scene.add(this.arcs)
    this.points = null
  }

  /** items: [{ id, lat, lon, year, size, color: [r,g,b], approx }] */
  setRecords(items) {
    this.items = items
    if (this.points) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
      this.points.material.dispose()
    }
    const n = items.length
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const color = new Float32Array(n * 3)
    const year = new Float32Array(n)
    const approx = new Float32Array(n)
    const dim = new Float32Array(n)
    this.world = new Array(n)
    items.forEach((it, i) => {
      const v = latLonToVec3(it.lat, it.lon, R + 0.6)
      this.world[i] = v
      pos.set([v.x, v.y, v.z], i * 3)
      size[i] = it.size
      color.set(it.color, i * 3)
      year[i] = it.year
      approx[i] = it.approx ? 1 : 0
      dim[i] = 0
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1))
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geo.setAttribute('year', new THREE.BufferAttribute(year, 1))
    geo.setAttribute('approx', new THREE.BufferAttribute(approx, 1))
    geo.setAttribute('dim', new THREE.BufferAttribute(dim, 1))
    const mat = new THREE.ShaderMaterial({
      vertexShader: POINT_VS,
      fragmentShader: POINT_FS,
      uniforms: { uYear: { value: this.year }, uTime: { value: 0 }, uPixelRatio: { value: this.renderer.getPixelRatio() }, uScale: { value: 220 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.scene.add(this.points)
    this.indexById = {}
    items.forEach((it, i) => (this.indexById[it.id] = i))
    this.setSelected(this.selectedId)
  }

  /** ids: Set of ids to keep bright; everything else is dimmed. null clears. */
  setDim(ids) {
    if (!this.points) return
    const attr = this.points.geometry.getAttribute('dim')
    for (let i = 0; i < this.items.length; i++) attr.array[i] = ids && !ids.has(this.items[i].id) ? 1 : 0
    attr.needsUpdate = true
  }

  setYear(y) {
    this.year = y
    if (this.points) this.points.material.uniforms.uYear.value = y
  }

  setSelected(id, fly = false) {
    this.selectedId = id
    const i = id != null ? this.indexById?.[id] : undefined
    if (i === undefined || i === null) {
      this.marker.visible = false
      return
    }
    const v = this.world[i]
    this.marker.visible = true
    this.marker.position.copy(v)
    this.marker.lookAt(v.clone().multiplyScalar(2))
    if (fly) this.flyTo(v)
  }

  /** arcs: [[lat,lon,lat2,lon2,color?], ...] great-circle-ish lifted curves */
  setArcs(arcs) {
    this.arcs.clear()
    for (const [la1, lo1, la2, lo2, col] of arcs) {
      const a = latLonToVec3(la1, lo1, R + 0.6)
      const b = latLonToVec3(la2, lo2, R + 0.6)
      const d = a.distanceTo(b)
      const mid = a.clone().add(b).normalize().multiplyScalar(R + 4 + d * 0.28)
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col || 0xffbf00, transparent: true, opacity: 0.55 }))
      this.arcs.add(line)
    }
  }

  /** Light the globe from the sub-solar point (lat, lon) as a warm sun; null restores the ambient look. */
  setSun(lat, lon) {
    if (lat === null || lat === undefined) {
      this._sunTarget = { pos: new THREE.Vector3(-300, 200, 260), color: new THREE.Color(0x9fb8ff), intensity: 1.1, ambient: 0.9 }
      return
    }
    this._sunTarget = { pos: latLonToVec3(lat, lon, 600), color: new THREE.Color(0xffe2b0), intensity: 1.9, ambient: 0.35 }
  }

  flyToLatLon(lat, lon) {
    this.flyTo(latLonToVec3(lat, lon, R))
  }

  flyTo(v) {
    const dist = Math.max(this.controls.minDistance, Math.min(260, this.camera.position.length()))
    this._fly = { from: this.camera.position.clone(), to: v.clone().normalize().multiplyScalar(dist), t: 0 }
    this.controls.autoRotate = false
    this._idleTimer = 0
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (this.points) this.points.material.uniforms.uScale.value = Math.max(140, h * 0.42)
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this._raf = requestAnimationFrame(loop)
      this.render()
    }
    this._raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }

  render() {
    const now = performance.now() / 1000
    const dt = this._last ? Math.min(0.1, now - this._last) : 0
    this._last = now
    this._elapsed += dt
    const t = this._elapsed
    if (this.points) this.points.material.uniforms.uTime.value = t
    if (this._fly) {
      this._fly.t = Math.min(1, this._fly.t + dt * 1.6)
      const k = 1 - Math.pow(1 - this._fly.t, 3)
      const p = this._fly.from.clone().lerp(this._fly.to, k)
      p.normalize().multiplyScalar(this._fly.from.length() + (this._fly.to.length() - this._fly.from.length()) * k)
      this.camera.position.copy(p)
      if (this._fly.t >= 1) this._fly = null
    } else {
      this._idleTimer += dt
      if (this._idleTimer > 8) this.controls.autoRotate = true
    }
    if (this._sunTarget) {
      const k = 1 - Math.exp(-dt * 1.5)
      this.sun.position.lerp(this._sunTarget.pos, k)
      this.sun.color.lerp(this._sunTarget.color, k)
      this.sun.intensity += (this._sunTarget.intensity - this.sun.intensity) * k
      this.ambient.intensity += (this._sunTarget.ambient - this.ambient.intensity) * k
    }
    const s = 1 + 0.12 * Math.sin(t * 3)
    this.markerRings[0].scale.setScalar(s)
    this.markerRings[1].scale.setScalar(1.15 - 0.12 * Math.sin(t * 3))
    this.marker.rotation.z += dt * 0.6
    this.stars.rotation.y += dt * 0.004
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** Nearest visible point to a canvas pixel, or null. */
  pick(px, py, radius = 9) {
    if (!this.points) return null
    const rect = this.canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height
    const camDir = this.camera.position.clone().normalize()
    const v = new THREE.Vector3()
    let best = null
    let bestD = radius * radius
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]
      if (it.year > this.year) continue
      const wp = this.world[i]
      if (wp.dot(camDir) < R * 0.12) continue
      v.copy(wp).project(this.camera)
      const sx = (v.x + 1) * 0.5 * w
      const sy = (1 - v.y) * 0.5 * h
      const dx = sx - px
      const dy = sy - py
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = it
      }
    }
    return best
  }

  _bind() {
    const c = this.canvas
    const pos = (e) => {
      const rect = c.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX - rect.left, y: src.clientY - rect.top }
    }
    let down = null
    let lastHover = 0
    c.addEventListener('mousedown', (e) => {
      down = pos(e)
      this.controls.autoRotate = false
      this._idleTimer = 0
    })
    c.addEventListener('mousemove', (e) => {
      const now = performance.now()
      if (now - lastHover < 40) return
      lastHover = now
      const p = pos(e)
      const it = this.pick(p.x, p.y)
      const id = it ? it.id : null
      if (id !== this.hoverId) {
        this.hoverId = id
        c.style.cursor = id ? 'pointer' : 'grab'
        this.onHover && this.onHover(it, p)
      } else if (it && this.onHover) this.onHover(it, p)
    })
    c.addEventListener('mouseleave', () => {
      this.hoverId = null
      this.onHover && this.onHover(null)
    })
    c.addEventListener('mouseup', (e) => {
      const p = pos(e)
      if (down && Math.hypot(p.x - down.x, p.y - down.y) < 5) {
        const it = this.pick(p.x, p.y, 12)
        this.onClick && this.onClick(it)
      }
      down = null
    })
    c.addEventListener('touchstart', (e) => { down = pos(e); this.controls.autoRotate = false; this._idleTimer = 0 }, { passive: true })
    c.addEventListener('touchend', () => {
      if (down) {
        const it = this.pick(down.x, down.y, 16)
        if (it) this.onClick && this.onClick(it)
      }
      down = null
    })
    c.addEventListener('wheel', () => { this.controls.autoRotate = false; this._idleTimer = 0 }, { passive: true })
  }

  dispose() {
    this.stop()
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
    })
    this.renderer.dispose()
  }
}
