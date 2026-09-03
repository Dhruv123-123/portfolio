<template>
  <div class="tl-root">
    <div class="tl-list">
      <input v-model="filter" class="bb-input tl-filter" placeholder="Filter accidents…" />
      <div class="bb-muted tl-count" v-if="filteredTotal > 400">showing up to 400 of {{ filteredTotal.toLocaleString() }} · type to filter</div>
      <div class="tl-list-scroll bb-scroll">
        <div v-for="r in filtered" :key="r.id" class="tl-item" :class="{ active: r.id === store.selectedId, compare: r.id === store.compareId }" @click="pick(r.id)">
          <span class="bb-agency">{{ r.agency }}</span>
          <span class="tl-item-title">{{ r.title }}</span>
          <span class="bb-muted">{{ r.date.slice(0, 4) }}</span>
          <span v-if="r.fdr" class="tl-fdr" title="FDR replay available">FDR</span>
          <span v-if="r.tier" class="tl-tier" :title="r.tier + ' · ' + r.depth">{{ r.tier === 'ntsb' ? 'DB' : 'W' }}</span>
          <span v-if="r.dissent && r.dissent.length" class="tl-dissent" title="agency dissent">≠</span>
        </div>
      </div>
    </div>

    <div class="tl-main" v-if="rec">
      <div class="tl-head">
        <div>
          <div class="tl-title"><span class="bb-agency">{{ rec.agency }}</span> {{ rec.title }} <span v-if="rec.tier" class="tl-depth">{{ rec.tier === 'ntsb' ? 'NTSB database' : 'Wikidata / Wikipedia' }} · {{ rec.depth }}</span></div>
          <div class="bb-muted">{{ rec.date }} · {{ rec.aircraft.type }} · {{ rec.operator }} · {{ rec.route?.from_name || rec.route?.from || '' }} → {{ rec.route?.to_name || rec.route?.to || '' }} · {{ rec.fatalities ?? '?' }} fatalities</div>
        </div>
        <div class="tl-modes">
          <button class="bb-btn" :class="{ active: mode === 'chain' }" @click="mode = 'chain'">Event chain</button>
          <button class="bb-btn" :class="{ active: mode === 'compare' }" @click="mode = 'compare'">Compare</button>
          <button class="bb-btn" :class="{ active: mode === 'narrative' }" @click="mode = 'narrative'">Narrative</button>
          <button class="bb-btn" :disabled="!rec.fdr" @click="store.openReplay(rec.id)">Replay ▸</button>
          <button class="bb-btn" :disabled="!(rec.events && rec.events.length)" @click="store.openStory(rec.id)" title="Documentary-style walkthrough">Story ▸</button>
          <a :href="wikipediaUrl(rec)" target="_blank" rel="noopener" class="tl-readmore">{{ hasWikipediaArticle(rec) ? 'Read more on Wikipedia ↗' : 'Search Wikipedia ↗' }}</a>
        </div>
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
                <div class="tl-event-actor">{{ actorName(e.actor) }} <span class="tl-kind">{{ (e.kind || '').replace(/_/g, ' ') }}</span></div>
                <div class="tl-event-text">{{ e.text }}</div>
                <div class="tl-state" v-if="e.state && Object.keys(e.state).length">
                  <span v-for="(v, k) in e.state" :key="k" class="tl-state-item"><span class="bb-muted">{{ stateLabel(k) }}</span> {{ stateValue(k, v) }}</span>
                </div>
                <div class="tl-event-factors" v-if="e.factors && e.factors.length">
                  <span v-for="f in e.factors" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }" @click.stop="onFactorSelect(f)">{{ factorLabel(f) }}</span>
                </div>
                <div class="tl-event-recs" v-if="recsForEvent(e).length">
                  <span v-for="r in recsForEvent(e)" :key="r.key" class="tl-rec-chip" :title="r.text">⇢ {{ r.id || 'recommendation' }}<span class="bb-muted"> to {{ r.to || '?' }}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tl-side">
          <div class="tl-side-section">
            <div class="bb-h">CVR {{ rec.cvr && rec.cvr.length ? '' : '(no public transcript)' }}</div>
            <div class="tl-cvr bb-scroll" ref="cvrEl">
              <div v-for="(c, i) in rec.cvr" :key="i" class="tl-cvr-line" :class="{ near: nearestCvr === i }" @click="activeEventFromTime(c.t)">
                <span class="tl-cvr-t">{{ c.clock || c.t }}</span>
                <span class="tl-cvr-spk">{{ c.speaker }}</span>
                <span>{{ c.text }}<span v-if="c.translation" class="bb-muted"> — {{ c.translation }}</span></span>
              </div>
            </div>
          </div>
          <div class="tl-side-section">
            <div class="bb-h">Recommendations ({{ (rec.recommendations || []).length }})</div>
            <div class="tl-recs bb-scroll">
              <div v-for="(r, i) in rec.recommendations" :key="i" class="tl-rec">
                <div class="tl-rec-head">
                  <b>{{ r.id || 'Recommendation ' + (i + 1) }}</b>
                  <span class="bb-muted" v-if="r.to">→ {{ r.to }}</span>
                  <span class="tl-status" :class="'st-' + (r.status || 'unknown')">{{ (r.status || 'unknown').replace(/_/g, ' ') }}</span>
                </div>
                <div class="tl-rec-text">{{ r.text }}</div>
                <div class="bb-muted tl-rec-outcome" v-if="r.outcome">{{ r.outcome }}</div>
                <div class="tl-event-factors" v-if="r.trigger_factors && r.trigger_factors.length">
                  <span v-for="f in r.trigger_factors" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }" @click="onFactorSelect(f)">{{ factorLabel(f) }}</span>
                </div>
              </div>
              <div v-if="rec.safety_changes && rec.safety_changes.length">
                <div class="bb-h">What changed</div>
                <ul class="tl-changes"><li v-for="(s, i) in rec.safety_changes" :key="i">{{ s }}</li></ul>
              </div>
              <div v-if="rec.dissent && rec.dissent.length" class="tl-dissent-box">
                <div class="bb-h" style="color:#ff9f43">Agency dissent</div>
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
          <span class="tl-sim" v-if="cmp">Mechanism similarity <b>{{ Math.round(similarity * 100) }}%</b> · {{ sharedFactors.length }} shared factors · {{ sharedEdges.length }} shared causal edges</span>
        </div>
        <template v-if="cmp">
          <div class="tl-compare-grid">
            <div class="tl-compare-col">
              <div class="tl-title"><span class="bb-agency">{{ rec.agency }}</span> {{ rec.title }} <span v-if="rec.tier" class="tl-depth">{{ rec.tier === 'ntsb' ? 'NTSB database' : 'Wikidata / Wikipedia' }} · {{ rec.depth }}</span></div>
              <div class="bb-muted">{{ rec.date }} · {{ rec.aircraft.type }} · {{ rec.phase }}</div>
              <p class="tl-summary">{{ rec.summary }}</p>
            </div>
            <div class="tl-compare-mid">
              <div class="bb-h">Shared mechanism</div>
              <div class="tl-chipwrap">
                <span v-for="f in sharedFactors" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }">{{ factorLabel(f) }}</span>
                <span v-if="!sharedFactors.length" class="bb-muted">none</span>
              </div>
              <div class="bb-h" v-if="sharedEdges.length">Shared causal edges</div>
              <div v-for="e in sharedEdges" :key="e.join('>')" class="tl-edge">{{ factorLabel(e[0]) }} <span class="tl-arrow">→</span> {{ factorLabel(e[1]) }}</div>
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
              <div class="tl-chipwrap"><span v-for="f in onlyA" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }">{{ factorLabel(f) }}</span></div>
              <div class="bb-h">Chain</div>
              <div class="tl-dag-small"><ChainDiagram :chain="rec.chain" :index="index" :graph="graph" :highlight="sharedFactors" @select="onFactorSelect" /></div>
              <div class="bb-h">Agencies</div>
              <div class="bb-muted">{{ rec.agencies.map((a) => a.code + ' (' + a.role.replace(/_/g, ' ') + ')').join(', ') }}</div>
              <div v-if="rec.dissent && rec.dissent.length" class="tl-dissent-box"><div v-for="(d, i) in rec.dissent" :key="i"><b>{{ d.agency }}</b>: {{ d.position }}</div></div>
            </div>
            <div class="tl-compare-mid">
              <div class="bb-h">Same outcome?</div>
              <div class="tl-chipwrap">
                <span v-for="f in outcomeFactors(rec)" :key="'a' + f" class="bb-chip factor" :style="{ background: factorColor(f), opacity: outcomeFactors(cmp).includes(f) ? 1 : 0.45 }">{{ factorLabel(f) }}</span>
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
              <div class="tl-chipwrap"><span v-for="f in onlyB" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }">{{ factorLabel(f) }}</span></div>
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
          <span class="bb-muted">Generated from the structured record. Cloudberg-style scaffold, not a substitute for the report.</span>
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
import { wikipediaUrl, hasWikipediaArticle } from './lib/geo.js'

