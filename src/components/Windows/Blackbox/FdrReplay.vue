<template>
  <div class="fr-root" ref="rootRef" :class="{ theatre: theatre, cinematic: camera === 'cinematic' }">
    <div class="fr-toolbar">
      <select class="bb-select" v-model="replayId">
        <option v-for="r in replayable" :key="r.id" :value="r.id">{{ r.title }} — {{ r.aircraft.type }} ({{ r.date.slice(0, 4) }})</option>
      </select>
      <button class="bb-btn" @click="togglePlay">{{ playing ? '❚❚ Pause' : '▶ Play' }}</button>
      <button class="bb-btn small" @click="seek(fdr ? fdr.t_start : 0)" :disabled="!fdr">⟲</button>
      <span class="fr-speed">
        <button v-for="s in speeds" :key="s" class="bb-btn small" :class="{ active: speed === s }" @click="speed = s">{{ s }}×</button>
      </span>
      <span class="fr-cams">
        <button v-for="c in cameras" :key="c" class="bb-btn small" :class="{ active: camera === c }" @click="setCamera(c)" :title="camTitle[c]">{{ c }}</button>
      </span>
      <span class="fr-fx">
        <button class="bb-btn small" :class="{ active: store.sound }" @click="toggleSound" title="Synthesized cockpit audio: engines, slipstream, warnings, GPWS call-outs (M)">{{ store.sound ? '🔊 sound' : '🔈 sound' }}</button>
        <button class="bb-btn small" :class="{ active: voice }" :disabled="!store.sound" @click="voice = !voice" title="Read CVR lines aloud with the browser's speech synthesis">voice</button>
        <button class="bb-btn small" :class="{ active: theatre }" @click="toggleTheatre" title="Theatre mode (F)">⛶</button>
      </span>
      <span class="fr-clock" v-if="fdr">
        <b>{{ clock }}</b> <span class="bb-muted">{{ record?.time_reference || '' }} · t{{ time >= 0 ? '+' : '' }}{{ time.toFixed(1) }} s</span>
      </span>
      <span class="fr-fidelity bb-muted" v-if="fdr" :title="fdr.source">{{ fdr.fidelity }} · confidence {{ fdr.confidence || 'medium' }}</span>
    </div>

    <div class="fr-main" v-if="fdr">
      <div class="fr-left">
        <div class="fr-3d" :class="{ warn: warnLevel > 0, danger: warnLevel > 1 }">
          <canvas ref="sceneCanvas" class="fr-scene"></canvas>
          <canvas ref="hudCanvas" class="fr-hud" v-show="camera === 'cockpit'"></canvas>
          <div class="fr-vignette" :style="{ opacity: vignette }"></div>
          <div class="fr-bars" v-if="camera === 'cinematic'"></div>
          <div class="fr-marker-toast" v-if="activeMarker">{{ activeMarker.label }}</div>
          <div class="fr-env bb-muted">{{ envLabel }}</div>
          <div class="fr-scene-hint bb-muted">{{ camera === 'orbit' ? 'drag to orbit · wheel to zoom' : camera === 'cockpit' ? 'head-up display · flight path vector shows where the aircraft is actually going' : camera === 'cinematic' ? 'auto-directed cameras' : 'trail: flown path · faint: full path' }}</div>
          <div v-if="ended" class="fr-ended" @click="seek(fdr.t_start)">
            <div class="fr-ended-t">{{ clock }}</div>
            <div class="fr-ended-l">end of recording</div>
            <div class="fr-ended-s" v-if="record.fatalities > 0">{{ record.fatalities }} of {{ record.occupants ?? '?' }} on board did not survive</div>
            <div class="fr-ended-s" v-else>everyone on board survived</div>
            <div class="fr-ended-h bb-muted">click to rewind · <span class="bb-link" @click.stop="store.openTimeline(record.id)">what the investigators found ▸</span></div>
          </div>
          <div v-if="decoding" class="fr-decode">
            <div class="fr-decode-title">DECODING FLIGHT RECORDER</div>
            <div class="fr-decode-sub">{{ record.aircraft.registration || record.title }} · {{ Object.keys(fdr.params).length }} parameters · {{ fdr.t_end - fdr.t_start }} s</div>
            <pre class="fr-decode-hex">{{ hexLines }}</pre>
          </div>
        </div>
        <div class="fr-scrub" ref="scrubRef" @mousedown="scrubStart" @touchstart.prevent="scrubStart">
          <div class="fr-scrub-track"></div>
          <div v-for="(m, i) in fdr.markers" :key="i" class="fr-scrub-marker" :style="{ left: pct(m.t) + '%' }" :title="m.label"></div>
          <div v-for="(c, i) in record.cvr || []" :key="'c' + i" class="fr-scrub-cvr" :style="{ left: pct(c.t) + '%' }"></div>
          <div class="fr-scrub-head" :style="{ left: pct(time) + '%' }"></div>
        </div>
        <canvas ref="stripCanvas" class="fr-strips"></canvas>
      </div>
      <div class="fr-right">
        <div class="fr-panel-tabs">
          <button class="bb-btn small" :class="{ active: panel === 'pfd' }" @click="panel = 'pfd'">PFD</button>
          <button class="bb-btn small" :class="{ active: panel === 'radar' }" @click="panel = 'radar'">RADAR</button>
          <span class="bb-muted fr-panel-hint">{{ panel === 'pfd' ? 'primary flight display' : 'ATC scope · whole track' }}</span>
        </div>
        <canvas ref="pfdCanvas" class="fr-pfd"></canvas>
        <canvas ref="ctlCanvas" class="fr-ctl"></canvas>
        <div class="fr-cvr">
          <div class="fr-cvr-head">
            <span>CVR / events</span>
            <span class="bb-muted" v-if="!(record.cvr && record.cvr.length)">no public transcript · showing report events</span>
          </div>
          <div class="fr-cvr-list bb-scroll" ref="cvrList">
            <div
              v-for="(line, i) in transcript"
              :key="i"
              class="fr-cvr-line"
              :class="{ past: line.t < time, current: i === currentLine, event: line.kind === 'event' }"
              @click="seek(line.t)"
            >
              <span class="fr-cvr-t">{{ line.clock || fmt(line.t) }}</span>
              <span class="fr-cvr-spk" :class="'spk-' + (line.speaker || '').toLowerCase()">{{ line.speaker }}</span>
              <span class="fr-cvr-text">{{ line.text }}<span v-if="line.translation" class="fr-cvr-tr"> — {{ line.translation }}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="bb-center">
      <div class="bb-spinner"></div>
      <div>Loading FDR keyframes…</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { sampleAll, integrateTrack, trackAt, series, paramRange, formatClock, formatRelative } from './lib/fdr.js'
