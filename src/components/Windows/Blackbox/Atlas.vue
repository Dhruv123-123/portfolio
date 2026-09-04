<template>
  <div class="at-root" :class="{ 'at-requiem': requiem }">
    <canvas ref="canvasRef" class="at-canvas"></canvas>

    <!-- Filters -->
    <div class="at-filters bb-card floating">
      <div class="bb-field">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
        <input v-model="textFilter" class="bb-input" placeholder="Airline, type, country…" />
      </div>
      <div class="at-checks">
        <label class="bb-check"><input type="checkbox" v-model="fatalOnly" /> Fatal only</label>
        <label class="bb-check"><input type="checkbox" v-model="preciseOnly" /> Precise positions</label>
      </div>
      <div class="at-tiers">
        <span v-for="t in tierList" :key="t.id" class="bb-chip" :class="{ on: tiers.has(t.id) }" @click="toggleTier(t.id)"><span class="at-dot" :style="{ background: t.color }"></span>{{ t.label }} <span class="bb-muted bb-num">{{ t.n.toLocaleString() }}</span></span>
      </div>
      <div v-if="onThisDay.length" class="at-today">
        <button class="at-today-h" @click="todayOpen = !todayOpen">On this day <span class="bb-muted bb-num">{{ onThisDay.length }}</span><span class="at-caret">{{ todayOpen ? '▾' : '▸' }}</span></button>
        <div v-if="todayOpen" class="at-today-list bb-scroll">
          <div v-for="r in onThisDay" :key="r.id" class="at-today-item" @click="select(r.id, true)"><span class="at-today-year bb-num">{{ r.date.slice(0, 4) }}</span> {{ r.title }}</div>
        </div>
      </div>
      <div class="bb-muted at-hint" v-if="catalog.state !== 'ready'">{{ catalog.state === 'loading' ? 'Loading the full catalog…' : catalog.state === 'error' ? 'Catalog failed: ' + catalog.error : 'Reviewed records only' }}</div>
      <div class="bb-muted at-hint" v-else><span class="bb-num">{{ items.length.toLocaleString() }}</span> plotted · faint points sit at country level</div>
    </div>

    <!-- Year + playback -->
    <div class="at-year">
      <div class="at-year-num bb-num">{{ Math.min(Math.floor(year), yearMax - 1) }}</div>
      <div class="at-year-sub bb-muted"><span class="bb-num">{{ cumulative.n.toLocaleString() }}</span> accidents · <span class="bb-num">{{ cumulative.f.toLocaleString() }}</span> lives so far</div>
      <div class="at-year-ctl">
        <button class="bb-btn small primary at-play" @click="togglePlay" :title="playing ? 'pause' : 'play the century'">
          <svg v-if="!playing" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z"></path></svg>
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>
          {{ playing ? 'Pause' : 'Play the century' }}
        </button>
        <button class="bb-btn small icon" @click="setYear(yearMin)" title="rewind to the first record"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg></button>
        <button class="bb-btn small icon" @click="setYear(yearMax)" title="show everything"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 7-7 7M13 5l7 7-7 7"></path></svg></button>
        <span class="bb-seg small" role="group" aria-label="speed">
          <button v-for="s in [1, 3, 8]" :key="s" :class="{ active: speed === s }" @click="speed = s">{{ s }}y/s</button>
        </span>
        <button class="bb-btn small icon" :class="{ active: store.sound }" @click="store.sound = !store.sound" title="a blip for every accident as the century plays">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"></path><path v-if="store.sound" d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"></path></svg>
        </button>
        <button class="bb-btn small at-requiem-btn" @click="startRequiem" title="Requiem: the century plays itself as a memorial, with a drone and a camera that visits each major accident (esc to leave)">Requiem</button>
      </div>
    </div>

    <div v-if="requiem" class="at-requiem-ui" @click.stop>
      <button class="bb-btn small" @click="stopRequiem">Leave requiem · esc</button>
      <button class="bb-btn small" :class="{ active: rollCall }" @click="rollCall = !rollCall" title="read each name aloud as it appears">Roll call</button>
    </div>
    <transition name="at-cap">
      <div v-if="requiem && caption" :key="caption.id" class="at-caption">
        <div class="at-caption-year bb-num">{{ caption.year }}</div>
        <div class="at-caption-title">{{ caption.title }}</div>
        <div class="at-caption-sub">{{ caption.sub }}</div>
      </div>
    </transition>
    <div v-if="selected && sunNote && !requiem" class="at-sunnote bb-muted">{{ sunNote }}</div>
    <div class="at-scene-hint bb-faint" v-if="!requiem">drag to spin · wheel to zoom</div>

    <!-- Hover tooltip -->
    <div v-if="hover" class="bb-tip" :style="{ left: hover.x + 14 + 'px', top: hover.y + 14 + 'px' }">
      <b>{{ hover.rec.title }}</b>
      <div class="bb-muted">{{ hover.rec.date }} · {{ hover.rec.aircraft.type || '?' }} · {{ hover.rec.fatalities ?? '?' }} fatalities{{ hover.approx ? ' · approx. position' : '' }}</div>
    </div>

    <!-- Selected record card -->
    <div v-if="selected" class="at-card bb-card floating bb-scroll">
      <div class="at-card-head">
        <span class="bb-agency">{{ selected.agency }}</span>
        <span class="bb-tag" :class="{ accent: !selected.tier }">{{ tierLabel(selected) }}</span>
        <span v-if="selected.fdr" class="bb-tag">Replay</span>
        <button class="at-close" @click="clearSelection" title="close">×</button>
      </div>
      <h3 class="bb-title">{{ selected.title }}</h3>
      <div class="bb-meta">{{ selected.date }} · {{ selected.aircraft.type || 'type unknown' }} · {{ selected.operator || '' }}</div>
      <div class="bb-meta">{{ selected.location?.name || selected.location?.country || 'location unknown' }} · {{ (selected.phase || 'unknown').replace(/_/g, ' ') }}</div>
      <div class="bb-stats">
        <div class="bb-stat"><b>{{ selected.fatalities ?? '?' }}</b><span>fatalities</span></div>
        <div class="bb-stat"><b>{{ selected.occupants ?? '?' }}</b><span>on board</span></div>
        <div class="bb-stat"><b>{{ selected.factors.length }}</b><span>factors</span></div>
      </div>
      <RecordActions :record="selected" :index="index" current="atlas" show-graph />
      <p class="bb-prose at-summary">{{ selected.summary }}</p>
      <div class="bb-chipwrap at-factors">
        <span v-for="f in selected.factors.slice(0, 8)" :key="f.id" class="bb-chip factor" :style="{ '--c': factorColor(f.id) }">{{ factorLabel(f.id) }}</span>
      </div>
      <div v-if="selected.audio && selected.audio.length" class="at-listen bb-link" @click="selected.fdr ? store.openReplay(selected.id) : store.openTimeline(selected.id)">{{ selected.audio.length }} real recording{{ selected.audio.length > 1 ? 's' : '' }} · {{ selected.fdr ? 'play in sync with the replay' : 'listen on the timeline' }}</div>
      <div class="bb-h" v-if="similar.length">Same mechanism elsewhere</div>
      <div v-for="s in similar" :key="s.id" class="at-similar" @click="select(s.id, true)">
        <span class="at-similar-title">{{ index.byId[s.id].title }}</span><span class="bb-muted">{{ index.byId[s.id].date.slice(0, 4) }} · {{ s.shared }} shared</span>
      </div>
    </div>

    <!-- Century histogram + scrubber -->
    <div class="at-strip">
      <canvas ref="histRef" class="at-hist" @mousemove="histHover" @mouseleave="histYear = null" @click="histClick"></canvas>
      <div v-if="histYear" class="at-hist-tip bb-num" :style="{ left: histYear.x + 'px' }">{{ histYear.y }} · {{ histYear.n }} accidents · {{ histYear.f.toLocaleString() }} fatalities</div>
      <input type="range" class="at-range" :min="yearMin" :max="yearMax" step="0.05" :value="year" @input="setYear(+$event.target.value)" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { Globe } from './lib/globe.js'
