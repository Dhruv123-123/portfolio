<template>
  <div class="at-root">
    <canvas ref="canvasRef" class="at-canvas"></canvas>

    <!-- Year + playback -->
    <div class="at-year">
      <div class="at-year-num">{{ Math.min(Math.floor(year), yearMax - 1) }}</div>
      <div class="at-year-sub bb-muted">{{ cumulative.n.toLocaleString() }} accidents · {{ cumulative.f.toLocaleString() }} lives so far</div>
      <div class="at-year-ctl">
        <button class="bb-btn small" @click="togglePlay">{{ playing ? '❚❚' : '▶ play the century' }}</button>
        <button class="bb-btn small" @click="setYear(yearMin)" title="rewind">⟲</button>
        <button class="bb-btn small" @click="setYear(yearMax)" title="show everything">all</button>
        <span class="at-speed">
          <button v-for="s in [1, 3, 8]" :key="s" class="bb-btn small" :class="{ active: speed === s }" @click="speed = s">{{ s }}y/s</button>
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div class="at-filters">
      <input v-model="textFilter" class="bb-input" placeholder="filter: airline, type, country…" />
      <label><input type="checkbox" v-model="fatalOnly" /> fatal only</label>
      <label><input type="checkbox" v-model="preciseOnly" /> precise positions only</label>
      <div class="at-tiers">
        <span v-for="t in tierList" :key="t.id" class="bb-chip ghost" :class="{ on: tiers.has(t.id) }" @click="toggleTier(t.id)"><span class="at-dot" :style="{ background: t.color }"></span>{{ t.label }} {{ t.n.toLocaleString() }}</span>
      </div>
      <div class="bb-muted at-hint" v-if="catalog.state !== 'ready'">{{ catalog.state === 'loading' ? 'Loading the full catalog…' : catalog.state === 'error' ? 'Catalog failed: ' + catalog.error : 'Curated records only' }}</div>
      <div class="bb-muted at-hint" v-else>{{ items.length.toLocaleString() }} plotted · faint points sit at country level · drag to spin, wheel to zoom</div>
    </div>

    <!-- Hover tooltip -->
    <div v-if="hover" class="at-tip" :style="{ left: hover.x + 14 + 'px', top: hover.y + 14 + 'px' }">
      <div class="at-tip-title">{{ hover.rec.title }}</div>
      <div class="bb-muted">{{ hover.rec.date }} · {{ hover.rec.aircraft.type || '?' }} · {{ hover.rec.fatalities ?? '?' }} fatalities{{ hover.approx ? ' · approx. position' : '' }}</div>
    </div>

    <!-- Selected record card -->
    <div v-if="selected" class="at-card bb-scroll">
      <div class="at-card-head">
        <span class="bb-agency">{{ selected.agency }}</span>
        <span class="at-card-tier">{{ tierLabel(selected) }}</span>
        <button class="at-close" @click="clearSelection" title="close">×</button>
      </div>
      <h3>{{ selected.title }}</h3>
      <div class="bb-muted">{{ selected.date }} · {{ selected.aircraft.type || 'type unknown' }} · {{ selected.operator || '' }}</div>
      <div class="bb-muted">{{ selected.location?.name || selected.location?.country || 'location unknown' }} · {{ (selected.phase || 'unknown').replace(/_/g, ' ') }}</div>
      <div class="at-stats">
        <div><b>{{ selected.fatalities ?? '?' }}</b><span>fatalities</span></div>
        <div><b>{{ selected.occupants ?? '?' }}</b><span>on board</span></div>
        <div><b>{{ selected.factors.length }}</b><span>factors</span></div>
      </div>
      <p class="at-summary">{{ selected.summary }}</p>
      <div class="at-factors">
        <span v-for="f in selected.factors.slice(0, 8)" :key="f.id" class="bb-chip factor" :style="{ background: factorColor(f.id) }">{{ factorLabel(f.id) }}</span>
      </div>
      <div class="at-actions">
        <button class="bb-btn" @click="store.openGraph(selected.id)">Graph ▸</button>
        <button class="bb-btn" :disabled="!(selected.events && selected.events.length)" @click="store.openTimeline(selected.id)">Timeline ▸</button>
        <button class="bb-btn" :disabled="!selected.fdr" @click="store.openReplay(selected.id)">Replay ▸</button>
        <button class="bb-btn" :disabled="!(selected.events && selected.events.length)" @click="store.openStory(selected.id)">Story ▸</button>
      </div>
      <a :href="wikipediaUrl(selected)" target="_blank" rel="noopener" class="at-readmore">{{ hasWikipediaArticle(selected) ? 'Read more on Wikipedia ↗' : 'Search Wikipedia for this accident ↗' }}</a>
      <div class="bb-h" v-if="similar.length">Same mechanism elsewhere</div>
      <div v-for="s in similar" :key="s.id" class="at-similar" @click="select(s.id, true)">
        <span class="bb-agency">{{ index.byId[s.id].agency }}</span> {{ index.byId[s.id].title }} <span class="bb-muted">· {{ index.byId[s.id].date.slice(0, 4) }} · {{ s.shared }} shared</span>
      </div>
    </div>

    <!-- Century histogram + scrubber -->
    <div class="at-strip">
      <canvas ref="histRef" class="at-hist" @mousemove="histHover" @mouseleave="histYear = null" @click="histClick"></canvas>
      <div v-if="histYear" class="at-hist-tip" :style="{ left: histYear.x + 'px' }">{{ histYear.y }} · {{ histYear.n }} accidents · {{ histYear.f.toLocaleString() }} fatalities</div>
      <input type="range" class="at-range" :min="yearMin" :max="yearMax" step="0.05" :value="year" @input="setYear(+$event.target.value)" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { Globe } from './lib/globe.js'
