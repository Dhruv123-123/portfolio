<template>
  <div class="ge-root">
    <!-- Left: query + results -->
    <div class="ge-left">
      <form class="ge-search" @submit.prevent="runQuery">
        <input v-model="queryText" class="bb-input" placeholder="Ask the graph: e.g. pitot icing led to unreliable airspeed misdiagnosed as a stall" spellcheck="false" />
        <div class="ge-search-row">
          <button class="bb-btn small" type="submit">Search</button>
          <button class="bb-btn small" type="button" @click="clearQuery" :disabled="!queryText">Clear</button>
          <button class="bb-btn small" type="button" :class="{ active: semanticOn }" @click="toggleSemantic" :title="semanticStatus">
            {{ semanticLabel }}
          </button>
          <span class="bb-muted ge-status">{{ statusLine }}</span>
        </div>
      </form>
      <div class="ge-examples">
        <span class="bb-chip ghost" v-for="ex in examples" :key="ex" @click="useExample(ex)">{{ ex }}</span>
      </div>
      <div v-if="parsed && (parsed.concepts.length || Object.keys(parsed.filters).length)" class="ge-parsed">
        <span class="bb-muted">Understood as</span>
        <template v-for="(c, i) in parsed.concepts" :key="i">
          <span v-if="i" class="ge-arrow">{{ parsed.ordered ? '→' : '+' }}</span>
          <span class="bb-chip factor" :style="{ background: factorColor(c.id) }" @click="selectFactor(c.id)">{{ factorLabel(c.id) }}</span>
        </template>
        <span v-for="(v, k) in parsed.filters" :key="k" class="bb-chip ghost">{{ k }}: {{ Array.isArray(v) ? v.join('–') : v }}</span>
      </div>
      <div class="ge-results bb-scroll">
        <div v-if="!results.length && queryText" class="bb-muted ge-empty">No accidents match. Try fewer concepts or a different phrasing.</div>
        <div v-for="r in results" :key="r.id" class="ge-result" :class="{ active: r.id === store.selectedId }" @click="selectAccident(r.id)">
          <div class="ge-result-head">
            <span class="bb-agency">{{ index.byId[r.id].agency }}</span>
            <span class="ge-result-title">{{ index.byId[r.id].title }}</span>
            <span class="bb-muted">{{ index.byId[r.id].date.slice(0, 4) }}</span>
            <span class="ge-score" :title="'score ' + r.score.toFixed(2)">{{ r.why.fullPath ? 'FULL PATH' : r.why.hops ? r.why.hops + ' hop' + (r.why.hops > 1 ? 's' : '') : r.why.concepts.length ? r.why.concepts.length + ' concept' + (r.why.concepts.length > 1 ? 's' : '') : r.why.semantic > 0.3 ? 'semantic' : 'text' }}</span>
          </div>
          <div class="ge-result-sub bb-muted">{{ index.byId[r.id].aircraft.type }} · {{ index.byId[r.id].operator }} · {{ index.byId[r.id].phase }}</div>
          <div v-if="r.why.path.length" class="ge-path">
            <template v-for="(f, i) in r.why.path" :key="i">
              <span v-if="i" class="ge-arrow">→</span>
              <span class="bb-chip factor" :style="{ background: factorColor(f) }">{{ factorLabel(f) }}</span>
            </template>
          </div>
          <div v-else-if="r.why.concepts.length" class="ge-path">
            <span v-for="f in r.why.concepts" :key="f" class="bb-chip factor" :style="{ background: factorColor(f) }">{{ factorLabel(f) }}</span>
            <span v-for="f in r.why.missing" :key="'m' + f" class="bb-chip ghost" title="not in this record">no {{ factorLabel(f) }}</span>
          </div>
          <div class="ge-snippet">{{ r.why.snippet }}</div>
        </div>
        <div v-if="!queryText" class="ge-empty bb-muted">
          Type a question, or click a node. Concepts in your query are matched to the {{ graph.taxonomy.factors.length }}-factor taxonomy and checked as a causal path against every accident's chain.
          Filters: <span class="bb-kbd">agency:NTSB</span> <span class="bb-kbd">with:BEA</span> <span class="bb-kbd">phase:approach</span> <span class="bb-kbd">year:1990-2009</span> <span class="bb-kbd">type:737</span> <span class="bb-kbd">fatal:none</span>
        </div>
      </div>
    </div>

    <!-- Center: graph canvas -->
    <div class="ge-center">
      <div class="ge-toolbar">
        <label><input type="checkbox" v-model="showChain" /> causal edges</label>
        <label><input type="checkbox" v-model="focusMode" /> focus on selection</label>
        <label><input type="checkbox" v-model="labelsAlways" /> all labels</label>
        <label>min factor use <input type="range" min="1" max="12" v-model.number="minCount" /> {{ minCount }}</label>
        <button class="bb-btn small" @click="fitGraph">Fit</button>
        <span class="bb-muted ge-legend">
          <span class="ge-dot" style="background:#4c8dff"></span> accident
          <span class="ge-diamond"></span> factor
          <span class="ge-line"></span> causal (n)
        </span>
      </div>
      <canvas ref="canvasRef" class="ge-canvas"></canvas>
      <div v-if="tooltip" class="ge-tooltip" :style="{ left: tooltip.x + 12 + 'px', top: tooltip.y + 12 + 'px' }">
        <div class="ge-tooltip-title">{{ tooltip.title }}</div>
        <div class="bb-muted">{{ tooltip.sub }}</div>
      </div>
    </div>

    <!-- Right: detail -->
    <div class="ge-right bb-scroll">
      <template v-if="selectedRecord">
        <div class="ge-detail-head">
          <span class="bb-agency">{{ selectedRecord.agency }}</span>
          <h3>{{ selectedRecord.title }}</h3>
        </div>
        <div class="bb-muted">{{ selectedRecord.date }} · {{ selectedRecord.aircraft.type }} · {{ selectedRecord.operator }}</div>
        <div class="bb-muted">{{ selectedRecord.location?.name }} · {{ phaseLabel(selectedRecord.phase) }} · {{ selectedRecord.category }}</div>
        <div class="ge-stats">
          <div><b>{{ selectedRecord.fatalities ?? '?' }}</b><span>fatalities</span></div>
          <div><b>{{ selectedRecord.occupants ?? '?' }}</b><span>on board</span></div>
          <div><b>{{ selectedRecord.factors.length }}</b><span>factors</span></div>
          <div><b>{{ selectedRecord.chain.length }}</b><span>causal edges</span></div>
        </div>
        <div class="ge-actions">
          <button class="bb-btn" @click="store.openTimeline(selectedRecord.id)">Timeline ▸</button>
          <button class="bb-btn" :disabled="!selectedRecord.fdr" @click="store.openReplay(selectedRecord.id)">FDR replay ▸</button>
        </div>
        <p class="ge-summary">{{ selectedRecord.summary }}</p>
        <div class="bb-h">Causal chain</div>
        <div class="ge-chain">
          <div v-for="(edge, i) in selectedRecord.chain" :key="i" class="ge-chain-row">
            <span class="bb-chip factor" :style="{ background: factorColor(edge[0]) }" @click="selectFactor(edge[0])">{{ factorLabel(edge[0]) }}</span>
            <span class="ge-arrow">→</span>
            <span class="bb-chip factor" :style="{ background: factorColor(edge[1]) }" @click="selectFactor(edge[1])">{{ factorLabel(edge[1]) }}</span>
          </div>
        </div>
        <div class="bb-h">Factors</div>
        <div v-for="f in selectedRecord.factors" :key="f.id" class="ge-factor">
          <span class="bb-chip factor" :style="{ background: factorColor(f.id) }" @click="selectFactor(f.id)">{{ factorLabel(f.id) }}</span>
          <span class="ge-role">{{ f.role }}</span>
          <div class="bb-muted ge-evidence">{{ f.evidence }}</div>
        </div>
        <div class="bb-h">Probable cause</div>
        <p class="ge-summary">{{ selectedRecord.probable_cause }}</p>
        <div v-if="selectedRecord.dissent && selectedRecord.dissent.length" class="ge-dissent">
          <div class="bb-h" style="color:#ff9f43">Agency dissent</div>
          <div v-for="(d, i) in selectedRecord.dissent" :key="i"><b>{{ d.agency }}</b> <span class="bb-muted">({{ d.topic }})</span>: {{ d.position }}</div>
        </div>
        <div class="bb-h">Most similar accidents</div>
        <div v-for="s in similar" :key="s.id" class="ge-similar" @click="selectAccident(s.id)">
          <span class="bb-agency">{{ index.byId[s.id].agency }}</span> {{ index.byId[s.id].title }} <span class="bb-muted">· {{ s.shared }} shared factors{{ s.sharedEdges ? ', ' + s.sharedEdges + ' shared edges' : '' }}</span>
        </div>
        <div class="bb-h">Sources</div>
        <div v-for="a in selectedRecord.agencies" :key="a.code" class="bb-muted ge-src">
          {{ a.code }} ({{ a.role.replace(/_/g, ' ') }}) {{ a.report_id ? '· ' + a.report_id : '' }} <a v-if="a.url" :href="a.url" target="_blank" rel="noopener" class="bb-link">report</a>
        </div>
        <div class="bb-muted ge-src">Extraction: {{ selectedRecord.extraction.method }} · confidence {{ selectedRecord.extraction.confidence }}{{ selectedRecord.extraction.reviewed ? ' · reviewed' : '' }}</div>
      </template>
      <template v-else-if="selectedFactor">
        <div class="ge-detail-head">
          <span class="bb-chip factor" :style="{ background: factorColor(selectedFactor.id) }">{{ categoryLabel(selectedFactor.category) }}</span>
          <h3>{{ selectedFactor.label }}</h3>
        </div>
        <p class="ge-summary">{{ selectedFactor.description }}</p>
        <div class="ge-stats">
          <div><b>{{ factorCount(selectedFactor.id) }}</b><span>accidents</span></div>
          <div><b>{{ Object.keys(graph.stats.predecessors[selectedFactor.id] || {}).length }}</b><span>preceded by</span></div>
          <div><b>{{ Object.keys(graph.stats.successors[selectedFactor.id] || {}).length }}</b><span>leads to</span></div>
        </div>
        <div class="ge-actions">
          <button class="bb-btn" @click="queryFactor(selectedFactor.id)">Search this factor</button>
        </div>
        <div class="bb-h">What leads to it (count)</div>
        <div class="ge-chipwrap">
          <span v-for="[id, n] in sortedCounts(graph.stats.predecessors[selectedFactor.id])" :key="id" class="bb-chip factor" :style="{ background: factorColor(id) }" @click="selectFactor(id)">{{ factorLabel(id) }} <b>{{ n }}</b></span>
          <span v-if="!sortedCounts(graph.stats.predecessors[selectedFactor.id]).length" class="bb-muted">usually an initiating factor</span>
        </div>
        <div class="bb-h">What it leads to (count)</div>
        <div class="ge-chipwrap">
          <span v-for="[id, n] in sortedCounts(graph.stats.successors[selectedFactor.id])" :key="id" class="bb-chip factor" :style="{ background: factorColor(id) }" @click="selectFactor(id)">{{ factorLabel(id) }} <b>{{ n }}</b></span>
          <span v-if="!sortedCounts(graph.stats.successors[selectedFactor.id]).length" class="bb-muted">terminal outcome</span>
        </div>
        <div class="bb-h">Accidents</div>
        <div v-for="r in accidentsWithFactor(selectedFactor.id)" :key="r.id" class="ge-similar" @click="selectAccident(r.id)">
          <span class="bb-agency">{{ r.agency }}</span> {{ r.title }} <span class="bb-muted">· {{ r.date.slice(0, 4) }} · {{ r.role }}</span>
        </div>
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
import { search, parseQuery, similarRecords, cosineMap } from './lib/search.js'
import { ForceGraph } from './lib/forceGraph.js'