import { recordPosition } from './lib/geo.js'
import RecordActions from './RecordActions.vue'
import { similarRecords } from './lib/search.js'
import { loadCatalogRecord } from './lib/catalog.js'
import { note, drone } from './lib/synth.js'

const props = defineProps({ graph: Object, index: Object, active: Boolean, catalog: { type: Object, default: () => ({ state: 'idle', count: 0 }) } })
const emit = defineEmits(['load-catalog'])
const store = useBlackboxStore()

const canvasRef = ref(null)
const histRef = ref(null)
let globe = null
let resizeObs = null
let playTimer = null
let lastTick = 0

const textFilter = ref('')
const fatalOnly = ref(false)
const preciseOnly = ref(false)
const tiers = ref(new Set(['curated', 'deep', 'wikidata', 'ntsb']))
const playing = ref(false)
const speed = ref(3)
const hover = ref(null)
const histYear = ref(null)
const version = ref(0)
const todayOpen = ref(false)
const onThisDay = computed(() => {
  const d = new Date()
  const md = `-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return props.index.records.filter((r) => r.date && r.date.slice(4) === md && recordPosition(r)).sort((a, b) => (b.fatalities || 0) - (a.fatalities || 0)).slice(0, 40)
})

const TIER_COLORS = { curated: '#ffbf00', deep: '#ffd97a', wikidata: '#8fb3ff', ntsb: '#5f7396' }
function tierOf(rec) {
  if (!rec.tier) return 'curated'
  if (rec.tier === 'ntsb') return 'ntsb'
  return rec.depth && rec.depth !== 'summary' ? 'deep' : 'wikidata'
}
function tierLabel(rec) {
  return { curated: 'reviewed · full report', deep: 'official report read', wikidata: 'Wikipedia summary', ntsb: 'NTSB database' }[tierOf(rec)]
}

const positioned = computed(() => {
  const out = []
  for (const rec of props.index.records) {
    const p = recordPosition(rec)
    if (!p) continue
    const y = parseInt(rec.date.slice(0, 4), 10)
    if (!y) continue
    out.push({ rec, p, y, tier: tierOf(rec) })
  }
  return out
})
const yearMin = computed(() => Math.max(1900, Math.min(...positioned.value.map((x) => x.y))))
const yearMax = computed(() => Math.max(...positioned.value.map((x) => x.y)) + 1)
const year = ref(2100)

const tierList = computed(() => {
  const n = { curated: 0, deep: 0, wikidata: 0, ntsb: 0 }
  for (const x of positioned.value) n[x.tier]++
  return [
    { id: 'curated', label: 'reviewed', color: TIER_COLORS.curated, n: n.curated },
    { id: 'deep', label: 'report read', color: TIER_COLORS.deep, n: n.deep },
    { id: 'wikidata', label: 'Wikipedia', color: TIER_COLORS.wikidata, n: n.wikidata },
    { id: 'ntsb', label: 'NTSB db', color: TIER_COLORS.ntsb, n: n.ntsb }
  ]
})

const items = computed(() => {
  const f = textFilter.value.trim().toLowerCase()
  const out = []
  for (const x of positioned.value) {
    const rec = x.rec
    if (!tiers.value.has(x.tier)) continue
    if (fatalOnly.value && !(rec.fatalities > 0)) continue
    if (preciseOnly.value && x.p.approx) continue
    if (f && !`${rec.title} ${rec.operator} ${rec.aircraft.type} ${rec.location?.country || ''} ${rec.location?.name || ''} ${rec.agency}`.toLowerCase().includes(f)) continue
    const fat = rec.fatalities || 0
    const k = Math.min(1, Math.log10(1 + fat) / 2.7)
    const color = fat > 0 ? [1, 0.78 - 0.55 * k, 0.05 + 0.15 * k] : [0.3, 0.55, 1]
    const size = (x.tier === 'curated' || x.tier === 'deep' ? 3.2 : 2.0) + Math.min(9, Math.sqrt(fat) * 0.5)
    out.push({ id: rec.id, lat: x.p.lat, lon: x.p.lon, year: x.y + monthFraction(rec.date), size, color, approx: x.p.approx, fat })
  }
  return out
})
function monthFraction(date) {
  const m = parseInt(date.slice(5, 7), 10) || 1
  const d = parseInt(date.slice(8, 10), 10) || 1
  return ((m - 1) * 30.4 + d) / 366
}

const cumulative = computed(() => {
  let n = 0
  let f = 0
  for (const it of items.value) if (it.year <= year.value) { n++; f += it.fat }
  return { n, f }
})

const selected = computed(() => {
  void version.value
  return store.selectedId ? props.index.byId[store.selectedId] : null
})
const similar = computed(() => (selected.value ? similarRecords(props.index, selected.value.id, 6) : []))
const factorColor = (id) => props.graph.taxonomy.categories[props.index.factorById[id]?.category]?.color || '#888'
const factorLabel = (id) => props.index.factorById[id]?.label || id

function toggleTier(id) {
  const s = new Set(tiers.value)
  s.has(id) ? s.delete(id) : s.add(id)
  tiers.value = s
}

function setYear(y) {
  year.value = Math.max(yearMin.value, Math.min(yearMax.value, y))
  globe && globe.setYear(year.value)
  drawHist()
}
function togglePlay() {
  if (playing.value) {
    playing.value = false
    clearInterval(playTimer)
    return
  }
  if (year.value >= yearMax.value - 0.1) year.value = yearMin.value
  playing.value = true
  lastTick = performance.now()
  playTimer = setInterval(() => {
    const now = performance.now()
    const dt = (now - lastTick) / 1000
    lastTick = now
    const before = year.value
    setYear(year.value + dt * speed.value)
    if (store.sound || requiem.value) blipsBetween(before, year.value)
    if (year.value >= yearMax.value) {
      togglePlay()
      if (requiem.value) setTimeout(stopRequiem, 6000)
    }
  }, 40)
}

// Sound and requiem: a soft note for each accident that appears while the century plays
const requiem = ref(false)
const rollCall = ref(false)
const caption = ref(null)
const sunNote = ref('')
let droneCtl = null
let lastFly = 0
let captionTimer = null
const DRONE_ROOTS = [55, 49, 65.4, 58.3, 73.4, 61.7]

function blipsBetween(y0, y1) {
  let n = 0
  let major = null
  for (const it of items.value) {
    if (it.year <= y0 || it.year > y1) continue
    if (++n <= 10) {
      const f = it.fat > 0 ? 160 + Math.min(600, it.fat) * 0.6 : 880
      note(f, { dur: it.fat > 0 ? 0.45 : 0.14, gain: it.fat > 100 ? 0.11 : 0.045, type: it.fat > 0 ? 'triangle' : 'sine', delay: Math.random() * 0.05 })
    }
    if (requiem.value && (it.fat >= 100 || props.index.byId[it.id]?.tier === undefined) && (!major || it.fat > major.fat)) major = it
  }
  if (requiem.value && major) showMajor(major)
  if (requiem.value && droneCtl) droneCtl.setRoot(DRONE_ROOTS[Math.floor(y1 / 10) % DRONE_ROOTS.length])
}

function showMajor(it) {
  const rec = props.index.byId[it.id]
  if (!rec) return
  if (rollCall.value && typeof speechSynthesis !== 'undefined') {
    const u = new SpeechSynthesisUtterance(`${rec.date.slice(0, 4)}. ${rec.title}.`)
    u.rate = 0.85
    u.pitch = 0.8
    u.volume = 0.8
    speechSynthesis.speak(u)
  }
  caption.value = { id: it.id, year: rec.date.slice(0, 4), title: rec.title, sub: `${rec.aircraft?.type || ''}${rec.location?.country ? ' · ' + rec.location.country : ''} · ${rec.fatalities ?? '?'} lives` }
  clearTimeout(captionTimer)
  captionTimer = setTimeout(() => (caption.value = null), 4200)
  const now = performance.now()
  if (globe && now - lastFly > 2600) {
    lastFly = now
    globe.setSelected(it.id, true)
  }
}

function startRequiem() {
  if (requiem.value) return
  requiem.value = true
  store.sound = true
  droneCtl = drone(55)
  droneCtl.setLevel(0.7)
  speed.value = 2
  year.value = yearMin.value
  if (!playing.value) togglePlay()
  if (globe) { globe.controls.autoRotate = true; globe.controls.autoRotateSpeed = 0.15; globe.setSun(null) }
}
function stopRequiem() {
  if (!requiem.value) return
  requiem.value = false
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  caption.value = null
  clearTimeout(captionTimer)
  if (droneCtl) { droneCtl.stop(); droneCtl = null }
  if (playing.value) togglePlay()
  if (globe) { globe.controls.autoRotateSpeed = 0.35; globe.setSelected(store.selectedId, false) }
}
function onKey(e) {
  if (e.key === 'Escape' && requiem.value) { e.preventDefault(); stopRequiem() }
}

/** Sub-solar point for the record's t0 (or noon UTC on its date): where the sun stood at that moment. */
function subsolar(rec) {
  const iso = rec.t0 || (rec.date ? rec.date + 'T12:00:00Z' : null)
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  const doy = Math.floor((d.getTime() - start) / 86400000) + 1
  const decl = 23.44 * Math.sin((2 * Math.PI * (doy - 81)) / 365)
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60
  let lon = (12 - hours) * 15
  lon = ((lon + 540) % 360) - 180
  return { lat: decl, lon, exact: !!rec.t0, time: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` }
}
function applySun() {
  if (!globe) return
  const rec = selected.value
  const sp = rec ? subsolar(rec) : null
  if (sp) {
    globe.setSun(sp.lat, sp.lon)
    sunNote.value = sp.exact ? `The globe is lit as the sun stood at ${sp.time} on ${rec.date}` : `The globe is lit as the sun stood at noon UTC on ${rec.date}`
  } else {
    globe.setSun(null)
    sunNote.value = ''
  }
}

