<template>
  <div class="ge-root">
    <!-- Left rail: query + results -->
    <div class="ge-left bb-rail">
      <form class="ge-search" @submit.prevent="runQuery">
        <div class="bb-field">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <input v-model="queryText" class="bb-input" placeholder="Ask the graph, e.g. pitot icing led to a stall" spellcheck="false" />
          <button v-if="queryText" type="button" class="ge-clear" @click="clearQuery" title="clear">×</button>
        </div>
        <div class="ge-search-row">
          <button class="bb-btn small" type="button" :class="{ active: semanticOn }" @click="toggleSemantic" :title="semanticStatus">{{ semanticLabel }}</button>
          <button class="bb-btn small" type="button" :class="{ active: catalog.state === 'ready' }" :disabled="catalog.state === 'loading' || catalog.state === 'ready'" @click="$emit('load-catalog')" :title="catalog.error || 'Load the full catalog: thousands of summary-level records from Wikidata/Wikipedia and the NTSB database (about 1 MB)'">
            {{ catalog.state === 'loading' ? 'Loading catalog…' : catalog.state === 'ready' ? 'Catalog · ' + catalog.count.toLocaleString() : catalog.state === 'error' ? 'Catalog failed' : 'Load catalog' }}
          </button>
          <span class="bb-muted ge-status">{{ statusLine }}</span>
        </div>
      </form>
      <div v-if="parsed && (parsed.concepts.length || Object.keys(parsed.filters).length)" class="ge-parsed">
        <span class="bb-muted">Understood as</span>
        <template v-for="(c, i) in parsed.concepts" :key="i">
          <span v-if="i" class="bb-arrow">{{ parsed.ordered ? '→' : '+' }}</span>
          <span class="bb-chip factor" :style="{ '--c': factorColor(c.id) }" @click="selectFactor(c.id)">{{ factorLabel(c.id) }}</span>
        </template>
        <span v-for="(v, k) in parsed.filters" :key="k" class="bb-tag">{{ k }}: {{ Array.isArray(v) ? v.join('–') : v }}</span>
      </div>
      <div class="ge-results bb-scroll">
        <div v-if="!results.length && queryText" class="bb-muted ge-empty">No accidents match. Try fewer concepts or a different phrasing.</div>
        <div v-for="r in results" :key="r.id" class="ge-result" :class="{ active: r.id === store.selectedId }" @click="selectAccident(r.id)">
          <div class="ge-result-head">
            <span class="ge-result-title">{{ index.byId[r.id].title }}</span>
            <span class="bb-muted bb-num">{{ index.byId[r.id].date.slice(0, 4) }}</span>
          </div>
          <div class="ge-result-sub bb-meta">
            <span class="bb-agency">{{ index.byId[r.id].agency }}</span>
            <span v-if="index.byId[r.id].tier" class="bb-tag">{{ index.byId[r.id].tier === 'ntsb' ? 'NTSB db' : 'Wiki' }}</span>
            {{ index.byId[r.id].aircraft.type }} · {{ phaseLabel(index.byId[r.id].phase) }}
            <span class="ge-score">{{ r.why.fullPath ? 'full path' : r.why.hops ? r.why.hops + ' hop' + (r.why.hops > 1 ? 's' : '') : r.why.concepts.length ? r.why.concepts.length + ' concept' + (r.why.concepts.length > 1 ? 's' : '') : r.why.semantic > 0.3 ? 'semantic' : 'text' }}</span>
          </div>
          <div v-if="r.why.path.length" class="ge-path">
            <template v-for="(f, i) in r.why.path" :key="i">
              <span v-if="i" class="bb-arrow">→</span>
              <span class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span>
            </template>
          </div>
          <div v-else-if="r.why.concepts.length" class="ge-path">
            <span v-for="f in r.why.concepts" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span>
            <span v-for="f in r.why.missing" :key="'m' + f" class="bb-chip ghost" title="not in this record">no {{ factorLabel(f) }}</span>
          </div>
          <div class="ge-snippet">{{ r.why.snippet }}</div>
        </div>
        <div v-if="!queryText" class="ge-empty">
          <div class="bb-h">Try</div>
          <div class="ge-examples">
            <button v-for="ex in examples.slice(0, 5)" :key="ex" class="ge-example" @click="useExample(ex)">{{ ex }}</button>
          </div>
          <div class="bb-h">Filters</div>
          <div class="bb-muted ge-filters">
            <span class="bb-kbd">agency:NTSB</span> <span class="bb-kbd">with:BEA</span> <span class="bb-kbd">phase:approach</span> <span class="bb-kbd">year:1990-2009</span> <span class="bb-kbd">type:737</span> <span class="bb-kbd">fatal:none</span>
          </div>
          <p class="bb-muted ge-help">Concepts in a query are matched to the {{ graph.taxonomy.factors.length }}-factor taxonomy and checked as a causal path against every accident's chain. Or click any node.</p>
        </div>
      </div>
    </div>

    <!-- Center: graph canvas -->
    <div class="ge-center" :class="{ sky: skyOn }">
      <div class="ge-toolbar">
        <div class="bb-seg small" role="group" aria-label="View">
          <button :class="{ active: view === 'graph' }" @click="view = 'graph'">Graph</button>
          <button :class="{ active: view === 'sky' }" @click="view = 'sky'" title="Star chart: factors are stars, causal chains are constellation lines">Constellation</button>
          <button :class="{ active: view === 'orrery' }" @click="view = 'orrery'" title="Each initiating factor becomes a sun and the accidents it started orbit it">Orrery</button>
        </div>
        <button class="bb-btn small" @click="fitGraph">Fit</button>
        <span class="ge-opt-wrap">
          <button class="bb-btn small" :class="{ active: optionsOpen }" @click="optionsOpen = !optionsOpen">Options<span v-if="optionCount" class="ge-count">{{ optionCount }}</span></button>
          <div v-if="optionsOpen" class="bb-popover ge-options" @click.stop>
            <div class="bb-h">Show</div>
            <label class="bb-row"><span>Causal edges</span><input type="checkbox" v-model="showChain" /></label>
            <label class="bb-row"><span>Flow along causal edges</span><input type="checkbox" v-model="flowOn" /></label>
            <label class="bb-row"><span>All accident labels</span><input type="checkbox" v-model="labelsAlways" /></label>
            <label class="bb-row"><span>Focus on the selection <small>only its factors and their close neighbours</small></span><input type="checkbox" v-model="focusMode" /></label>
            <div class="bb-h">Scope</div>
            <label class="bb-row static"><span>Minimum factor use <small>hide factors seen in fewer accidents</small></span><span class="ge-range"><input type="range" min="1" max="12" v-model.number="minCount" /><b class="bb-num">{{ minCount }}</b></span></label>
            <label class="bb-row static"><span>Knowledge as of <small>only accidents up to that year</small></span><span class="ge-range"><input type="range" :min="yearBounds[0]" :max="yearBounds[1]" v-model.number="asOfYear" /><b class="bb-num">{{ asOfYear }}</b></span></label>
          </div>
        </span>
        <span class="ge-legend bb-muted">
          <span class="ge-dot"></span> accident
          <span class="ge-diamond"></span> factor
          <span class="ge-line"></span> causal edge
        </span>
      </div>
      <canvas ref="canvasRef" class="ge-canvas" @mousedown="optionsOpen = false"></canvas>
      <div v-if="tooltip" class="bb-tip" :style="{ left: tooltip.x + 12 + 'px', top: tooltip.y + 12 + 'px' }">
        <b>{{ tooltip.title }}</b>
        <div class="bb-muted">{{ tooltip.sub }}</div>
      </div>
    </div>

    <!-- Right: inspector -->
    <div class="ge-right bb-rail bb-scroll">
      <template v-if="selectedRecord">
        <div class="ge-head">
          <div class="ge-head-tags">
            <span class="bb-agency">{{ selectedRecord.agency }}</span>
            <span v-if="selectedRecord.tier" class="bb-tag">{{ selectedRecord.tier === 'ntsb' ? 'NTSB database' : 'Wikidata' }} · {{ selectedRecord.depth }}</span>
            <span v-else class="bb-tag accent">Reviewed · full report</span>
            <span v-if="selectedRecord.fdr" class="bb-tag">Replay</span>
            <span v-if="selectedRecord.audio && selectedRecord.audio.length" class="bb-tag">Recording</span>
          </div>
          <h3 class="bb-title">{{ selectedRecord.title }}</h3>
          <div class="bb-meta">{{ selectedRecord.date }} · {{ selectedRecord.aircraft.type }} · {{ selectedRecord.operator }}</div>
          <div class="bb-meta">{{ selectedRecord.location?.name }} · {{ phaseLabel(selectedRecord.phase) }} · {{ selectedRecord.category }}</div>
        </div>
        <div class="bb-stats">
          <div class="bb-stat"><b>{{ selectedRecord.fatalities ?? '?' }}</b><span>fatalities</span></div>
          <div class="bb-stat"><b>{{ selectedRecord.occupants ?? '?' }}</b><span>on board</span></div>
          <div class="bb-stat"><b>{{ selectedRecord.factors.length }}</b><span>factors</span></div>
          <div class="bb-stat"><b>{{ selectedRecord.chain.length }}</b><span>causal edges</span></div>
        </div>
        <RecordActions :record="selectedRecord" :index="index" current="graph" />
        <div v-if="selectedRecord.stub" class="bb-muted ge-src">Loading full record…</div>
        <p class="bb-prose ge-summary">{{ selectedRecord.summary }}</p>
        <div v-if="selectedRecord.report_links && selectedRecord.report_links.length && selectedRecord.report_links[0] !== '(see record)'" class="ge-links">
          <a v-for="(l, i) in (selectedRecord.report_links || []).filter((x) => x.startsWith('http'))" :key="i" :href="l" target="_blank" rel="noopener" class="bb-link" :title="l">Report {{ i + 1 }} ↗</a>
        </div>
        <template v-if="selectedRecord.audio && selectedRecord.audio.length">
          <div class="bb-h">Recordings</div>
          <div v-for="(a, i) in uniqueAudio(selectedRecord.audio)" :key="i" class="ge-audio">
            <div class="ge-audio-title"><span class="bb-tag">{{ a.kind === 'cvr' ? 'CVR' : a.kind === 'atc' ? 'ATC' : 'Audio' }}</span> {{ a.title }}</div>
            <audio controls preload="none" :src="a.url"></audio>
            <div class="bb-muted ge-src"><a :href="a.page" target="_blank" rel="noopener" class="bb-link">Wikimedia Commons</a> · {{ a.license }}</div>
          </div>
        </template>
        <div class="bb-h">Causal chain</div>
        <div class="ge-chain">
          <div v-for="(edge, i) in selectedRecord.chain" :key="i" class="ge-chain-row">
            <span class="bb-chip factor" :style="{ '--c': factorColor(edge[0]) }" @click="selectFactor(edge[0])">{{ factorLabel(edge[0]) }}</span>
            <span class="bb-arrow">→</span>
            <span class="bb-chip factor" :style="{ '--c': factorColor(edge[1]) }" @click="selectFactor(edge[1])">{{ factorLabel(edge[1]) }}</span>
          </div>
        </div>
        <div class="bb-h">Factors</div>
        <div v-for="f in selectedRecord.factors" :key="f.id" class="ge-factor">
          <div class="ge-factor-head">
            <span class="bb-chip factor" :style="{ '--c': factorColor(f.id) }" @click="selectFactor(f.id)">{{ factorLabel(f.id) }}</span>
            <span class="bb-tag">{{ f.role }}</span>
            <span v-if="singlePointSet.has(f.id)" class="bb-tag accent" title="Every encoded path from an initiating factor to the outcome runs through this factor: remove it and the chain, as written, breaks.">single point</span>
          </div>
          <div class="bb-muted ge-evidence">{{ f.evidence }}</div>
        </div>
        <div class="bb-h" v-if="selectedRecord.probable_cause">Probable cause</div>
        <p class="bb-prose ge-summary" v-if="selectedRecord.probable_cause">{{ selectedRecord.probable_cause }}</p>
        <div v-if="selectedRecord.dissent && selectedRecord.dissent.length" class="ge-dissent">
          <div class="bb-h">Agency dissent</div>
          <div v-for="(d, i) in selectedRecord.dissent" :key="i" class="ge-dissent-row"><b>{{ d.agency }}</b> <span class="bb-muted">({{ d.topic }})</span> {{ d.position }}</div>
        </div>
        <div class="bb-h">Most similar accidents</div>
        <div v-for="s in similar" :key="s.id" class="ge-similar" @click="selectAccident(s.id)">
          <span class="ge-similar-title">{{ index.byId[s.id].title }}</span>
          <span class="bb-muted">{{ s.shared }} shared{{ s.sharedEdges ? ' · ' + s.sharedEdges + ' edges' : '' }}</span>
        </div>
        <div class="bb-h">Sources</div>
        <div v-for="a in selectedRecord.agencies" :key="a.code" class="bb-muted ge-src">
          {{ a.code }} ({{ a.role.replace(/_/g, ' ') }}) {{ a.report_id ? '· ' + a.report_id : '' }} <a v-if="a.url" :href="a.url" target="_blank" rel="noopener" class="bb-link">report ↗</a>
        </div>
        <div class="bb-muted ge-src">Extraction: {{ selectedRecord.extraction.method }} · confidence {{ selectedRecord.extraction.confidence }}{{ selectedRecord.extraction.reviewed ? ' · reviewed' : '' }}</div>
      </template>
      <template v-else-if="selectedFactor">
        <div class="ge-head">
          <div class="ge-head-tags"><span class="bb-chip factor" :style="{ '--c': factorColor(selectedFactor.id) }">{{ categoryLabel(selectedFactor.category) }}</span></div>
          <h3 class="bb-title">{{ selectedFactor.label }}</h3>
        </div>
        <p class="bb-prose ge-summary">{{ selectedFactor.description }}</p>
        <div class="bb-stats">
          <div class="bb-stat"><b>{{ factorCount(selectedFactor.id) }}</b><span>accidents</span></div>
          <div class="bb-stat"><b>{{ Object.keys(index.stats.predecessors[selectedFactor.id] || {}).length }}</b><span>preceded by</span></div>
          <div class="bb-stat"><b>{{ Object.keys(index.stats.successors[selectedFactor.id] || {}).length }}</b><span>leads to</span></div>
        </div>
        <div class="bb-actions">
          <button class="bb-btn small" @click="queryFactor(selectedFactor.id)">Search this factor</button>
        </div>
        <div class="ge-cut bb-card" v-if="cut">
          <div class="bb-h">If it had been absent</div>
          <div class="ge-cut-line">Appears in <b class="bb-num">{{ cut.contains }}</b> accidents. In <b class="bb-num">{{ cut.severed.length }}</b> of them every encoded path from cause to outcome runs through it: as the chain is written, removing it breaks the accident.</div>
          <div class="ge-cut-bar"><div :style="{ width: (cut.contains ? (cut.severed.length / cut.contains) * 100 : 0) + '%' }"></div></div>
          <div v-for="id in cut.severed.slice(0, 12)" :key="id" class="ge-similar" @click="selectAccident(id)"><span class="ge-similar-title">{{ index.byId[id].title }}</span><span class="bb-muted bb-num">{{ index.byId[id].date.slice(0, 4) }}</span></div>
          <div v-if="cut.severed.length > 12" class="bb-muted ge-src">and {{ cut.severed.length - 12 }} more</div>
        </div>
        <div class="bb-h">What leads to it</div>
        <div class="bb-chipwrap">
          <span v-for="[id, n] in sortedCounts(index.stats.predecessors[selectedFactor.id])" :key="id" class="bb-chip factor" :style="{ '--c': factorColor(id) }" @click="selectFactor(id)">{{ factorLabel(id) }} <b>{{ n }}</b></span>
          <span v-if="!sortedCounts(index.stats.predecessors[selectedFactor.id]).length" class="bb-muted">usually an initiating factor</span>
        </div>
        <div class="bb-h">What it leads to</div>
        <div class="bb-chipwrap">
          <span v-for="[id, n] in sortedCounts(index.stats.successors[selectedFactor.id])" :key="id" class="bb-chip factor" :style="{ '--c': factorColor(id) }" @click="selectFactor(id)">{{ factorLabel(id) }} <b>{{ n }}</b></span>
          <span v-if="!sortedCounts(index.stats.successors[selectedFactor.id]).length" class="bb-muted">terminal outcome</span>
        </div>
        <div class="bb-h">Accidents ({{ factorCount(selectedFactor.id) }})</div>
        <div v-for="r in accidentsWithFactor(selectedFactor.id)" :key="r.id" class="ge-similar" @click="selectAccident(r.id)">
          <span class="ge-similar-title"><span class="bb-agency">{{ r.agency }}</span> {{ r.title }}</span>
          <span class="bb-muted">{{ r.date.slice(0, 4) }} · {{ r.role }}</span>
        </div>
        <div v-if="factorCount(selectedFactor.id) > 60" class="bb-muted ge-src">Showing 60 of {{ factorCount(selectedFactor.id) }}; search "{{ selectedFactor.label.toLowerCase() }}" to rank them.</div>
        <div class="bb-h">Synonyms the parser understands</div>
        <div class="bb-muted ge-syn">{{ selectedFactor.synonyms.join(', ') }}</div>
      </template>
      <div v-else class="bb-muted">Select a node.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { search, similarRecords, cosineMap } from './lib/search.js'