import { drawPFD, drawControls } from './lib/pfd.js'
import { drawHUD, drawRadar } from './lib/hud.js'
import { ReplayScene } from './lib/scene.js'
import { ReplayAudio } from './lib/audio.js'

const props = defineProps({ graph: Object, index: Object })
const store = useBlackboxStore()

const fdrFiles = import.meta.glob('@/data/blackbox/fdr/*.json')

const replayable = computed(() => props.graph.records.filter((r) => r.fdr))
const replayId = ref(store.replayId && props.index.byId[store.replayId]?.fdr ? store.replayId : replayable.value.find((r) => r.id === 'af447')?.id || replayable.value[0]?.id)
const record = computed(() => props.index.byId[replayId.value])
const fdr = shallowRef(null)
const track = shallowRef(null)

const rootRef = ref(null)
const sceneCanvas = ref(null)
const hudCanvas = ref(null)
const pfdCanvas = ref(null)
const ctlCanvas = ref(null)
const stripCanvas = ref(null)
const scrubRef = ref(null)
const cvrList = ref(null)

const playing = ref(false)
const speed = ref(1)
const speeds = [0.25, 0.5, 1, 2, 4]
const cameras = ['chase', 'cockpit', 'cinematic', 'side', 'front', 'ground', 'orbit']
const camTitle = { chase: 'behind the aircraft', cockpit: 'from the flight deck, with a head-up display', cinematic: 'auto-directed cameras that cut every few seconds', side: 'abeam', front: 'ahead, looking back', ground: 'fixed near the end of the track', orbit: 'free orbit' }
const camera = ref('chase')
const panel = ref('pfd')
const time = ref(0)
const activeMarker = ref(null)
const voice = ref(true)
const theatre = ref(false)
const ended = ref(false)
const decoding = ref(false)
const hexLines = ref('')
const vignette = ref(0)
const warnLevel = ref(0)
const gpwsText = ref('')
const env = ref({ night: 0, rain: 0, storm: false, fog: 0 })