import { recordPosition, wikipediaUrl, hasWikipediaArticle } from './lib/geo.js'
import { similarRecords } from './lib/search.js'
import { loadCatalogRecord } from './lib/catalog.js'

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

const TIER_COLORS = { curated: '#ffbf00', deep: '#ffd97a', wikidata: '#8fb3ff', ntsb: '#5f7396' }
function tierOf(rec) {
  if (!rec.tier) return 'curated'
  if (rec.tier === 'ntsb') return 'ntsb'
  return rec.depth && rec.depth !== 'summary' ? 'deep' : 'wikidata'
}
function tierLabel(rec) {
  return { curated: 'curated · full report', deep: 'official report read', wikidata: 'Wikipedia summary', ntsb: 'NTSB database' }[tierOf(rec)]
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
    { id: 'curated', label: 'curated', color: TIER_COLORS.curated, n: n.curated },
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
    setYear(year.value + dt * speed.value)
    if (year.value >= yearMax.value) togglePlay()
  }, 40)
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
watch(selected, updateArcs)
watch(() => props.active, async (a) => {
  if (a) {
    await nextTick()
    globe && globe.resize()
    globe && globe.start()
    if (props.catalog.state === 'idle') emit('load-catalog')
    drawHist()
  } else {
    globe && globe.stop()
    if (playing.value) togglePlay()
  }
})
watch(() => props.index, () => { year.value = Math.max(year.value, yearMax.value); pushItems() })
watch(() => store.atlasPlayRequest, () => { if (!playing.value) { year.value = yearMin.value; togglePlay() } })

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
  if (props.active) {
    globe.start()
    if (props.catalog.state === 'idle') emit('load-catalog')
  }
})
onBeforeUnmount(() => {
  clearInterval(playTimer)
  resizeObs && resizeObs.disconnect()
  globe && globe.dispose()
  globe = null
})
</script>