import { ForceGraph } from './lib/forceGraph.js'
import { loadCatalogRecord } from './lib/catalog.js'
import { factorCut, singlePointsCached } from './lib/counterfactual.js'
import { arpeggio } from './lib/synth.js'
import RecordActions from './RecordActions.vue'

const props = defineProps({ graph: Object, index: Object, active: Boolean, catalog: { type: Object, default: () => ({ state: 'idle', count: 0 }) } })
defineEmits(['load-catalog'])
const store = useBlackboxStore()
const detailVersion = ref(0)

const canvasRef = ref(null)
let fg = null
let resizeObserver = null

const queryText = ref(store.query || '')
const results = ref([])
const parsed = ref(null)
const tooltip = ref(null)
const showChain = ref(true)
const flowOn = ref(true)
const view = ref('graph') // graph | sky | orrery
const skyOn = computed(() => view.value !== 'graph')
const orreryOn = computed(() => view.value === 'orrery')
const optionsOpen = ref(false)
const optionCount = computed(() => (showChain.value ? 0 : 1) + (flowOn.value ? 0 : 1) + (labelsAlways.value ? 1 : 0) + (focusMode.value ? 1 : 0) + (minCount.value !== 2 ? 1 : 0) + (asOfYear.value < yearBounds.value[1] ? 1 : 0))
const yearBounds = computed(() => {
  const ys = props.graph.records.map((r) => +r.date.slice(0, 4)).filter(Boolean)
  return [Math.min(...ys), Math.max(...ys)]
})
const asOfYear = ref(2100)
const focusMode = ref(false)
const labelsAlways = ref(false)
const minCount = ref(2)
const selectedFactorId = ref(null)
const statusLine = ref('')