const props = defineProps({ graph: Object, index: Object, active: Boolean })
const store = useBlackboxStore()

const canvasRef = ref(null)
let fg = null
let resizeObserver = null

const queryText = ref(store.query || '')
const results = ref([])
const parsed = ref(null)
const tooltip = ref(null)
const showChain = ref(true)
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

const selectedRecord = computed(() => (store.selectedId && !selectedFactorId.value ? props.index.byId[store.selectedId] : null))
const selectedFactor = computed(() => (selectedFactorId.value ? props.index.factorById[selectedFactorId.value] : null))
const similar = computed(() => (selectedRecord.value ? similarRecords(props.index, selectedRecord.value.id) : []))
const semanticLabel = computed(() => (semanticState.value === 'loading' ? 'Semantic… loading' : semanticState.value === 'error' ? 'Semantic unavailable' : semanticOn.value ? 'Semantic ✓' : 'Semantic'))

const agencyColors = { NTSB: '#4c8dff', BEA: '#6ac0ff', AAIB: '#9b7bff', TSB: '#ff7b9c', ATSB: '#2fd4c0', DSB: '#ffa94d' }
const accidentColor = (rec) => agencyColors[rec.agency] || '#8fa3c7'
const factorColor = (id) => {
  const f = props.index.factorById[id]
  return f ? props.graph.taxonomy.categories[f.category]?.color || '#888' : '#888'
}
const factorLabel = (id) => props.index.factorById[id]?.label || id
const categoryLabel = (c) => props.graph.taxonomy.categories[c]?.label || c
const phaseLabel = (p) => (p || '').replace(/_/g, ' ')
const factorCount = (id) => props.graph.stats.factor_counts[id] || 0
const sortedCounts = (obj) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1])
const accidentsWithFactor = (id) =>
  props.graph.records
    .filter((r) => r.factors.some((f) => f.id === id))
    .map((r) => ({ ...r, role: r.factors.find((f) => f.id === id).role }))
    .sort((a, b) => a.date.localeCompare(b.date))