<style scoped>
.at-root { position: absolute; inset: 0; overflow: hidden; background: #05070d; }
.at-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: grab; }
.at-year { position: absolute; top: 12px; right: 14px; text-align: right; pointer-events: none; }
.at-year > * { pointer-events: auto; }
.at-year-num { font-family: Consolas, 'Courier New', monospace; font-size: 54px; font-weight: 700; line-height: 1; color: #fff; text-shadow: 0 0 18px rgba(255,191,0,0.55), 0 0 2px #000; letter-spacing: 0.04em; }
.at-year-sub { font-size: 11px; margin-top: 2px; text-shadow: 0 1px 2px #000; }
.at-year-ctl { display: flex; gap: 4px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap; }
.at-speed { display: flex; gap: 2px; }
.at-filters { position: absolute; top: 12px; left: 12px; width: 250px; display: flex; flex-direction: column; gap: 6px; font-size: 10px; color: var(--bb-muted); background: rgba(8,12,24,0.7); border: 1px solid var(--bb-line); border-radius: 4px; padding: 8px; backdrop-filter: blur(4px); }
.at-filters label { display: flex; gap: 4px; align-items: center; }
.at-tiers { display: flex; flex-wrap: wrap; gap: 4px; }
.at-tiers .bb-chip { opacity: 0.45; }
.at-tiers .bb-chip.on { opacity: 1; border-color: #3a4a6a; }
.at-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.at-hint { line-height: 1.35; }
.at-tip { position: absolute; pointer-events: none; background: rgba(8,12,24,0.95); border: 1px solid var(--bb-line); padding: 6px 8px; border-radius: 4px; font-size: 11px; max-width: 260px; z-index: 3; }
.at-tip-title { font-weight: 700; }
.at-card { position: absolute; right: 14px; top: 130px; bottom: 80px; width: 300px; background: rgba(10,15,28,0.88); border: 1px solid var(--bb-line); border-radius: 6px; padding: 10px 12px; overflow: auto; backdrop-filter: blur(6px); box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
.at-card h3 { margin: 4px 0; font-size: 15px; }
.at-card-head { display: flex; gap: 6px; align-items: center; }
.at-card-tier { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bb-accent); flex: 1; }
.at-close { background: none; border: none; color: var(--bb-muted); font-size: 16px; cursor: pointer; }
.at-close:hover { color: #fff; }
.at-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 8px 0; }
.at-stats div { background: var(--bb-panel-2); border: 1px solid var(--bb-line); border-radius: 4px; padding: 5px 4px; text-align: center; display: flex; flex-direction: column; }
.at-stats b { font-size: 15px; }
.at-stats span { font-size: 9px; color: var(--bb-muted); }
.at-summary { line-height: 1.45; margin: 4px 0; color: #d3ddf0; font-size: 11px; }
.at-factors { display: flex; flex-wrap: wrap; gap: 3px; margin: 6px 0; }
.at-actions { display: flex; gap: 4px; flex-wrap: wrap; margin: 8px 0 6px; }
.at-readmore { display: inline-block; color: var(--bb-accent); font-weight: 700; text-decoration: none; border: 1px solid var(--bb-accent); border-radius: 3px; padding: 4px 8px; font-size: 11px; }
.at-readmore:hover { background: var(--bb-accent); color: #111; }
.at-similar { cursor: pointer; padding: 3px 0; border-bottom: 1px dashed var(--bb-line); font-size: 11px; }
.at-similar:hover { color: var(--bb-accent); }
.at-strip { position: absolute; left: 12px; right: 12px; bottom: 8px; height: 62px; }
.at-hist { width: 100%; height: 46px; display: block; cursor: pointer; }
.at-hist-tip { position: absolute; top: -22px; transform: translateX(-50%); background: rgba(8,12,24,0.95); border: 1px solid var(--bb-line); padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap; pointer-events: none; }
.at-range { width: 100%; margin: 0; height: 14px; accent-color: #ffbf00; }
@media (max-width: 900px) {
  .at-filters { width: 200px; }
  .at-card { left: 12px; right: 12px; width: auto; top: auto; bottom: 80px; max-height: 45%; }
  .at-year-num { font-size: 36px; }
}
</style>