const semanticOn = ref(false)
const semanticStatus = ref('Semantic search: loads a 23 MB sentence-embedding model in your browser (all-MiniLM-L6-v2)')
const semanticState = ref('idle') // idle | loading | ready | error
let embedder = null
let embeddings = null

const examples = [
  'pitot tube blocked led to unreliable airspeed misdiagnosed as a stall',
  'wrong engine shut down',
  'autothrottle mode confusion leading to a low energy approach',
  'maintenance error -> fuel exhaustion -> ditching',
  'somatogravic illusion during go-around',
  'agency:NTSB fatigue approach',
  'design deficiency where agencies dissented',
  'icing fatal:>100'
]

const selectedRecord = computed(() => {
  void detailVersion.value
  return store.selectedId && !selectedFactorId.value ? props.index.byId[store.selectedId] : null
})
const selectedFactor = computed(() => (selectedFactorId.value ? props.index.factorById[selectedFactorId.value] : null))
const similar = computed(() => (selectedRecord.value ? similarRecords(props.index, selectedRecord.value.id) : []))
const singlePointSet = computed(() => new Set(selectedRecord.value && !selectedRecord.value.stub ? singlePointsCached(selectedRecord.value) : []))
const cut = computed(() => (selectedFactor.value ? factorCut(props.index, selectedFactor.value.id) : null))
const semanticLabel = computed(() => (semanticState.value === 'loading' ? 'Semantic… loading' : semanticState.value === 'error' ? 'Semantic unavailable' : semanticOn.value ? 'Semantic ✓' : 'Semantic'))