function buildGraphData() {
  const counts = props.graph.stats.factor_counts
  const selected = store.selectedId
  const focusRec = focusMode.value && selected ? props.index.byId[selected] : null
  const focusFactors = focusRec ? new Set(focusRec.factors.map((f) => f.id)) : null
  const factorNodes = props.graph.taxonomy.factors
    .filter((f) => (counts[f.id] || 0) >= (focusFactors ? 1 : minCount.value))
    .filter((f) => !focusFactors || focusFactors.has(f.id))
    .map((f) => ({ id: f.id, kind: 'factor', label: f.label, color: props.graph.taxonomy.categories[f.category]?.color || '#888', r: 5 + Math.min(10, Math.sqrt(counts[f.id] || 1) * 2.2) }))
  const factorSet = new Set(factorNodes.map((n) => n.id))
  const accidentNodes = props.graph.records
    .filter((r) => !focusRec || r.id === focusRec.id || (focusFactors && r.factors.filter((f) => focusFactors.has(f.id)).length >= 3))
    .map((r) => ({ id: r.id, kind: 'accident', label: r.title, color: accidentColor(r), r: 4 + Math.min(6, Math.sqrt((r.fatalities || 0) / 20)) }))
  const links = []
  for (const r of props.graph.records) {
    if (!accidentNodes.find((n) => n.id === r.id)) continue
    for (const f of r.factors) if (factorSet.has(f.id)) links.push({ source: r.id, target: f.id, kind: 'has' })
  }
  for (const e of props.graph.stats.chain_edges) {
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
  setTimeout(() => fg && fg.fit(), 600)
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
  const res = search(props.index, queryText.value, { semantic })
  results.value = res.results
  parsed.value = res.query
  statusLine.value = `${res.total} match${res.total === 1 ? '' : 'es'}${semantic ? ' · hybrid' : ''}`
  if (res.results.length) {
    selectedFactorId.value = null
    store.selectedId = res.results[0].id
  }
  applyHighlight()
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
function selectAccident(id) {
  selectedFactorId.value = null
  store.selectedId = id
  applyHighlight()
  fg && fg.centerOn(id)
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

watch([showChain, labelsAlways], () => {
  if (!fg) return
  fg.showChain = showChain.value
  fg.labelsAlways = labelsAlways.value
  fg.draw()
})
watch([minCount, focusMode], refreshGraph)
watch(() => store.selectedId, () => {
  if (focusMode.value) refreshGraph()
  else applyHighlight()
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
})

onMounted(() => {
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
.ge-root { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(260px, 30%) 1fr minmax(240px, 27%); }
.ge-left, .ge-right { background: var(--bb-panel); border-right: 1px solid var(--bb-line); display: flex; flex-direction: column; min-height: 0; }
.ge-right { border-right: none; border-left: 1px solid var(--bb-line); padding: 10px 12px; overflow: auto; }
.ge-search { padding: 10px 10px 4px; }
.ge-search-row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.ge-status { margin-left: auto; font-size: 10px; }
.ge-examples { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px 8px; }
.ge-parsed { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; padding: 0 10px 8px; font-size: 10px; }
.ge-arrow { color: var(--bb-accent); font-weight: 700; }
.ge-results { flex: 1; min-height: 0; overflow: auto; border-top: 1px solid var(--bb-line); }
.ge-result { padding: 8px 10px; border-bottom: 1px solid var(--bb-line); cursor: pointer; }
.ge-result:hover { background: var(--bb-panel-2); }
.ge-result.active { background: #1c2a45; box-shadow: inset 3px 0 0 var(--bb-accent); }
.ge-result-head { display: flex; gap: 6px; align-items: center; }
.ge-result-title { font-weight: 700; flex: 1; }
.ge-score { font-size: 9px; color: var(--bb-accent); letter-spacing: 0.05em; }
.ge-result-sub { font-size: 10px; margin-top: 2px; }
.ge-path { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; margin-top: 5px; }
.ge-snippet { font-size: 10px; color: #b8c6e3; margin-top: 5px; line-height: 1.35; }
.ge-empty { padding: 10px; line-height: 1.5; }
.ge-center { position: relative; background: radial-gradient(ellipse at center, #0f1626 0%, #070a12 100%); min-width: 0; }
.ge-toolbar { position: absolute; top: 6px; left: 8px; right: 8px; z-index: 2; display: flex; gap: 12px; align-items: center; font-size: 10px; color: var(--bb-muted); flex-wrap: wrap; }
.ge-toolbar label { display: flex; align-items: center; gap: 4px; }
.ge-toolbar input[type='range'] { width: 70px; }
.ge-legend { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.ge-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ge-diamond { width: 8px; height: 8px; background: #e4572e; transform: rotate(45deg); display: inline-block; }
.ge-line { width: 18px; height: 2px; background: #ff9628; display: inline-block; }
.ge-canvas { width: 100%; height: 100%; display: block; cursor: grab; }
.ge-tooltip { position: absolute; pointer-events: none; background: rgba(8, 12, 24, 0.95); border: 1px solid var(--bb-line); padding: 6px 8px; border-radius: 4px; font-size: 11px; max-width: 260px; z-index: 3; }
.ge-tooltip-title { font-weight: 700; }
.ge-detail-head { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.ge-detail-head h3 { font-size: 15px; margin: 0; }
.ge-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; }
.ge-stats div { background: var(--bb-panel-2); border: 1px solid var(--bb-line); border-radius: 4px; padding: 6px 4px; text-align: center; display: flex; flex-direction: column; }
.ge-stats b { font-size: 15px; }
.ge-stats span { font-size: 9px; color: var(--bb-muted); }
.ge-actions { display: flex; gap: 6px; margin-bottom: 6px; }
.ge-summary { line-height: 1.45; margin: 4px 0; color: #d3ddf0; }
.ge-chain-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 3px; }
.ge-factor { margin-bottom: 6px; }
.ge-role { font-size: 9px; color: var(--bb-accent); margin-left: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.ge-evidence { font-size: 10px; line-height: 1.35; margin-top: 2px; }
.ge-dissent { background: #2a1d10; border: 1px solid #5a3d1a; border-radius: 4px; padding: 4px 8px 8px; margin-top: 8px; line-height: 1.4; }
.ge-similar { cursor: pointer; padding: 3px 0; border-bottom: 1px dashed var(--bb-line); }
.ge-similar:hover { color: var(--bb-accent); }
.ge-src { font-size: 10px; margin-bottom: 2px; }
.ge-chipwrap { display: flex; flex-wrap: wrap; gap: 4px; }
.ge-syn { font-size: 10px; line-height: 1.4; }
@media (max-width: 900px) {
  .ge-root { grid-template-columns: 1fr; grid-template-rows: 40% 35% 25%; }
  .ge-right { border-left: none; border-top: 1px solid var(--bb-line); }
}
</style>
