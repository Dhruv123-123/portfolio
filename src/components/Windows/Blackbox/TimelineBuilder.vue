<template>
  <div class="tl-root">
    <div class="tl-list bb-rail">
      <div class="tl-filter">
        <div class="bb-field">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input v-model="filter" class="bb-input" placeholder="Filter accidents…" />
        </div>
        <div class="bb-muted tl-count" v-if="filteredTotal > 400">showing up to 400 of {{ filteredTotal.toLocaleString() }} · type to filter</div>
      </div>
      <div class="tl-list-scroll bb-scroll">
        <div v-for="r in filtered" :key="r.id" class="bb-list-row tl-item" :class="{ active: r.id === store.selectedId, compare: r.id === store.compareId }" @click="pick(r.id)">
          <span class="bb-agency">{{ r.agency }}</span>
          <span class="tl-item-title">{{ r.title }}</span>
          <span v-if="r.fdr" class="tl-mark" title="FDR replay available">▶</span>
          <span v-if="r.dissent && r.dissent.length" class="tl-mark warn" title="agency dissent">≠</span>
          <span class="bb-muted bb-num">{{ r.date.slice(0, 4) }}</span>
        </div>
      </div>
    </div>

    <div class="tl-main" v-if="rec">
      <div class="tl-head">
        <div class="tl-head-main">
          <div class="tl-head-tags">
            <span class="bb-agency">{{ rec.agency }}</span>
            <span v-if="rec.tier" class="bb-tag">{{ rec.tier === 'ntsb' ? 'NTSB database' : 'Wikidata' }} · {{ rec.depth }}</span>
            <span v-else class="bb-tag accent">Reviewed · full report</span>
          </div>
          <h3 class="bb-title">{{ rec.title }}</h3>
          <div class="bb-meta">{{ rec.date }} · {{ rec.aircraft.type }} · {{ rec.operator }} · {{ rec.route?.from_name || rec.route?.from || '' }} → {{ rec.route?.to_name || rec.route?.to || '' }} · {{ rec.fatalities ?? '?' }} fatalities</div>
        </div>
        <div class="tl-head-side">
          <div class="bb-seg" role="group" aria-label="Mode">
            <button :class="{ active: mode === 'chain' }" @click="mode = 'chain'">Event chain</button>
            <button :class="{ active: mode === 'compare' }" @click="mode = 'compare'">Compare</button>
            <button :class="{ active: mode === 'narrative' }" @click="mode = 'narrative'">Narrative</button>
          </div>
          <div class="bb-actions tl-actions">
            <button class="bb-btn small" :class="{ primary: !seqPlaying, active: seqPlaying }" :disabled="!(rec.events && rec.events.length)" @click="toggleSeq" title="Step through the events in order with a ticking clock">
              <svg v-if="!seqPlaying" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z"></path></svg>
              <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>
              {{ seqPlaying ? 'Stop' : 'Play sequence' }}
            </button>
            <RecordActions :record="rec" :index="index" current="timeline" />
          </div>
        </div>
      </div>

      <div v-if="seqPlaying" class="tl-live" @click="toggleSeq">
        <div class="tl-live-clock bb-num">{{ liveClock }}</div>
        <div class="tl-live-sub">{{ liveSub }}</div>
      </div>

      <!-- Causal chain diagram -->
      <div class="tl-dag bb-scroll" v-if="mode !== 'narrative' && rec.chain">
        <ChainDiagram :chain="rec.chain" :index="index" :graph="graph" :highlight="hoverFactors" @select="onFactorSelect" />
      </div>

      <!-- CHAIN MODE -->
      <div class="tl-body" v-if="mode === 'chain'">
        <div class="tl-events bb-scroll" ref="eventsEl">
          <div v-for="(group, gi) in phaseGroups" :key="gi" class="tl-phase">
            <div class="tl-phase-label">{{ (group.phase || 'sequence').replace(/_/g, ' ') }}</div>
            <div v-for="e in group.events" :key="e.idx" class="tl-event" :class="['kind-' + (e.kind || 'system'), { active: activeEvent === e.idx }]" @mouseenter="hoverFactors = e.factors || []" @mouseleave="hoverFactors = []" @click="focusEvent(e)">
              <div class="tl-event-time">
                <div class="tl-clock">{{ e.clock || '' }}</div>
                <div class="tl-t">{{ formatRelative(e.t) }}</div>
              </div>
              <div class="tl-event-dot" :class="'actor-' + e.actor"></div>
              <div class="tl-event-body">
                <div class="tl-event-actor">{{ actorName(e.actor) }} <span class="bb-tag">{{ (e.kind || '').replace(/_/g, ' ') }}</span></div>
                <div class="tl-event-text">{{ e.text }}</div>
                <div class="tl-state" v-if="e.state && Object.keys(e.state).length">
                  <span v-for="(v, k) in e.state" :key="k" class="tl-state-item"><span class="bb-muted">{{ stateLabel(k) }}</span> {{ stateValue(k, v) }}</span>
                </div>
                <div class="tl-event-factors" v-if="e.factors && e.factors.length">
                  <span v-for="f in e.factors" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }" @click.stop="onFactorSelect(f)">{{ factorLabel(f) }}</span>
                </div>
                <div class="tl-event-recs" v-if="recsForEvent(e).length">
                  <span v-for="r in recsForEvent(e)" :key="r.key" class="bb-tag ok" :title="r.text">→ {{ r.id || 'recommendation' }} to {{ r.to || '?' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tl-side">
          <div class="tl-side-section">
            <div class="bb-h">Transcript {{ rec.cvr && rec.cvr.length ? '' : '· none public' }}</div>
            <div class="tl-cvr bb-scroll" ref="cvrEl">
              <div v-for="(c, i) in rec.cvr" :key="i" class="tl-cvr-line" :class="{ near: nearestCvr === i }" @click="activeEventFromTime(c.t)">
                <span class="tl-cvr-t">{{ c.clock || c.t }}</span>
                <span class="tl-cvr-spk">{{ c.speaker }}</span>
                <span>{{ c.text }}<span v-if="c.translation" class="bb-muted"> — {{ c.translation }}</span></span>
              </div>
            </div>
          </div>
          <div class="tl-side-section" v-if="rec.audio && rec.audio.length">
            <div class="bb-h">Recordings</div>
            <div v-for="(a, i) in uniqueAudio(rec.audio)" :key="i" class="tl-audio">
              <div class="tl-audio-title"><span class="bb-tag">{{ a.kind === 'cvr' ? 'CVR' : a.kind === 'atc' ? 'ATC' : 'Audio' }}</span> {{ a.title }}</div>
              <audio controls preload="none" :src="a.url"></audio>
              <div class="bb-muted tl-audio-credit"><a :href="a.page" target="_blank" rel="noopener" class="bb-link">Wikimedia Commons</a> · {{ a.license }}<span v-if="rec.fdr"> · <span class="bb-link" @click="store.openReplay(rec.id)">play it in sync with the replay ▸</span></span></div>
            </div>
          </div>
          <div class="tl-side-section">
            <div class="bb-h">Recommendations ({{ (rec.recommendations || []).length }})</div>
            <div class="tl-recs bb-scroll">
              <div v-for="(r, i) in rec.recommendations" :key="i" class="tl-rec">
                <div class="tl-rec-head">
                  <b>{{ r.id || 'Recommendation ' + (i + 1) }}</b>
                  <span class="bb-muted" v-if="r.to">→ {{ r.to }}</span>
                  <span class="bb-tag" :class="'st-' + (r.status || 'unknown')">{{ (r.status || 'unknown').replace(/_/g, ' ') }}</span>
                </div>
                <div class="tl-rec-text">{{ r.text }}</div>
                <div class="bb-muted tl-rec-outcome" v-if="r.outcome">{{ r.outcome }}</div>
                <div class="tl-event-factors" v-if="r.trigger_factors && r.trigger_factors.length">
                  <span v-for="f in r.trigger_factors" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }" @click="onFactorSelect(f)">{{ factorLabel(f) }}</span>
                </div>
              </div>
              <div v-if="rec.safety_changes && rec.safety_changes.length">
                <div class="bb-h">What changed</div>
                <ul class="tl-changes"><li v-for="(s, i) in rec.safety_changes" :key="i">{{ s }}</li></ul>
              </div>
              <div v-if="rec.dissent && rec.dissent.length" class="tl-dissent-box">
                <div class="bb-h">Agency dissent</div>
                <div v-for="(d, i) in rec.dissent" :key="i"><b>{{ d.agency }}</b> <span class="bb-muted">({{ d.topic }})</span>: {{ d.position }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- COMPARE MODE -->
      <div class="tl-body tl-compare bb-scroll" v-else-if="mode === 'compare'">
        <div class="tl-compare-pick">
          <span class="bb-muted">Compare with</span>
          <select class="bb-select" v-model="compareSel">
            <option v-for="s in suggestions" :key="s.id" :value="s.id">{{ index.byId[s.id].title }} ({{ s.shared }} shared factors)</option>
            <option disabled>──────────</option>
            <option v-for="r in graph.records" :key="'all' + r.id" :value="r.id">{{ r.title }}</option>
            <option v-if="rec.tier" :value="rec.id" disabled>(catalog records can be compared via suggestions above)</option>
          </select>
          <span class="tl-sim bb-muted" v-if="cmp">Mechanism similarity <b class="bb-num">{{ Math.round(similarity * 100) }}%</b> · {{ sharedFactors.length }} shared factors · {{ sharedEdges.length }} shared causal edges</span>
        </div>
        <template v-if="cmp">
          <div class="tl-compare-grid">
            <div class="tl-compare-col">
              <div class="tl-title"><span class="bb-agency">{{ rec.agency }}</span> {{ rec.title }}</div>
              <div class="bb-muted">{{ rec.date }} · {{ rec.aircraft.type }} · {{ rec.phase }}</div>
              <p class="tl-summary">{{ rec.summary }}</p>
            </div>
            <div class="tl-compare-mid">
              <div class="bb-h">Shared mechanism</div>
              <div class="tl-chipwrap">
                <span v-for="f in sharedFactors" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span>
                <span v-if="!sharedFactors.length" class="bb-muted">none</span>
              </div>
              <div class="bb-h" v-if="sharedEdges.length">Shared causal edges</div>
              <div v-for="e in sharedEdges" :key="e.join('>')" class="tl-edge">{{ factorLabel(e[0]) }} <span class="bb-arrow">→</span> {{ factorLabel(e[1]) }}</div>
            </div>
            <div class="tl-compare-col">
              <div class="tl-title"><span class="bb-agency">{{ cmp.agency }}</span> {{ cmp.title }}</div>
              <div class="bb-muted">{{ cmp.date }} · {{ cmp.aircraft.type }} · {{ cmp.phase }}</div>
              <p class="tl-summary">{{ cmp.summary }}</p>
            </div>
          </div>
          <div class="tl-compare-grid">
            <div class="tl-compare-col">
              <div class="bb-h">Only in {{ rec.title }}</div>
              <div class="tl-chipwrap"><span v-for="f in onlyA" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span></div>
              <div class="bb-h">Chain</div>
              <div class="tl-dag-small"><ChainDiagram :chain="rec.chain" :index="index" :graph="graph" :highlight="sharedFactors" @select="onFactorSelect" /></div>
              <div class="bb-h">Agencies</div>
              <div class="bb-muted">{{ rec.agencies.map((a) => a.code + ' (' + a.role.replace(/_/g, ' ') + ')').join(', ') }}</div>
              <div v-if="rec.dissent && rec.dissent.length" class="tl-dissent-box"><div v-for="(d, i) in rec.dissent" :key="i"><b>{{ d.agency }}</b>: {{ d.position }}</div></div>
            </div>
            <div class="tl-compare-mid">
              <div class="bb-h">Same outcome?</div>
              <div class="tl-chipwrap">
                <span v-for="f in outcomeFactors(rec)" :key="'a' + f" class="bb-chip factor" :style="{ '--c': factorColor(f), opacity: outcomeFactors(cmp).includes(f) ? 1 : 0.45 }">{{ factorLabel(f) }}</span>
              </div>
              <div class="bb-h">Phase</div>
              <div>{{ rec.phase }} <span class="bb-muted">vs</span> {{ cmp.phase }}</div>
              <div class="bb-h">Years apart</div>
              <div>{{ Math.abs(+rec.date.slice(0, 4) - +cmp.date.slice(0, 4)) }}</div>
              <div class="bb-h">Did the earlier one's recommendations address the later one?</div>
              <div class="bb-muted tl-small">{{ lessonText }}</div>
            </div>
            <div class="tl-compare-col">
              <div class="bb-h">Only in {{ cmp.title }}</div>
              <div class="tl-chipwrap"><span v-for="f in onlyB" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span></div>
              <div class="bb-h">Chain</div>
              <div class="tl-dag-small"><ChainDiagram :chain="cmp.chain" :index="index" :graph="graph" :highlight="sharedFactors" @select="onFactorSelect" /></div>
              <div class="bb-h">Agencies</div>
              <div class="bb-muted">{{ cmp.agencies.map((a) => a.code + ' (' + a.role.replace(/_/g, ' ') + ')').join(', ') }}</div>
              <div v-if="cmp.dissent && cmp.dissent.length" class="tl-dissent-box"><div v-for="(d, i) in cmp.dissent" :key="i"><b>{{ d.agency }}</b>: {{ d.position }}</div></div>
            </div>
          </div>
          <div class="tl-compare-events">
            <div class="bb-h">Aligned event timelines (t relative to each accident's own t0)</div>
            <div class="tl-align">
              <div v-for="(row, i) in alignedEvents" :key="i" class="tl-align-row">
                <div class="tl-align-cell" :class="{ empty: !row.a }"><template v-if="row.a"><span class="tl-t">{{ formatRelative(row.a.t) }}</span> {{ row.a.text }}</template></div>
                <div class="tl-align-cell" :class="{ empty: !row.b }"><template v-if="row.b"><span class="tl-t">{{ formatRelative(row.b.t) }}</span> {{ row.b.text }}</template></div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- NARRATIVE MODE -->
      <div class="tl-body tl-narrative" v-else>
        <div class="tl-narr-tools">
          <button class="bb-btn small" @click="copyNarrative">{{ copied ? 'Copied ✓' : 'Copy markdown' }}</button>
          <span class="bb-muted">Generated from the structured record; a scaffold, not a substitute for the report.</span>
        </div>
        <div class="tl-narr-html bb-scroll" v-html="narrativeHtml"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, defineComponent, h } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { similarRecords } from './lib/search.js'
import { layoutChain } from './lib/dag.js'
import { buildNarrative, markdownToHtml } from './lib/narrative.js'
import { formatRelative } from './lib/fdr.js'
import { loadCatalogRecord } from './lib/catalog.js'
import RecordActions from './RecordActions.vue'
import { formatClock } from './lib/fdr.js'
import { note } from './lib/synth.js'
import { onBeforeUnmount } from 'vue'

const props = defineProps({ graph: Object, index: Object, active: Boolean })
const store = useBlackboxStore()

const filter = ref('')
const mode = ref('chain')
function uniqueAudio(list) {
  const pref = { ogg: 0, oga: 0, mp3: 1, opus: 2, webm: 3, wav: 4, flac: 5 }
  const byBase = {}
  for (const a of list || []) {
    const base = a.title.replace(/\.[a-z0-9]+$/i, '')
    const ext = (a.title.split('.').pop() || '').toLowerCase()
    if (!(ext in pref)) continue
    if (!byBase[base] || pref[ext] < pref[byBase[base].ext]) byBase[base] = { ...a, ext }
  }
  return Object.values(byBase)
}
const hoverFactors = ref([])
const activeEvent = ref(-1)
const eventsEl = ref(null)
const cvrEl = ref(null)
const copied = ref(false)

// Auto-play: the events in order, with a clock that counts between them
const seqPlaying = ref(false)
const liveT = ref(0)
let seqRaf = null
let seqIdx = 0
let seqStart = 0
let seqDwell = 0
let lastTickSec = null
const liveClock = computed(() => {
  const r = rec.value
  if (r && r.t0) return formatClock(r.t0, liveT.value)
  const e = r?.events?.[activeEvent.value]
  return e?.clock || formatRelative(Math.round(liveT.value))
})
const liveSub = computed(() => {
  const r = rec.value
  const e = r?.events?.[activeEvent.value]
  return e ? `${formatRelative(Math.round(liveT.value))} · ${(e.phase || '').replace(/_/g, ' ')} · ${activeEvent.value + 1} of ${r.events.length}` : ''
})
function toggleSeq() {
  if (seqPlaying.value) { stopSeq(); return }
  const evs = rec.value?.events || []
  if (!evs.length) return
  seqPlaying.value = true
  mode.value = 'chain'
  seqIdx = Math.max(0, activeEvent.value)
  startBeat()
  seqRaf = requestAnimationFrame(seqTick)
}
function stopSeq() {
  seqPlaying.value = false
  if (seqRaf) cancelAnimationFrame(seqRaf)
  seqRaf = null
}
function startBeat() {
  const evs = rec.value.events
  const e = evs[seqIdx]
  activeEvent.value = seqIdx
  liveT.value = e.t
  seqStart = performance.now()
  seqDwell = Math.min(7, Math.max(2.4, 1.6 + (e.text || '').length / 55)) * 1000
  lastTickSec = null
  nextTick(() => {
    const el = eventsEl.value?.querySelectorAll('.tl-event')?.[seqIdx]
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const c = cvrEl.value?.children?.[nearestCvr.value]
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
  if (store.sound) note(e.kind === 'outcome' ? 220 : e.kind === 'warning' ? 660 : 440, { dur: 0.25, gain: 0.05, type: 'triangle' })
}
function seqTick() {
  if (!seqPlaying.value) return
  seqRaf = requestAnimationFrame(seqTick)
  const evs = rec.value?.events || []
  if (!evs.length) { stopSeq(); return }
  const f = Math.min(1, (performance.now() - seqStart) / seqDwell)
  const e = evs[seqIdx]
  const n = evs[seqIdx + 1]
  // the clock runs from this event towards the next; long gaps are compressed
  if (n) {
    const gap = n.t - e.t
    const shown = gap > 120 ? e.t + gap * f : e.t + Math.min(gap, gap * f)
    liveT.value = shown
    const sec = Math.floor(shown)
    if (store.sound && gap <= 120 && lastTickSec !== null && sec !== lastTickSec) note(1200, { dur: 0.03, gain: 0.02, type: 'square' })
    lastTickSec = sec
  }
  if (f >= 1) {
    if (seqIdx >= evs.length - 1) { stopSeq(); return }
    seqIdx++
    startBeat()
  }
}
onBeforeUnmount(stopSeq)

const version = ref(0)
const rec = computed(() => {
  void version.value
  const r = props.index.byId[store.selectedId] || props.graph.records[0]
  return r
})
const filtered = computed(() => {
  const f = filter.value.toLowerCase()
  const all = props.index.records.filter((r) => !f || `${r.title} ${r.aircraft.type} ${r.operator} ${r.agency} ${r.date}`.toLowerCase().includes(f))
  // curated first, then by interest; cap the DOM at 400 rows
  return all.sort((a, b) => (a.tier ? 1 : 0) - (b.tier ? 1 : 0) || (b.interest || 0) - (a.interest || 0) || a.date.localeCompare(b.date)).slice(0, 400)
})
const filteredTotal = computed(() => props.index.records.length)
const factorColor = (id) => props.graph.taxonomy.categories[props.index.factorById[id]?.category]?.color || '#888'
const factorLabel = (id) => props.index.factorById[id]?.label || id
const actorName = (a) => props.graph.taxonomy.actors[a] || a
const stateLabel = (k) => ({ alt: 'ALT', ias: 'IAS', pitch: 'PITCH', hdg: 'HDG', vs: 'V/S', aoa: 'AoA', roll: 'ROLL', n1: 'N1', flaps: 'FLAPS', gear: 'GEAR', gs: 'GS', mach: 'M', cas: 'CAS', tas: 'TAS', ra: 'RA' }[k] || k.toUpperCase())
const stateValue = (k, v) => {
  if (typeof v !== 'number') return String(v)
  if (k === 'alt') return `${Math.round(v).toLocaleString()} ft`
  if (k === 'ias' || k === 'gs' || k === 'cas' || k === 'tas') return `${Math.round(v)} kt`
  if (k === 'vs') return `${v > 0 ? '+' : ''}${Math.round(v)} fpm`
  if (['pitch', 'roll', 'aoa', 'hdg'].includes(k)) return `${v}°`
  if (k === 'n1') return `${v}%`
  return String(v)
}

const phaseGroups = computed(() => {
  const groups = []
  rec.value.events.forEach((e, idx) => {
    const last = groups[groups.length - 1]
    const ev = { ...e, idx }
    if (!last || last.phase !== e.phase) groups.push({ phase: e.phase, events: [ev] })
    else last.events.push(ev)
  })
  return groups
})

function recsForEvent(e) {
  if (!e.factors || !e.factors.length) return []
  const out = []
  rec.value.recommendations.forEach((r, i) => {
    if ((r.trigger_factors || []).some((f) => e.factors.includes(f))) out.push({ ...r, key: i })
  })
  return out.slice(0, 4)
}

const nearestCvr = computed(() => {
  if (activeEvent.value < 0 || !rec.value.cvr || !rec.value.cvr.length) return -1
  const t = rec.value.events[activeEvent.value]?.t
  let best = -1
  let bestD = Infinity
  rec.value.cvr.forEach((c, i) => {
    const d = Math.abs(c.t - t)
    if (d < bestD) { bestD = d; best = i }
  })
  return best
})

async function focusEvent(e) {
  activeEvent.value = e.idx
  await nextTick()
  const el = cvrEl.value?.children?.[nearestCvr.value]
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  if (rec.value.fdr && e.t !== undefined && false) store.openReplay(rec.value.id, e.t)
}
function activeEventFromTime(t) {
  let best = 0
  let bestD = Infinity
  rec.value.events.forEach((e, i) => {
    const d = Math.abs(e.t - t)
    if (d < bestD) { bestD = d; best = i }
  })
  activeEvent.value = best
  const el = eventsEl.value?.querySelectorAll('.tl-event')?.[best]
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
async function pick(id) {
  store.selectedId = id
  activeEvent.value = -1
  const r = props.index.byId[id]
  if (r && r.stub) {
    const full = await loadCatalogRecord(id, r.date)
    if (full) {
      Object.assign(r, full, { stub: false })
      version.value++
    }
  }
}
watch(() => store.selectedId, (id) => { if (id && props.index.byId[id]?.stub) pick(id) }, { immediate: true })
function onFactorSelect(id) {
  store.openGraph(rec.value.id, props.index.factorById[id]?.label.toLowerCase() || id)
}

// Compare mode
const suggestions = computed(() => similarRecords(props.index, rec.value.id, 8))
const compareSel = ref(store.compareId)
watch(compareSel, (v) => (store.compareId = v))
watch(rec, () => {
  if (!compareSel.value || compareSel.value === rec.value.id) compareSel.value = suggestions.value[0]?.id || null
}, { immediate: true })
const cmp = computed(() => (compareSel.value ? props.index.byId[compareSel.value] : null))
const factorSet = (r) => new Set(r.factors.map((f) => f.id))
const sharedFactors = computed(() => (cmp.value ? [...factorSet(rec.value)].filter((f) => factorSet(cmp.value).has(f)) : []))
const onlyA = computed(() => (cmp.value ? [...factorSet(rec.value)].filter((f) => !factorSet(cmp.value).has(f)) : []))
const onlyB = computed(() => (cmp.value ? [...factorSet(cmp.value)].filter((f) => !factorSet(rec.value).has(f)) : []))
const sharedEdges = computed(() => {
  if (!cmp.value) return []
  const a = new Set(rec.value.chain.map((e) => e.join('>')))
  return cmp.value.chain.filter((e) => a.has(e.join('>')))
})
const similarity = computed(() => {
  if (!cmp.value) return 0
  const union = new Set([...factorSet(rec.value), ...factorSet(cmp.value)]).size
  return Math.min(1, sharedFactors.value.length / Math.max(1, union) + sharedEdges.value.length * 0.08)
})
const outcomeFactors = (r) => r.factors.filter((f) => f.role === 'outcome').map((f) => f.id)
const lessonText = computed(() => {
  if (!cmp.value) return ''
  const [earlier, later] = rec.value.date < cmp.value.date ? [rec.value, cmp.value] : [cmp.value, rec.value]
  const laterFactors = factorSet(later)
  const hits = earlier.recommendations.filter((r) => (r.trigger_factors || []).some((f) => laterFactors.has(f)))
  if (!hits.length) return `${earlier.title} (${earlier.date.slice(0, 4)}) issued no recommendation tied to a factor that recurred in ${later.title} (${later.date.slice(0, 4)}).`
  return `${hits.length} recommendation${hits.length > 1 ? 's' : ''} from ${earlier.title} (${earlier.date.slice(0, 4)}) targeted factors that recurred in ${later.title} (${later.date.slice(0, 4)}): ${hits.map((r) => r.id || r.text.slice(0, 60) + '…').join('; ')}.`
})
const alignedEvents = computed(() => {
  if (!cmp.value) return []
  const a = rec.value.events
  const b = cmp.value.events
  const rows = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].t <= b[j].t)) rows.push({ a: a[i++], b: null })
    else rows.push({ a: null, b: b[j++] })
  }
  return rows
})

// Narrative
const narrativeMd = computed(() => buildNarrative(rec.value, props.index))
const narrativeHtml = computed(() => markdownToHtml(narrativeMd.value))
async function copyNarrative() {
  try {
    await navigator.clipboard.writeText(narrativeMd.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* clipboard unavailable */
  }
}

// Chain diagram as an inline SVG component
const ChainDiagram = defineComponent({
  props: { chain: Array, index: Object, graph: Object, highlight: Array },
  emits: ['select'],
  setup(p, { emit }) {
    return () => {
      if (!p.chain || !p.chain.length) return h('div', { class: 'bb-muted', style: 'padding:6px' }, 'No causal chain encoded.')
      const lay = layoutChain(p.chain, (id) => p.index.factorById[id]?.label || id)
      const hi = new Set(p.highlight || [])
      const pad = 8
      return h('svg', { viewBox: `${-pad} ${-pad} ${lay.width + 2 * pad} ${lay.height + 2 * pad}`, width: lay.width + 2 * pad, height: lay.height + 2 * pad, style: 'display:block' }, [
        h('defs', [h('marker', { id: 'bb-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#8a93a3' })])]),
        ...lay.edges.map((e) => h('path', { d: e.d, fill: 'none', stroke: e.back ? '#ff5cf0' : '#8a93a3', 'stroke-width': 1.4, 'stroke-dasharray': e.back ? '4 3' : null, 'marker-end': 'url(#bb-arrow)', opacity: hi.size && !(hi.has(e.from) && hi.has(e.to)) ? 0.35 : 1 })),
        ...lay.nodes.map((n) => {
          const f = p.index.factorById[n.id]
          const color = p.graph.taxonomy.categories[f?.category]?.color || '#888'
          const dim = hi.size && !hi.has(n.id)
          return h('g', { transform: `translate(${n.x},${n.y})`, style: 'cursor:pointer', opacity: dim ? 0.4 : 1, onClick: () => emit('select', n.id) }, [
            h('rect', { width: n.w, height: n.h, rx: 4, fill: '#1a1f28', stroke: hi.has(n.id) ? '#e8ecf1' : '#333b49', 'stroke-width': hi.has(n.id) ? 1.5 : 1 }),
            h('rect', { x: 0, y: 0, width: 3, height: n.h, rx: 1.5, fill: color }),
            h('text', { x: n.w / 2 + 2, y: n.h / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", 'font-weight': 500, fill: '#e8ecf1' }, n.label)
          ])
        })
      ])
    }
  }
})
watch(rec, stopSeq)
</script>

<style scoped>
.tl-root { position: absolute; inset: 0; display: grid; grid-template-columns: 272px 1fr; }
.tl-list { border-right: 1px solid var(--bb-line); }
.tl-filter { padding: var(--bb-pad) var(--bb-pad) 8px; border-bottom: 1px solid var(--bb-line); }
.tl-count { font-size: 10.5px; padding-top: 6px; }
.tl-list-scroll { flex: 1; overflow: auto; }
.tl-item.compare { box-shadow: inset 2px 0 0 #ff5cf0; }
.tl-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-mark { font-size: 9px; color: var(--bb-muted); }
.tl-mark.warn { color: var(--bb-warn); font-weight: 700; font-size: 11px; }
.tl-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.tl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 10px var(--bb-pad); border-bottom: 1px solid var(--bb-line); background: var(--bb-panel); }
.tl-head-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tl-head-tags { display: flex; gap: 4px; align-items: center; }
.tl-head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
.tl-actions { justify-content: flex-end; }
.tl-title { font-size: 13px; font-weight: 600; }
.tl-audio { margin-bottom: 8px; }
.tl-audio-title { font-size: 11px; color: var(--bb-text-2); margin-bottom: 4px; }
.tl-audio-credit { font-size: 10px; margin-top: 2px; }
.tl-live { position: absolute; right: 18px; top: 74px; z-index: 5; background: var(--bb-panel-2); border: 1px solid var(--bb-line-2); border-radius: var(--bb-radius-lg); padding: 8px 14px; text-align: right; cursor: pointer; box-shadow: 0 8px 30px rgba(0,0,0,0.5); animation: tl-live-in 0.4s ease-out; }
.tl-live-clock { font-size: 30px; color: var(--bb-text); letter-spacing: 0.04em; line-height: 1; }
.tl-live-sub { font-size: 10.5px; color: var(--bb-muted); margin-top: 4px; }
@keyframes tl-live-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.tl-dag { border-bottom: 1px solid var(--bb-line); padding: 8px var(--bb-pad); overflow: auto; background: var(--bb-bg); max-height: 190px; flex: none; }
.tl-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 340px; }
.tl-events { overflow: auto; padding: 8px var(--bb-pad) 30px; }
.tl-phase-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bb-muted); margin: 12px 0 4px 66px; padding-bottom: 3px; border-bottom: 1px solid var(--bb-line); }
.tl-event { display: grid; grid-template-columns: 56px 14px 1fr; gap: 8px; padding: 6px 4px; border-radius: var(--bb-radius); cursor: pointer; position: relative; }
.tl-event:hover { background: var(--bb-panel-2); }
.tl-event.active { background: var(--bb-panel-3); }
.tl-event::before { content: ''; position: absolute; left: 74px; top: 0; bottom: 0; width: 1px; background: var(--bb-line); }
.tl-event-time { text-align: right; }
.tl-clock { font-family: var(--bb-mono); font-size: 11px; font-variant-numeric: tabular-nums; }
.tl-t { font-size: 9.5px; color: var(--bb-muted); font-family: var(--bb-mono); font-variant-numeric: tabular-nums; }
.tl-event-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bb-muted); margin-top: 4px; position: relative; z-index: 1; border: 2px solid var(--bb-bg); box-sizing: content-box; margin-left: 1px; }
.actor-SYS { background: #c792ea; } .actor-ATC { background: #62a0ff; } .actor-CAPT, .actor-PF { background: #ff8a5c; } .actor-FO, .actor-PM { background: #34d399; } .actor-ENV { background: #2a9d8f; } .actor-GND { background: #b5651d; } .actor-CABIN { background: #ffd166; }
.kind-warning .tl-event-text { color: var(--bb-accent); }
.kind-outcome .tl-event-text { color: var(--bb-danger); font-weight: 600; }
.tl-event-actor { font-size: 10.5px; color: var(--bb-muted); display: flex; gap: 6px; align-items: center; }
.tl-event-text { line-height: 1.45; color: var(--bb-text); margin-top: 1px; }
.tl-state { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; font-family: var(--bb-mono); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.tl-state-item .bb-muted { margin-right: 3px; }
.tl-event-factors { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 5px; }
.tl-event-recs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tl-side { border-left: 1px solid var(--bb-line); display: flex; flex-direction: column; min-height: 0; background: var(--bb-panel); }
.tl-side-section { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: var(--bb-pad) var(--bb-pad) 0; }
.tl-side-section:first-child { border-bottom: 1px solid var(--bb-line); max-height: 45%; }
.tl-cvr, .tl-recs { flex: 1; overflow: auto; padding-bottom: 10px; }
.tl-cvr-line { display: grid; grid-template-columns: 52px 40px 1fr; gap: 6px; font-size: 11px; padding: 3px 4px; border-radius: 3px; cursor: pointer; line-height: 1.4; }
.tl-cvr-line.near { background: var(--bb-panel-3); box-shadow: inset 2px 0 0 var(--bb-accent); }
.tl-cvr-t { font-family: var(--bb-mono); color: var(--bb-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.tl-cvr-spk { font-weight: 600; color: var(--bb-accent); font-size: 10px; }
.tl-rec { border-bottom: 1px solid var(--bb-line); padding: 8px 0; }
.tl-rec-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.tl-rec-head .bb-tag { margin-left: auto; }
.st-open { color: var(--bb-warn); border-color: rgba(255,159,67,0.45); } .st-closed_acceptable { color: var(--bb-accent-2); border-color: rgba(52,211,153,0.45); } .st-closed_unacceptable { color: var(--bb-danger); border-color: rgba(255,93,93,0.45); }
.tl-rec-text { font-size: 11.5px; line-height: 1.45; margin-top: 3px; color: var(--bb-text-2); }
.tl-rec-outcome { font-size: 10.5px; margin-top: 3px; }
.tl-changes { padding-left: 16px; font-size: 11.5px; line-height: 1.45; color: var(--bb-text-2); }
.tl-dissent-box { margin: 10px 0; padding: 8px 10px; border: 1px solid rgba(255,159,67,0.35); border-radius: var(--bb-radius-lg); line-height: 1.45; font-size: 11.5px; }
.tl-dissent-box .bb-h { color: var(--bb-warn); }
.tl-compare { display: block; overflow: auto; padding: var(--bb-pad) var(--bb-pad) 30px; }
.tl-compare-pick { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.tl-compare-pick select { max-width: 380px; }
.tl-sim { margin-left: auto; font-size: 11px; }
.tl-compare-grid { display: grid; grid-template-columns: 1fr 260px 1fr; gap: 14px; margin-bottom: 14px; }
.tl-compare-col { min-width: 0; }
.tl-compare-mid { background: var(--bb-panel); border: 1px solid var(--bb-line); border-radius: var(--bb-radius-lg); padding: var(--bb-pad); }
.tl-summary { line-height: 1.5; color: var(--bb-text-2); }
.tl-chipwrap { display: flex; flex-wrap: wrap; gap: 4px; }
.tl-edge { font-size: 11.5px; padding: 2px 0; }
.tl-dag-small { overflow: auto; background: var(--bb-bg); border: 1px solid var(--bb-line); border-radius: var(--bb-radius); padding: 6px; }
.tl-small { font-size: 11px; line-height: 1.45; }
.tl-align { display: flex; flex-direction: column; }
.tl-align-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid var(--bb-line); }
.tl-align-cell { padding: 5px 6px; font-size: 11px; line-height: 1.4; }
.tl-align-cell.empty { background: repeating-linear-gradient(45deg, transparent 0 6px, var(--bb-panel-2) 6px 7px); }
.tl-align-cell .tl-t { margin-right: 6px; }
.tl-narrative { display: flex; flex-direction: column; }
.tl-narr-tools { display: flex; gap: 10px; align-items: center; padding: 8px var(--bb-pad); border-bottom: 1px solid var(--bb-line); }
.tl-narr-html { flex: 1; overflow: auto; padding: 16px 28px 40px; max-width: 820px; line-height: 1.6; font-size: 13px; }
.tl-narr-html :deep(h1) { font-size: 20px; margin: 4px 0 6px; font-weight: 600; }
.tl-narr-html :deep(h2) { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--bb-muted); margin: 20px 0 6px; font-weight: 500; }
.tl-narr-html :deep(p) { margin: 6px 0; color: var(--bb-text-2); }
.tl-narr-html :deep(li) { color: var(--bb-text-2); }
.tl-narr-html :deep(code) { font-family: var(--bb-mono); background: var(--bb-panel-2); padding: 0 3px; border-radius: 2px; }
.tl-narr-html :deep(hr) { border: none; border-top: 1px solid var(--bb-line); margin: 16px 0; }
@media (max-width: 900px) {
  .tl-root { grid-template-columns: 1fr; grid-template-rows: 30% 70%; }
  .tl-body { grid-template-columns: 1fr; }
  .tl-side { display: none; }
  .tl-compare-grid { grid-template-columns: 1fr; }
  .tl-head { flex-direction: column; }
  .tl-head-side { align-items: flex-start; }
}
</style>