const agencyColors = { NTSB: '#4c8dff', BEA: '#6ac0ff', AAIB: '#9b7bff', TSB: '#ff7b9c', ATSB: '#2fd4c0', DSB: '#ffa94d' }
const accidentColor = (rec) => agencyColors[rec.agency] || '#8fa3c7'
const factorColor = (id) => {
  const f = props.index.factorById[id]
  return f ? props.graph.taxonomy.categories[f.category]?.color || '#888' : '#888'
}
const factorLabel = (id) => props.index.factorById[id]?.label || id
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
const categoryLabel = (c) => props.graph.taxonomy.categories[c]?.label || c
const phaseLabel = (p) => (p || '').replace(/_/g, ' ')
const factorCount = (id) => props.index.stats.factor_counts[id] || 0
const sortedCounts = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])
const accidentsWithFactor = (id) =>
  props.index.records
    .filter((r) => r.factors.some((f) => f.id === id))
    .map((r) => ({ ...r, role: r.factors.find((f) => f.id === id).role }))
    .sort((a, b) => (b.interest || 0) - (a.interest || 0) || a.date.localeCompare(b.date))
    .slice(0, 60)

function visibleAccidents() {
  // Curated records always; when the catalog is loaded, add the current query's top catalog hits.
  const base = props.graph.records.filter((r) => +r.date.slice(0, 4) <= asOfYear.value)
  if (props.index.stats.catalog > 0 && results.value.length) {
    const curated = new Set(base.map((r) => r.id))
    let added = 0
    for (const r of results.value) {
      if (curated.has(r.id) || added >= 150) continue
      const rec = props.index.byId[r.id]
      if (rec) { base.push(rec); added++ }
    }
  }
  if (store.selectedId && !base.find((r) => r.id === store.selectedId) && props.index.byId[store.selectedId]) base.push(props.index.byId[store.selectedId])
  return base
}