async function select(id, fly = false) {
  store.selectedId = id
  globe && globe.setSelected(id, fly)
  const rec = props.index.byId[id]
  if (rec && rec.stub) {
    const full = await loadCatalogRecord(id, rec.date)
    if (full) {
      Object.assign(rec, full, { stub: false })
      version.value++
    }
  }
  updateArcs()
}
function clearSelection() {
  store.selectedId = null
  globe && globe.setSun(null)
  sunNote.value = ''
  globe && globe.setSelected(null)
  globe && globe.setArcs([])
}
function updateArcs() {
  if (!globe || !selected.value) return
  const a = recordPosition(selected.value)
  if (!a) return globe.setArcs([])
  const arcs = []
  for (const s of similar.value) {
    const b = recordPosition(props.index.byId[s.id])
    if (b) arcs.push([a.lat, a.lon, b.lat, b.lon, 0xffbf00])
  }
  globe.setArcs(arcs)
}

function drawHist() {
  const cv = histRef.value
  if (!cv) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const r = cv.getBoundingClientRect()
  const w = Math.max(1, Math.floor(r.width))
  const h = Math.max(1, Math.floor(r.height))
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const y0 = yearMin.value
  const y1 = yearMax.value
  const bins = {}
  let max = 1
  for (const it of items.value) {
    const y = Math.floor(it.year)
    const b = bins[y] || (bins[y] = { n: 0, f: 0 })
    b.n++
    b.f += it.fat
    max = Math.max(max, b.n)
  }
  const bw = w / (y1 - y0)
  for (const [y, b] of Object.entries(bins)) {
    const x = (y - y0) * bw
    const bh = Math.max(1, (Math.log(1 + b.n) / Math.log(1 + max)) * (h - 14))
    const past = +y < year.value
    ctx.fillStyle = past ? (b.f > 0 ? 'rgba(255,170,60,0.85)' : 'rgba(76,141,255,0.8)') : 'rgba(80,95,130,0.35)'
    ctx.fillRect(x, h - 12 - bh, Math.max(1, bw - 0.6), bh)
  }
  ctx.fillStyle = '#566a92'
  ctx.font = '9px Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) ctx.fillText(String(y), (y - y0) * bw, h)
  const cx = (year.value - y0) * bw
  ctx.strokeStyle = '#fff'
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h - 12); ctx.stroke()
  cv._bins = bins
}
function histHover(e) {
  const cv = histRef.value
  const r = cv.getBoundingClientRect()
  const y = Math.floor(yearMin.value + ((e.clientX - r.left) / r.width) * (yearMax.value - yearMin.value))
  const b = (cv._bins || {})[y] || { n: 0, f: 0 }
  histYear.value = { x: e.clientX - r.left, y, n: b.n, f: b.f }
}
function histClick(e) {
  const r = histRef.value.getBoundingClientRect()
  setYear(yearMin.value + ((e.clientX - r.left) / r.width) * (yearMax.value - yearMin.value) + 0.999)
}