let scene = null
let raf = null
let lastTs = 0
let resizeObs = null
let stripCache = null
let decodeTimer = null
let audio = null
let lightningFlash = 0

const clock = computed(() => (record.value ? formatClock(record.value.t0, time.value) : ''))
const fmt = (t) => formatRelative(Math.round(t))
const pct = (t) => (fdr.value ? ((t - fdr.value.t_start) / (fdr.value.t_end - fdr.value.t_start)) * 100 : 0)
const envLabel = computed(() => {
  const e = env.value
  const parts = []
  parts.push(e.night > 0.6 ? 'night' : e.night > 0 ? 'dusk' : 'day')
  if (e.storm) parts.push('thunderstorm')
  else if (e.rain > 0) parts.push('precipitation')
  if (e.fog > 0) parts.push('low visibility')
  return parts.join(' · ')
})

const transcript = computed(() => {
  const rec = record.value
  if (!rec) return []
  const lines = (rec.cvr || []).map((c) => ({ ...c, kind: 'cvr' }))
  const events = (rec.events || []).filter((e) => e.kind !== 'crew_speech' || !lines.length).map((e) => ({ t: e.t, clock: e.clock, speaker: e.actor, text: e.text, kind: 'event' }))
  return [...lines, ...events].sort((a, b) => a.t - b.t)
})
const currentLine = computed(() => {
  let idx = -1
  for (let i = 0; i < transcript.value.length; i++) if (transcript.value[i].t <= time.value) idx = i
  return idx
})

/** Local hour of t0 and weather cues from the record's factors decide the scene's mood. */
function computeEnv(rec, f) {
  const out = { night: 0, rain: 0, storm: false, fog: 0 }
  const t0 = rec.t0 || ''
  const m = String(t0).match(/T(\d\d):(\d\d)/)
  const off = String(t0).match(/([+-])(\d\d):?(\d\d)$/)
  if (m) {
    let hour = +m[1] + +m[2] / 60
    if (!off && rec.location && typeof rec.location.lon === 'number' && /Z$/.test(t0)) hour = (hour + rec.location.lon / 15 + 24) % 24
    out.night = hour < 5 || hour > 20.5 ? 1 : hour < 6.5 || hour > 18.5 ? 0.5 : 0
  }
  const ids = (rec.factors || []).map((x) => x.id).join(' ') + ' ' + (rec.summary || '').toLowerCase()
  if (/thunderstorm|convective|lightning|microburst|windshear|wind_shear/.test(ids)) { out.storm = true; out.rain = 1 }
  else if (/heavy rain|rain|precipitation|hail/.test(ids)) out.rain = 0.7
  else if (/icing|ice_crystal|ice crystals|snow/.test(ids)) out.rain = 0.35
  if (/fog|low_visibility|low visibility|imc|whiteout/.test(ids)) out.fog = 0.8
  if (f.terrain === 'ocean' && out.night === 0 && /cruise/.test(rec.phase || '')) out.night = Math.max(out.night, 0)
  if (f.env) Object.assign(out, f.env)
  return out
}

async function loadFdr(id) {
  const rec = props.index.byId[id]
  if (!rec || !rec.fdr) return
  const key = Object.keys(fdrFiles).find((k) => k.endsWith(`/${rec.fdr}.json`))
  if (!key) return
  startDecoding()
  const mod = await fdrFiles[key]()
  fdr.value = mod.default
  track.value = integrateTrack(fdr.value)
  env.value = computeEnv(rec, fdr.value)
  time.value = store.replayTime ?? fdr.value.t_start
  store.replayTime = null
  playing.value = false
  ended.value = false
  stripCache = null
  if (audio) { audio._prev = null; audio.setRain(env.value.rain) }
  await nextTick()
  initScene()
  renderFrame(0)
}