function buildGraphData() {
  let counts = props.index.stats.factor_counts
  if (asOfYear.value < yearBounds.value[1]) {
    counts = {}
    for (const r of props.graph.records) {
      if (+r.date.slice(0, 4) > asOfYear.value) continue
      for (const f of r.factors) counts[f.id] = (counts[f.id] || 0) + 1
    }
  }
  const selected = store.selectedId
  const focusRec = focusMode.value && selected ? props.index.byId[selected] : null
  const focusFactors = focusRec ? new Set(focusRec.factors.map((f) => f.id)) : null
  const scale = props.index.stats.catalog > 0 ? 0.6 : 2.2
  const factorNodes = props.graph.taxonomy.factors
    .filter((f) => (counts[f.id] || 0) >= (focusFactors ? 1 : minCount.value))
    .filter((f) => !focusFactors || focusFactors.has(f.id))
    .map((f) => ({ id: f.id, kind: 'factor', label: f.label, color: props.graph.taxonomy.categories[f.category]?.color || '#888', r: 5 + Math.min(10, Math.sqrt(counts[f.id] || 1) * scale) }))
  const factorSet = new Set(factorNodes.map((n) => n.id))
  const accidents = visibleAccidents()
  const accidentNodes = accidents
    .filter((r) => !focusRec || r.id === focusRec.id || (focusFactors && r.factors.filter((f) => focusFactors.has(f.id)).length >= 3))
    .map((r) => ({ id: r.id, kind: 'accident', label: r.title, color: r.tier ? (r.tier === 'ntsb' ? '#7f8fa8' : '#b9c7e6') : accidentColor(r), r: 4 + Math.min(6, Math.sqrt((r.fatalities || 0) / 20)) }))
  const nodeIds = new Set(accidentNodes.map((n) => n.id))
  const links = []
  for (const r of accidents) {
    if (!nodeIds.has(r.id)) continue
    for (const f of r.factors) if (factorSet.has(f.id)) links.push({ source: r.id, target: f.id, kind: 'has' })
  }
  for (const e of props.index.stats.chain_edges) {
    if (factorSet.has(e.from) && factorSet.has(e.to)) links.push({ source: e.from, target: e.to, kind: 'chain', weight: e.n })
  }
  return { nodes: [...factorNodes, ...accidentNodes], links }
}