const props = defineProps({ graph: Object, index: Object, active: Boolean })
const store = useBlackboxStore()

const filter = ref('')
const mode = ref('chain')
const hoverFactors = ref([])
const activeEvent = ref(-1)
const eventsEl = ref(null)
const cvrEl = ref(null)
const copied = ref(false)

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
        h('defs', [h('marker', { id: 'bb-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#ff9628' })])]),
        ...lay.edges.map((e) => h('path', { d: e.d, fill: 'none', stroke: e.back ? '#ff5cf0' : '#ff9628', 'stroke-width': 1.6, 'stroke-dasharray': e.back ? '4 3' : null, 'marker-end': 'url(#bb-arrow)', opacity: hi.size && !(hi.has(e.from) && hi.has(e.to)) ? 0.35 : 1 })),
        ...lay.nodes.map((n) => {
          const f = p.index.factorById[n.id]
          const color = p.graph.taxonomy.categories[f?.category]?.color || '#888'
          const dim = hi.size && !hi.has(n.id)
          return h('g', { transform: `translate(${n.x},${n.y})`, style: 'cursor:pointer', opacity: dim ? 0.4 : 1, onClick: () => emit('select', n.id) }, [
            h('rect', { width: n.w, height: n.h, rx: 6, fill: color, stroke: hi.has(n.id) ? '#fff' : 'rgba(0,0,0,0.4)', 'stroke-width': hi.has(n.id) ? 2 : 1 }),
            h('text', { x: n.w / 2, y: n.h / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, 'font-family': 'Tahoma, Verdana, sans-serif', 'font-weight': 600, fill: '#111' }, n.label)
          ])
        })
      ])
    }
  }
})
</script>