function pushItems() {
  if (!globe) return
  globe.setRecords(items.value)
  globe.setYear(year.value)
  drawHist()
}

watch(items, pushItems)
watch(() => store.selectedId, (id) => {
  if (!globe) return
  globe.setSelected(id, true)
  updateArcs()
})
watch(selected, () => { updateArcs(); applySun() })
watch(() => props.active, async (a) => {
  if (a) {
    await nextTick()
    globe && globe.resize()
    globe && globe.start()
    if (props.catalog.state === 'idle') emit('load-catalog')
    drawHist()
  } else {
    stopRequiem()
    globe && globe.stop()
    if (playing.value) togglePlay()
  }
})
watch(() => props.index, () => { year.value = Math.max(year.value, yearMax.value); pushItems() })
watch(() => store.atlasPlayRequest, () => { if (!playing.value) { year.value = yearMin.value; togglePlay() } })
watch(() => store.atlasRequiemRequest, () => nextTick(startRequiem))

onMounted(() => {
  year.value = yearMax.value
  globe = new Globe(canvasRef.value, {
    onHover: (it, p) => {
      if (!it) { hover.value = null; return }
      hover.value = { rec: props.index.byId[it.id], x: p.x, y: p.y, approx: it.approx }
    },
    onClick: (it) => (it ? select(it.id, false) : clearSelection())
  })
  resizeObs = new ResizeObserver(() => { globe && globe.resize(); drawHist() })
  resizeObs.observe(canvasRef.value.parentElement)
  globe.resize()
  pushItems()
  if (store.selectedId) globe.setSelected(store.selectedId, true)
  applySun()
  window.addEventListener('keydown', onKey)
  if (props.active) {
    globe.start()
    if (props.catalog.state === 'idle') emit('load-catalog')
  }
})
onBeforeUnmount(() => {
  clearInterval(playTimer)
  window.removeEventListener('keydown', onKey)
  stopRequiem()
  resizeObs && resizeObs.disconnect()
  globe && globe.dispose()
  globe = null
})
</script>