function refreshGraph() {
  if (!fg) return
  const { nodes, links } = buildGraphData()
  fg.setData(nodes, links)
  fg.showChain = showChain.value
  fg.labelsAlways = labelsAlways.value
  applyHighlight()
  if (orreryOn.value) applyOrrery()
  else setTimeout(() => fg && fg.fit(), 600)
}
/** Each accident orbits its initiating factor (first chain source, else first initiating-role factor). */
function applyOrrery() {
  if (!fg) return
  if (!orreryOn.value) { fg.setOrrery(null); return }
  const assign = new Map()
  for (const r of visibleAccidents()) {
    let fid = null
    const init = r.factors.find((f) => f.role === 'initiating')
    if (init) fid = init.id
    else if (r.chain && r.chain.length) fid = r.chain[0][0]
    if (fid && fg.nodeById[fid] && fg.nodeById[r.id]) assign.set(r.id, fid)
  }
  fg.setOrrery(assign)
}

function applyHighlight() {
  if (!fg) return
  fg.selected = selectedFactorId.value ? fg.nodeById[selectedFactorId.value] : store.selectedId ? fg.nodeById[store.selectedId] : null
  if (results.value.length && queryText.value) {
    const hi = new Set()
    const emph = new Set()
    for (const r of results.value) {
      hi.add(r.id)
      for (const c of r.why.concepts) hi.add(c)
      for (let i = 0; i < r.why.path.length; i++) {
        hi.add(r.why.path[i])
        if (i) emph.add(`${r.why.path[i - 1]}>${r.why.path[i]}`)
      }
    }
    fg.highlight = hi
    fg.emphasisLinks = emph
  } else {
    fg.highlight = null
    fg.emphasisLinks = null
  }
  fg.draw()
}

async function runQuery() {
  store.query = queryText.value
  if (!queryText.value.trim()) {
    results.value = []
    parsed.value = null
    applyHighlight()
    return
  }
  let semantic = null
  if (semanticOn.value && embedder && embeddings) {
    try {
      const out = await embedder(queryText.value, { pooling: 'mean', normalize: true })
      semantic = cosineMap(Array.from(out.data), embeddings)
    } catch (e) {
      semanticStatus.value = 'Semantic query failed: ' + e.message
    }
  }
  const res = search(props.index, queryText.value, { semantic, limit: 200 })
  results.value = res.results
  parsed.value = res.query
  statusLine.value = `${res.total.toLocaleString()} match${res.total === 1 ? '' : 'es'}${semantic ? ' · hybrid' : ''}`
  // A query's concepts play as a short arpeggio: one note per factor, pitched by category
  if (store.sound && res.query.concepts.length) {
    const cats = Object.keys(props.graph.taxonomy.categories)
    arpeggio(res.query.concepts.map((c, i) => cats.indexOf(props.index.factorById[c.id]?.category) * 2 + i + 3), { root: 196, gap: 0.14 })
  }
  if (res.results.length) {
    selectedFactorId.value = null
    selectAccident(res.results[0].id, false)
  }
  if (props.index.stats.catalog > 0) refreshGraph()
  else applyHighlight()
}