function startDecoding() {
  decoding.value = true
  clearInterval(decodeTimer)
  const t0 = performance.now()
  const hex = () => Array.from({ length: 14 }, () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')).join(' ')
  const lines = []
  decodeTimer = setInterval(() => {
    lines.push(`${String(lines.length * 64).padStart(6, '0')}  ${hex()}`)
    if (lines.length > 9) lines.shift()
    hexLines.value = lines.join('\n')
    if (performance.now() - t0 > 1500) { clearInterval(decodeTimer); decoding.value = false }
  }, 70)
}

function initScene() {
  if (scene) { scene.dispose(); scene = null }
  if (!sceneCanvas.value) return
  try {
    scene = new ReplayScene(sceneCanvas.value, { onLightning: () => { lightningFlash = 1; if (audio && audio.enabled) audio._tone(60, audio.ctx.currentTime + 0.4 + Math.random() * 1.5, 1.6, { type: 'sawtooth', gain: 0.18, glideTo: 30 }) } })
    scene.setup(fdr.value, track.value, env.value)
    scene.setCameraMode(camera.value)
    scene.resize()
  } catch (e) {
    console.error('WebGL scene failed', e)
    scene = null
  }
}

function setCamera(c) {
  camera.value = c
  scene && scene.setCameraMode(c)
}
function cycleCamera() { setCamera(cameras[(cameras.indexOf(camera.value) + 1) % cameras.length]) }

function togglePlay() {
  if (!fdr.value) return
  if (!playing.value && time.value >= fdr.value.t_end) time.value = fdr.value.t_start
  ended.value = false
  playing.value = !playing.value
  if (playing.value && store.sound && audio) audio.enable(family())
}

function seek(t) {
  if (!fdr.value) return
  time.value = Math.max(fdr.value.t_start, Math.min(fdr.value.t_end, t))
  ended.value = false
  if (audio) audio._prev = null
  renderFrame(2)
}

function family() {
  const mf = (record.value?.aircraft?.manufacturer || record.value?.aircraft?.type || '').toLowerCase()
  return mf.includes('airbus') ? 'airbus' : mf.includes('boeing') || mf.includes('mcdonnell') || mf.includes('douglas') ? 'boeing' : 'other'
}
function toggleSound() {
  if (!audio) audio = new ReplayAudio()
  store.sound = !store.sound
  if (store.sound) { audio.enable(family()); audio.setRain(env.value.rain); audio.voice = voice.value } else audio.disable()
}
watch(voice, (v) => { if (audio) audio.voice = v })

function toggleTheatre() {
  const el = rootRef.value
  if (!theatre.value) {
    theatre.value = true
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
  } else {
    theatre.value = false
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
  }
  nextTick(() => { scene && scene.resize(); stripCache = null; renderFrame(2) })
}
function onFullscreenChange() {
  if (!document.fullscreenElement && theatre.value) theatre.value = false
  nextTick(() => { scene && scene.resize(); stripCache = null; renderFrame(2) })
}

function scrubStart(e) {
  const move = (ev) => {
    const rect = scrubRef.value.getBoundingClientRect()
    const src = ev.touches ? ev.touches[0] : ev
    const f = Math.max(0, Math.min(1, (src.clientX - rect.left) / rect.width))
    seek(fdr.value.t_start + f * (fdr.value.t_end - fdr.value.t_start))
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('touchmove', move)
  window.addEventListener('touchend', up)
  move(e)
}

function fit(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const r = cv.getBoundingClientRect()
  const w = Math.max(1, Math.floor(r.width))
  const h = Math.max(1, Math.floor(r.height))
  if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) {
    cv.width = Math.floor(w * dpr)
    cv.height = Math.floor(h * dpr)
  }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

function renderFrame(dt) {
  if (!fdr.value) return
  const s = sampleAll(fdr.value, time.value)
  const pos = trackAt(track.value, time.value)
  if (scene) scene.update(s, pos, dt)
  if (audio && audio.enabled) audio.update(s, dt, playing.value)

  // Warning state drives the vignette and the HUD annunciation
  const vs = s.vs_fpm || 0
  const ra = typeof s.ra_ft === 'number' ? s.ra_ft : Infinity
  let level = 0
  let g = ''
  if (ra < 2450 && vs < -1400) { level = 1; g = 'SINK RATE' }
  if ((vs < -3000 && ra < 1500) || (vs < -1800 && ra < 500)) { level = 2; g = 'PULL UP' }
  if (s.stall_warn) level = Math.max(level, 2)
  else if (s.law && s.law !== 'NORMAL') level = Math.max(level, 1)
  warnLevel.value = level
  gpwsText.value = g
  const pulse = level > 1 ? 0.35 + 0.25 * Math.abs(Math.sin(performance.now() / 180)) : level === 1 ? 0.2 : 0
  vignette.value = Math.max(pulse, lightningFlash * 0.9)
  lightningFlash *= Math.exp(-dt * 6)

  if (camera.value === 'cockpit' && hudCanvas.value) {
    const { ctx, w, h } = fit(hudCanvas.value)
    drawHUD(ctx, w, h, s, { gpws: g })
  }
  if (pfdCanvas.value) {
    const { ctx, w, h } = fit(pfdCanvas.value)
    if (panel.value === 'radar') drawRadar(ctx, w, h, track.value, time.value, fdr.value, s, record.value.flight_number || record.value.aircraft.registration || '')
    else drawPFD(ctx, w, h, s)
  }
  if (ctlCanvas.value) {
    const { ctx, w, h } = fit(ctlCanvas.value)
    const u = fdr.value.units || {}
    drawControls(ctx, w, h, s, {
      stickLabel: fdr.value.params.column_force_lb ? 'COLUMN / WHEEL' : 'SIDESTICK',
      thsLabel: u.ths_deg && u.ths_deg.includes('unit') ? 'STAB TRIM' : 'THS',
      thsUnit: u.ths_deg && u.ths_deg.includes('unit') ? ' units' : '° NU',
      thsMin: u.ths_deg && u.ths_deg.includes('unit') ? 0 : -5,
      thsMax: u.ths_deg && u.ths_deg.includes('unit') ? 17 : 15
    })
  }
  if (stripCanvas.value) drawStrips(fit(stripCanvas.value), s)
  let m = null
  for (const mk of fdr.value.markers || []) if (mk.t <= time.value && time.value - mk.t < 4) m = mk
  activeMarker.value = m
}

const STRIP_PARAMS = [
  ['alt_ft', 'ALT ft', '#8fb3ff'],
  ['ias_kt', 'IAS kt', '#22e08a'],
  ['pitch_deg', 'PITCH °', '#ffbf00'],
  ['aoa_deg', 'AoA °', '#ff8a5c'],
  ['vs_fpm', 'V/S fpm', '#c792ea'],
  ['n1_pct', 'N1 %', '#ffffff'],
  ['ths_deg', 'TRIM', '#ff5cf0'],
  ['stick_pitch', 'STICK', '#ffd166']
]

function drawStrips({ ctx, w, h }, s) {
  const f = fdr.value
  const params = STRIP_PARAMS.filter(([k]) => f.params[k] && f.params[k].keys.length > 1).slice(0, 6)
  const rowH = h / Math.max(1, params.length)
  const labelW = 64
  const x0 = labelW
  const x1 = w - 6
  const tx = (t) => x0 + ((t - f.t_start) / (f.t_end - f.t_start)) * (x1 - x0)
  if (!stripCache || stripCache.w !== w || stripCache.h !== h) {
    const off = document.createElement('canvas')
    off.width = ctx.canvas.width
    off.height = ctx.canvas.height
    const o = off.getContext('2d')
    o.setTransform(ctx.getTransform())
    o.fillStyle = '#0b0f18'
    o.fillRect(0, 0, w, h)
    params.forEach(([key, label, color], i) => {
      const y0 = i * rowH
      const [min, max] = paramRange(f.params[key])
      const ty = (v) => y0 + rowH - 4 - ((v - min) / (max - min)) * (rowH - 8)
      o.strokeStyle = '#1c2740'
      o.beginPath(); o.moveTo(x0, y0 + rowH); o.lineTo(x1, y0 + rowH); o.stroke()
      o.strokeStyle = color
      o.lineWidth = 1.2
      o.beginPath()
      const pts = series(f.params[key], f.t_start, f.t_end, Math.floor(x1 - x0))
      pts.forEach(([t, v], j) => { if (typeof v !== 'number') return; j === 0 ? o.moveTo(tx(t), ty(v)) : o.lineTo(tx(t), ty(v)) })
      o.stroke()
      o.fillStyle = '#8fa3c7'
      o.font = '9px Tahoma, sans-serif'
      o.textAlign = 'left'
      o.textBaseline = 'top'
      o.fillText(label, 4, y0 + 3)
      o.fillStyle = '#566a92'
      o.textAlign = 'right'
      o.fillText(String(Math.round(max)), x0 - 4, y0 + 2)
      o.textBaseline = 'bottom'
      o.fillText(String(Math.round(min)), x0 - 4, y0 + rowH - 2)
    })
    o.strokeStyle = 'rgba(255,191,0,0.35)'
    for (const mk of f.markers || []) { o.beginPath(); o.moveTo(tx(mk.t), 0); o.lineTo(tx(mk.t), h); o.stroke() }
    stripCache = { w, h, canvas: off }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(stripCache.canvas, 0, 0)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const cx = tx(time.value)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke()
  params.forEach(([key, , color], i) => {
    const v = s[key]
    if (typeof v !== 'number') return
    const y0 = i * rowH
    ctx.fillStyle = color
    ctx.font = 'bold 10px Tahoma, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1), 4, y0 + rowH - 2)
  })
}

function loop(ts) {
  raf = requestAnimationFrame(loop)
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0
  lastTs = ts
  if (playing.value && fdr.value) {
    time.value += dt * speed.value
    if (time.value >= fdr.value.t_end) {
      time.value = fdr.value.t_end
      playing.value = false
      ended.value = true
      if (audio) audio._stopStall()
    }
  }
  renderFrame(dt)
}

watch(currentLine, async (i, prev) => {
  await nextTick()
  const el = cvrList.value?.children?.[i]
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: playing.value ? 'smooth' : 'auto' })
  const line = transcript.value[i]
  if (playing.value && audio && audio.enabled && voice.value && line && line.kind === 'cvr' && i === (prev ?? -1) + 1 && speed.value <= 2) audio.sayLine(line)
})
watch(replayId, (id) => {
  store.replayId = id
  loadFdr(id)
})
watch(() => store.replayId, (id) => {
  if (id && id !== replayId.value && props.index.byId[id]?.fdr) replayId.value = id
  else if (id === replayId.value && store.replayTime !== null) {
    seek(store.replayTime)
    store.replayTime = null
  }
})
watch(panel, () => renderFrame(2))

onMounted(() => {
  resizeObs = new ResizeObserver(() => {
    scene && scene.resize()
    stripCache = null
    renderFrame(2)
  })
  resizeObs.observe(rootRef.value)
  loadFdr(replayId.value)
  raf = requestAnimationFrame(loop)
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  if (store.sound) { audio = new ReplayAudio(); audio.enable(family()) }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(decodeTimer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  resizeObs && resizeObs.disconnect()
  scene && scene.dispose()
  scene = null
  if (audio) { audio.dispose(); audio = null }
})
function onKey(e) {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
  if (store.storyId) return
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  if (e.code === 'ArrowRight') seek(time.value + (e.shiftKey ? 10 : 1))
  if (e.code === 'ArrowLeft') seek(time.value - (e.shiftKey ? 10 : 1))
  if (e.key === 'c' || e.key === 'C') cycleCamera()
  if (e.key === 'm' || e.key === 'M') toggleSound()
  if (e.key === 'f' || e.key === 'F') toggleTheatre()
}
</script>

<style scoped>
.fr-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--bb-bg); }
.fr-root.theatre { position: fixed; z-index: 9999; }
.fr-toolbar { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--bb-line); background: var(--bb-panel); flex-wrap: wrap; }
.fr-toolbar select { max-width: 300px; }
.fr-speed, .fr-cams, .fr-fx { display: flex; gap: 2px; }
.fr-clock { margin-left: auto; font-size: 13px; }
.fr-fidelity { font-size: 10px; cursor: help; }
.fr-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 320px; }
.fr-left { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.fr-3d { position: relative; flex: 1; min-height: 0; background: #7fb2e8; overflow: hidden; }
.fr-scene { width: 100%; height: 100%; display: block; }
.fr-hud { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.fr-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 120px 40px rgba(255, 40, 40, 0.75); transition: opacity 0.12s; }
.fr-3d.warn .fr-vignette { box-shadow: inset 0 0 90px 30px rgba(255, 170, 40, 0.6); }
.fr-3d.danger .fr-vignette { box-shadow: inset 0 0 140px 50px rgba(255, 30, 30, 0.8); }
.fr-bars { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(#000 0, #000 9%, transparent 9%, transparent 91%, #000 91%); }
.fr-marker-toast { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 24, 0.85); color: var(--bb-accent); font-weight: 700; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--bb-accent); font-size: 12px; white-space: nowrap; max-width: 90%; overflow: hidden; text-overflow: ellipsis; z-index: 2; }
.cinematic .fr-marker-toast { top: auto; bottom: 12%; background: transparent; border: none; font-size: 15px; letter-spacing: 0.06em; text-shadow: 0 1px 4px #000; }
.fr-scene-hint { position: absolute; bottom: 6px; left: 8px; font-size: 10px; text-shadow: 0 1px 2px #000; }
.fr-env { position: absolute; top: 8px; right: 10px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; text-shadow: 0 1px 2px #000; }
.fr-ended { position: absolute; inset: 0; background: rgba(0,0,0,0.88); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; z-index: 3; animation: fr-fade 2.2s ease-out; }
.fr-ended-t { font-family: Consolas, monospace; font-size: 42px; color: #fff; letter-spacing: 0.08em; }
.fr-ended-l { font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--bb-accent); }
.fr-ended-s { font-size: 12px; color: #d3ddf0; margin-top: 10px; }
.fr-ended-h { font-size: 10px; margin-top: 14px; }
@keyframes fr-fade { from { opacity: 0; } to { opacity: 1; } }
.fr-decode { position: absolute; inset: 0; background: #04060c; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-family: Consolas, monospace; }
.fr-decode-title { color: var(--bb-accent); letter-spacing: 0.3em; font-size: 13px; animation: fr-blink 0.5s step-end infinite; }
.fr-decode-sub { color: var(--bb-muted); font-size: 11px; }
.fr-decode-hex { color: #3f6b4f; font-size: 10px; line-height: 1.5; margin: 10px 0 0; text-align: left; min-height: 150px; }
@keyframes fr-blink { 50% { opacity: 0.35; } }
.fr-scrub { position: relative; height: 22px; background: #070a12; cursor: pointer; border-top: 1px solid var(--bb-line); }
.fr-scrub-track { position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: #2a3550; }
.fr-scrub-marker { position: absolute; top: 4px; width: 2px; height: 14px; background: var(--bb-accent); opacity: 0.8; }
.fr-scrub-cvr { position: absolute; top: 15px; width: 1px; height: 5px; background: #4c8dff; }
.fr-scrub-head { position: absolute; top: 2px; width: 3px; height: 18px; background: #fff; margin-left: -1px; box-shadow: 0 0 4px #fff; }
.fr-strips { height: 150px; width: 100%; display: block; background: #0b0f18; border-top: 1px solid var(--bb-line); }
.theatre .fr-strips { height: 110px; }
.fr-right { display: flex; flex-direction: column; border-left: 1px solid var(--bb-line); min-height: 0; }
.fr-panel-tabs { display: flex; gap: 3px; align-items: center; padding: 4px 6px; border-bottom: 1px solid var(--bb-line); }
.fr-panel-hint { font-size: 9px; margin-left: 4px; }
.fr-pfd { width: 100%; height: 250px; display: block; flex: none; }
.fr-ctl { width: 100%; height: 118px; display: block; border-top: 1px solid var(--bb-line); border-bottom: 1px solid var(--bb-line); flex: none; }
.fr-cvr { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fr-cvr-head { padding: 4px 8px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bb-muted); display: flex; justify-content: space-between; gap: 6px; }
.fr-cvr-head .bb-muted { text-transform: none; letter-spacing: 0; }
.fr-cvr-list { flex: 1; overflow: auto; padding: 0 6px 20px; }
.fr-cvr-line { display: grid; grid-template-columns: 52px 44px 1fr; gap: 6px; padding: 3px 4px; border-radius: 3px; font-size: 11px; line-height: 1.35; cursor: pointer; opacity: 0.5; }
.fr-cvr-line.past { opacity: 0.85; }
.fr-cvr-line.current { opacity: 1; background: #1c2a45; box-shadow: inset 2px 0 0 var(--bb-accent); }
.fr-cvr-line.event { font-style: italic; color: #b8c6e3; }
.fr-cvr-t { color: var(--bb-muted); font-family: Consolas, monospace; font-size: 10px; }
.fr-cvr-spk { font-weight: 700; font-size: 10px; color: var(--bb-accent); }
.spk-pf, .spk-capt { color: #ff8a5c; }
.spk-pnf, .spk-pm, .spk-fo { color: #22e08a; }
.spk-atc { color: #4c8dff; }
.spk-sys { color: #c792ea; }
.fr-cvr-tr { color: var(--bb-muted); }
@media (max-width: 900px) {
  .fr-main { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .fr-right { border-left: none; border-top: 1px solid var(--bb-line); max-height: 45%; }
  .fr-pfd { height: 200px; }
}
</style>