<style scoped>
.at-root { position: absolute; inset: 0; overflow: hidden; background: #070a10; }
.at-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
.at-filters { position: absolute; top: 12px; left: 12px; width: 264px; display: flex; flex-direction: column; gap: 8px; font-size: 11px; color: var(--bb-muted); z-index: 2; }
.at-checks { display: flex; gap: 14px; }
.at-tiers { display: flex; flex-wrap: wrap; gap: 4px; }
.at-tiers .bb-chip { opacity: 0.5; }
.at-tiers .bb-chip.on { opacity: 1; }
.at-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.at-hint { line-height: 1.4; font-size: 10.5px; }
.at-today { border-top: 1px solid var(--bb-line); padding-top: 6px; }
.at-today-h { display: flex; align-items: center; gap: 6px; width: 100%; background: none; border: none; color: var(--bb-text-2); font: inherit; font-size: 11px; cursor: pointer; padding: 0; }
.at-today-h:hover { color: var(--bb-text); }
.at-caret { margin-left: auto; color: var(--bb-muted); }
.at-today-list { max-height: 140px; overflow: auto; margin-top: 4px; }
.at-today-item { cursor: pointer; padding: 2px 0; font-size: 11px; color: var(--bb-text-2); }
.at-today-item:hover { color: var(--bb-accent); }
.at-today-year { color: var(--bb-muted); margin-right: 4px; }

.at-year { position: absolute; top: 12px; right: 14px; text-align: right; pointer-events: none; z-index: 2; }
.at-year > * { pointer-events: auto; }
.at-year-num { font-size: 40px; font-weight: 600; line-height: 1; color: var(--bb-text); letter-spacing: 0.02em; text-shadow: 0 1px 2px #000; }
.at-year-sub { font-size: 11px; margin-top: 4px; text-shadow: 0 1px 2px #000; }
.at-year-ctl { display: flex; gap: 6px; justify-content: flex-end; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.at-year-ctl .bb-btn:not(.primary), .at-year-ctl .bb-seg { background: rgba(19, 23, 30, 0.85); backdrop-filter: blur(6px); }

.at-card { position: absolute; right: 14px; top: 112px; bottom: 84px; width: 320px; overflow: auto; z-index: 2; }
.at-card-head { display: flex; gap: 5px; align-items: center; margin-bottom: 6px; }
.at-close { margin-left: auto; background: none; border: none; color: var(--bb-muted); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
.at-close:hover { color: var(--bb-text); }
.at-summary { font-size: 11.5px; margin: 10px 0 6px; }
.at-factors { margin: 6px 0; }
.at-listen { font-size: 11px; margin: 6px 0; display: block; }
.at-similar { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; padding: 5px 0; border-bottom: 1px solid var(--bb-line); font-size: 11.5px; }
.at-similar-title { flex: 1; min-width: 0; }
.at-similar .bb-muted { white-space: nowrap; font-size: 10.5px; }
.at-similar:hover .at-similar-title { color: var(--bb-accent); }

.at-strip { position: absolute; left: 12px; right: 12px; bottom: 8px; height: 66px; z-index: 2; }
.at-hist { width: 100%; height: 46px; display: block; cursor: pointer; }
.at-hist-tip { position: absolute; top: -24px; transform: translateX(-50%); background: var(--bb-panel-2); border: 1px solid var(--bb-line-2); padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap; pointer-events: none; }
.at-range { width: 100%; margin: 4px 0 0; height: 14px; }
.at-scene-hint { position: absolute; left: 14px; bottom: 80px; font-size: 10.5px; text-shadow: 0 1px 2px #000; }
.at-sunnote { position: absolute; left: 14px; bottom: 96px; font-size: 10.5px; font-style: italic; max-width: 280px; text-shadow: 0 1px 2px #000; }
/* Requiem: the interface fades away and the century plays itself */
.at-requiem .at-filters, .at-requiem .at-card, .at-requiem .at-strip, .at-requiem .at-year-ctl, .at-requiem .bb-tip, .at-requiem .at-scene-hint { opacity: 0; pointer-events: none; transition: opacity 1.2s; }
.at-requiem .at-year-num { font-size: 84px; text-shadow: 0 0 40px rgba(242,183,5,0.4); transition: font-size 1.2s; }
.at-requiem .at-year-sub { font-size: 12px; }
.at-requiem-ui { position: absolute; top: 12px; left: 12px; z-index: 3; opacity: 0.7; display: flex; gap: 6px; }
.at-requiem-ui:hover { opacity: 1; }
.at-caption { position: absolute; left: 50%; bottom: 14%; transform: translateX(-50%); text-align: center; pointer-events: none; z-index: 3; }
.at-caption-year { font-size: 12px; letter-spacing: 0.4em; color: var(--bb-accent); }
.at-caption-title { font-size: clamp(20px, 3.2vw, 34px); font-weight: 600; color: #fff; text-shadow: 0 2px 20px rgba(0,0,0,0.9); margin: 4px 0; }
.at-caption-sub { font-size: 12px; color: var(--bb-text-2); letter-spacing: 0.06em; }
.at-cap-enter-active { transition: opacity 1.2s, transform 1.2s; }
.at-cap-leave-active { transition: opacity 2s; }
.at-cap-enter-from { opacity: 0; transform: translateX(-50%) translateY(14px); }
.at-cap-leave-to { opacity: 0; }
@media (max-width: 900px) {
  .at-filters { width: 210px; }
  .at-card { left: 12px; right: 12px; width: auto; top: auto; bottom: 84px; max-height: 45%; }
  .at-year-num { font-size: 32px; }
}
</style>