function clearQuery() {
  queryText.value = ''
  runQuery()
}
function useExample(ex) {
  queryText.value = ex
  runQuery()
}
function queryFactor(id) {
  queryText.value = props.index.factorById[id].label.toLowerCase()
  runQuery()
}
async function selectAccident(id, center = true) {
  selectedFactorId.value = null
  store.selectedId = id
  applyHighlight()
  if (center && fg) fg.centerOn(id)
  const rec = props.index.byId[id]
  if (rec && rec.stub) {
    const full = await loadCatalogRecord(id, rec.date)
    if (full) {
      Object.assign(rec, full, { stub: false })
      detailVersion.value++
    }
  }
}
function selectFactor(id) {
  selectedFactorId.value = id
  applyHighlight()
  fg && fg.centerOn(id)
}
function fitGraph() {
  fg && fg.fit()
}

async function toggleSemantic() {
  if (semanticOn.value) {
    semanticOn.value = false
    runQuery()
    return
  }
  if (semanticState.value === 'ready') {
    semanticOn.value = true
    runQuery()
    return
  }
  if (semanticState.value === 'loading') return
  semanticState.value = 'loading'
  semanticStatus.value = 'Downloading model…'
  try {
    const [{ pipeline, env }, embMod] = await Promise.all([import('@huggingface/transformers'), import('@/data/blackbox/embeddings.json')])
    env.allowLocalModels = false
    embeddings = embMod.default
    embedder = await pipeline('feature-extraction', embeddings.model, { dtype: 'q8' })
    semanticState.value = 'ready'
    semanticOn.value = true
    semanticStatus.value = 'Semantic search ready (all-MiniLM-L6-v2, runs locally in your browser)'
    runQuery()
  } catch (e) {
    semanticState.value = 'error'
    semanticStatus.value = 'Could not load the embedding model: ' + e.message
  }
}

watch([showChain, labelsAlways, flowOn, skyOn], () => {
  if (!fg) return
  fg.showChain = showChain.value
  fg.labelsAlways = labelsAlways.value
  fg.flow = flowOn.value
  fg.sky = skyOn.value
  flowOn.value || skyOn.value ? fg.startFlow() : fg.stopFlow()
  fg.draw()
})
watch([minCount, focusMode, asOfYear], refreshGraph)
watch(orreryOn, (on) => { if (!on) { fg && fg.setOrrery(null); setTimeout(() => fg && fg.fit(), 700) } else applyOrrery() })
watch(() => store.selectedId, () => {
  if (focusMode.value) refreshGraph()
  else applyHighlight()
})
watch(() => props.index, () => {
  delete props.index._cutCache
  refreshGraph()
  if (queryText.value) runQuery()
})
watch(() => store.query, (q) => {
  if (q !== queryText.value) {
    queryText.value = q
    runQuery()
  }
})
watch(() => props.active, async (a) => {
  if (a) {
    await nextTick()
    fg && fg.resize()
    fg && fg.reheat(0.05)
  }
  fg && fg.setActive(a)
})

onMounted(() => {
  asOfYear.value = yearBounds.value[1]
  fg = new ForceGraph(canvasRef.value, {
    onHover: (n, p) => {
      if (!n) { tooltip.value = null; return }
      const rec = n.kind === 'accident' ? props.index.byId[n.id] : null
      tooltip.value = {
        x: p.x, y: p.y,
        title: n.label,
        sub: rec ? `${rec.date} · ${rec.aircraft.type} · ${rec.agency} · ${rec.fatalities ?? '?'} fatalities` : `${categoryLabel(props.index.factorById[n.id].category)} · in ${factorCount(n.id)} accidents`
      }
    },
    onClick: (n) => (n.kind === 'accident' ? selectAccident(n.id) : selectFactor(n.id)),
    onBackgroundClick: () => {}
  })
  resizeObserver = new ResizeObserver(() => fg && fg.resize())
  resizeObserver.observe(canvasRef.value.parentElement)
  fg.resize()
  refreshGraph()
  if (queryText.value) runQuery()
})

onBeforeUnmount(() => {
  resizeObserver && resizeObserver.disconnect()
  fg && fg.destroy()
  fg = null
})
</script>