<style scoped>
.tl-readmore { display: inline-flex; align-items: center; color: var(--bb-accent); font-weight: 700; text-decoration: none; border: 1px solid var(--bb-accent); border-radius: 3px; padding: 3px 8px; font-size: 11px; }
.tl-readmore:hover { background: var(--bb-accent); color: #111; }
.tl-root { position: absolute; inset: 0; display: grid; grid-template-columns: 250px 1fr; }
.tl-list { background: var(--bb-panel); border-right: 1px solid var(--bb-line); display: flex; flex-direction: column; min-height: 0; }
.tl-filter { margin: 8px; width: calc(100% - 16px); }
.tl-list-scroll { flex: 1; overflow: auto; }
.tl-item { display: flex; gap: 5px; align-items: center; padding: 5px 8px; cursor: pointer; border-bottom: 1px solid #1a2438; font-size: 11px; }
.tl-item:hover { background: var(--bb-panel-2); }
.tl-item.active { background: #1c2a45; box-shadow: inset 3px 0 0 var(--bb-accent); }
.tl-item.compare { box-shadow: inset 3px 0 0 #ff5cf0; }
.tl-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-tier { font-size: 8px; color: var(--bb-muted); border: 1px solid var(--bb-line); border-radius: 2px; padding: 0 2px; }
.tl-count { font-size: 10px; padding: 0 8px 4px; }
.tl-depth { font-size: 9px; font-weight: 400; color: var(--bb-muted); border: 1px solid var(--bb-line); border-radius: 3px; padding: 0 4px; margin-left: 6px; vertical-align: middle; }
.tl-fdr { font-size: 8px; color: var(--bb-accent-2); border: 1px solid var(--bb-accent-2); border-radius: 2px; padding: 0 2px; }
.tl-dissent { color: #ff9f43; font-weight: 700; }
.tl-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.tl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--bb-line); background: var(--bb-panel); }
.tl-title { font-size: 14px; font-weight: 700; }
.tl-modes { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.tl-dag { border-bottom: 1px solid var(--bb-line); padding: 8px 12px; overflow: auto; background: #0d1220; max-height: 190px; flex: none; }
.tl-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 340px; }
.tl-events { overflow: auto; padding: 8px 12px 30px; }
.tl-phase-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--bb-accent); margin: 10px 0 4px 60px; padding-bottom: 2px; border-bottom: 1px dashed var(--bb-line); }
.tl-event { display: grid; grid-template-columns: 56px 14px 1fr; gap: 6px; padding: 5px 4px; border-radius: 4px; cursor: pointer; position: relative; }
.tl-event:hover { background: var(--bb-panel-2); }
.tl-event.active { background: #1c2a45; }
.tl-event::before { content: ''; position: absolute; left: 68px; top: 0; bottom: 0; width: 1px; background: var(--bb-line); }
.tl-event-time { text-align: right; }
.tl-clock { font-family: Consolas, monospace; font-size: 11px; }
.tl-t { font-size: 9px; color: var(--bb-muted); font-family: Consolas, monospace; }
.tl-event-dot { width: 10px; height: 10px; border-radius: 50%; background: #8fa3c7; margin-top: 3px; position: relative; z-index: 1; border: 2px solid var(--bb-bg); box-sizing: content-box; margin-left: -1px; }
.actor-SYS { background: #c792ea; } .actor-ATC { background: #4c8dff; } .actor-CAPT, .actor-PF { background: #ff8a5c; } .actor-FO, .actor-PM { background: #22e08a; } .actor-ENV { background: #2a9d8f; } .actor-GND { background: #b5651d; } .actor-CABIN { background: #ffd166; }
.kind-warning .tl-event-text { color: #ffbf00; }
.kind-outcome .tl-event-text { color: #ff6b6b; font-weight: 700; }
.tl-event-actor { font-size: 10px; color: var(--bb-muted); }
.tl-kind { font-size: 9px; border: 1px solid var(--bb-line); border-radius: 3px; padding: 0 3px; margin-left: 4px; }
.tl-event-text { line-height: 1.4; color: #e6eefc; }
.tl-state { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 3px; font-family: Consolas, monospace; font-size: 10px; }
.tl-state-item .bb-muted { margin-right: 3px; }
.tl-event-factors { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.tl-event-recs { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tl-rec-chip { font-size: 9px; color: var(--bb-accent-2); border: 1px dashed var(--bb-accent-2); border-radius: 3px; padding: 0 4px; cursor: help; }
.tl-side { border-left: 1px solid var(--bb-line); display: flex; flex-direction: column; min-height: 0; background: var(--bb-panel); }
.tl-side-section { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 10px; }
.tl-side-section:first-child { border-bottom: 1px solid var(--bb-line); max-height: 45%; }
.tl-cvr, .tl-recs { flex: 1; overflow: auto; padding-bottom: 10px; }
.tl-cvr-line { display: grid; grid-template-columns: 52px 40px 1fr; gap: 5px; font-size: 10.5px; padding: 3px 4px; border-radius: 3px; cursor: pointer; line-height: 1.35; }
.tl-cvr-line.near { background: #1c2a45; box-shadow: inset 2px 0 0 var(--bb-accent); }
.tl-cvr-t { font-family: Consolas, monospace; color: var(--bb-muted); font-size: 9.5px; }
.tl-cvr-spk { font-weight: 700; color: var(--bb-accent); font-size: 10px; }
.tl-rec { border-bottom: 1px solid var(--bb-line); padding: 6px 0; }
.tl-rec-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.tl-status { font-size: 9px; padding: 0 5px; border-radius: 8px; background: #2a3550; margin-left: auto; }
.st-open { background: #7a4d00; color: #ffd166; } .st-closed_acceptable { background: #0f5132; color: #8ff0c0; } .st-closed_unacceptable { background: #6b1a1a; color: #ff9a9a; }
.tl-rec-text { font-size: 11px; line-height: 1.4; margin-top: 2px; }
.tl-rec-outcome { font-size: 10px; margin-top: 2px; }
.tl-changes { padding-left: 16px; font-size: 11px; line-height: 1.4; }
.tl-dissent-box { background: #2a1d10; border: 1px solid #5a3d1a; border-radius: 4px; padding: 4px 8px 8px; margin: 8px 0; line-height: 1.4; font-size: 11px; }
.tl-compare { display: block; overflow: auto; padding: 10px 12px 30px; }
.tl-compare-pick { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.tl-compare-pick select { max-width: 380px; }
.tl-sim { margin-left: auto; }
.tl-compare-grid { display: grid; grid-template-columns: 1fr 260px 1fr; gap: 14px; margin-bottom: 14px; }
.tl-compare-col { min-width: 0; }
.tl-compare-mid { background: var(--bb-panel); border: 1px solid var(--bb-line); border-radius: 6px; padding: 4px 10px 10px; }
.tl-summary { line-height: 1.45; color: #d3ddf0; }
.tl-chipwrap { display: flex; flex-wrap: wrap; gap: 4px; }
.tl-edge { font-size: 11px; padding: 2px 0; }
.tl-arrow { color: var(--bb-accent); }
.tl-dag-small { overflow: auto; background: #0d1220; border-radius: 4px; padding: 6px; }
.tl-small { font-size: 10.5px; line-height: 1.4; }
.tl-align { display: flex; flex-direction: column; }
.tl-align-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border-bottom: 1px solid #1a2438; }
.tl-align-cell { padding: 4px 6px; font-size: 10.5px; line-height: 1.35; }
.tl-align-cell.empty { background: repeating-linear-gradient(45deg, transparent 0 6px, #111a2c 6px 7px); }
.tl-align-cell .tl-t { margin-right: 6px; }
.tl-narrative { display: flex; flex-direction: column; }
.tl-narr-tools { display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--bb-line); }
.tl-narr-html { flex: 1; overflow: auto; padding: 12px 24px 40px; max-width: 820px; line-height: 1.6; font-size: 13px; }
.tl-narr-html :deep(h1) { font-size: 20px; margin: 4px 0 6px; }
.tl-narr-html :deep(h2) { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bb-accent); margin: 18px 0 6px; }
.tl-narr-html :deep(p) { margin: 6px 0; color: #d3ddf0; }
.tl-narr-html :deep(li) { color: #d3ddf0; }
.tl-narr-html :deep(code) { font-family: Consolas, monospace; background: #070a12; padding: 0 3px; }
.tl-narr-html :deep(hr) { border: none; border-top: 1px solid var(--bb-line); margin: 16px 0; }
@media (max-width: 900px) {
  .tl-root { grid-template-columns: 1fr; grid-template-rows: 30% 70%; }
  .tl-body { grid-template-columns: 1fr; }
  .tl-side { display: none; }
  .tl-compare-grid { grid-template-columns: 1fr; }
}
</style>