<style scoped>
.ge-root { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(280px, 28%) 1fr minmax(280px, 26%); }
.ge-left { border-right: 1px solid var(--bb-line); }
.ge-right { border-left: 1px solid var(--bb-line); padding: var(--bb-pad); overflow: auto; }
.ge-search { padding: var(--bb-pad) var(--bb-pad) 8px; }
.ge-clear { position: absolute; right: 4px; top: 4px; width: 20px; height: 20px; border: none; background: transparent; color: var(--bb-muted); font-size: 15px; cursor: pointer; border-radius: 3px; }
.ge-clear:hover { color: var(--bb-text); background: var(--bb-panel-3); }
.ge-search-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.ge-status { margin-left: auto; font-size: 10.5px; white-space: nowrap; }
.ge-parsed { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 0 var(--bb-pad) 8px; font-size: 10.5px; }
.ge-results { flex: 1; min-height: 0; overflow: auto; border-top: 1px solid var(--bb-line); }
.ge-result { padding: 8px var(--bb-pad); border-bottom: 1px solid var(--bb-line); cursor: pointer; }
.ge-result:hover { background: var(--bb-panel-2); }
.ge-result.active { background: var(--bb-panel-3); box-shadow: inset 2px 0 0 var(--bb-accent); }
.ge-result-head { display: flex; gap: 8px; align-items: baseline; }
.ge-result-title { font-weight: 600; flex: 1; }
.ge-result-sub { display: flex; gap: 5px; align-items: center; margin-top: 3px; flex-wrap: wrap; }
.ge-score { margin-left: auto; font-size: 10px; color: var(--bb-muted); }
.ge-path { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-top: 6px; }
.ge-snippet { font-size: 11px; color: var(--bb-muted); margin-top: 5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ge-empty { padding: var(--bb-pad); line-height: 1.5; }
.ge-examples { display: flex; flex-direction: column; gap: 2px; }
.ge-example { text-align: left; background: transparent; border: none; color: var(--bb-text-2); font: inherit; font-size: 11.5px; padding: 4px 0; cursor: pointer; }
.ge-example:hover { color: var(--bb-accent); }
.ge-filters { display: flex; flex-wrap: wrap; gap: 4px; }
.ge-help { font-size: 11px; margin: 10px 0 0; }

.ge-center { position: relative; background: var(--bb-bg); min-width: 0; transition: background 1s; }
.ge-center.sky { background: radial-gradient(ellipse at 30% 40%, #0d1230 0%, #04060e 55%, #02030a 100%); }
.ge-toolbar { position: absolute; top: 8px; left: 10px; right: 10px; z-index: 2; display: flex; gap: 6px; align-items: center; }
.ge-opt-wrap { position: relative; }
.ge-count { margin-left: 6px; font-size: 9.5px; color: var(--bb-accent); }
.ge-options { top: 30px; left: 0; width: 290px; }
.ge-range { display: flex; align-items: center; gap: 8px; }
.ge-range input { width: 90px; }
.ge-range b { font-weight: 500; min-width: 30px; text-align: right; font-size: 11px; }
.ge-legend { margin-left: auto; display: flex; gap: 6px; align-items: center; font-size: 10.5px; }
.ge-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: #62a0ff; }
.ge-diamond { width: 7px; height: 7px; background: #e4572e; transform: rotate(45deg); display: inline-block; margin-left: 6px; }
.ge-line { width: 16px; height: 2px; background: #ff9628; display: inline-block; margin-left: 6px; }
.ge-canvas { width: 100%; height: 100%; display: block; cursor: grab; }

.ge-head { display: flex; flex-direction: column; gap: 4px; }
.ge-head-tags { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.ge-summary { margin: 8px 0; }
.ge-links { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 6px; font-size: 11px; }
.ge-audio { margin-bottom: 8px; }
.ge-audio-title { font-size: 11px; color: var(--bb-text-2); margin-bottom: 4px; }
.ge-chain-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.ge-factor { margin-bottom: 8px; }
.ge-factor-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ge-evidence { font-size: 11px; line-height: 1.4; margin-top: 3px; }
.ge-dissent { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(255, 159, 67, 0.35); border-radius: var(--bb-radius-lg); font-size: 11.5px; line-height: 1.45; }
.ge-dissent .bb-h { color: var(--bb-warn); }
.ge-dissent-row { margin-bottom: 4px; }
.ge-similar { display: flex; justify-content: space-between; gap: 8px; cursor: pointer; padding: 5px 0; border-bottom: 1px solid var(--bb-line); font-size: 11.5px; }
.ge-similar:hover .ge-similar-title { color: var(--bb-accent); }
.ge-similar-title { flex: 1; min-width: 0; }
.ge-similar .bb-muted { white-space: nowrap; font-size: 10.5px; }
.ge-src { font-size: 10.5px; margin-bottom: 3px; line-height: 1.4; }
.ge-cut { margin: 10px 0; }
.ge-cut-line { font-size: 11.5px; line-height: 1.45; color: var(--bb-text-2); }
.ge-cut-bar { height: 4px; background: var(--bb-panel-3); border-radius: 2px; margin: 8px 0; overflow: hidden; }
.ge-cut-bar div { height: 100%; background: var(--bb-accent); }
.ge-syn { font-size: 11px; line-height: 1.45; }
@media (max-width: 900px) {
  .ge-root { grid-template-columns: 1fr; grid-template-rows: 40% 35% 25%; }
  .ge-right { border-left: none; border-top: 1px solid var(--bb-line); }
}
</style>
