<template>
  <div class="bb-root">
    <div class="bb-tabs">
      <div class="bb-brand">
        <span class="bb-brand-dot"></span>
        BLACKBOX
        <span class="bb-brand-sub" v-if="graph">{{ graph.records.length }} curated · {{ catalog.state === 'ready' ? catalog.count.toLocaleString() + ' catalog · ' : '' }}{{ fdrCount }} replays</span>
      </div>
      <button v-for="t in tabs" :key="t.id" class="bb-tab" :class="{ active: store.tab === t.id }" @click="store.tab = t.id">
        <span class="bb-tab-key">{{ t.key }}</span>{{ t.label }}
      </button>
    </div>
    <div class="bb-body">
      <div v-if="error" class="bb-center bb-error">Failed to load corpus: {{ error }}</div>
      <div v-else-if="!graph" class="bb-center">
        <div class="bb-spinner"></div>
        <div>Loading accident corpus…</div>
      </div>
      <template v-else>
        <GraphExplorer v-show="store.tab === 'graph'" :graph="graph" :index="index" :active="store.tab === 'graph'" :catalog="catalog" @load-catalog="loadCatalog" />
        <FdrReplay v-if="store.tab === 'replay'" :graph="graph" :index="index" />
        <TimelineBuilder v-show="store.tab === 'timeline'" :graph="graph" :index="index" :active="store.tab === 'timeline'" />
        <AboutPanel v-show="store.tab === 'about'" :graph="graph" :index="index" :catalog="catalog" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { buildIndex } from './lib/search.js'
import { loadCatalogIndex, rowToStub } from './lib/catalog.js'
import GraphExplorer from './GraphExplorer.vue'
import FdrReplay from './FdrReplay.vue'
import TimelineBuilder from './TimelineBuilder.vue'
import AboutPanel from './AboutPanel.vue'

const store = useBlackboxStore()
const graph = shallowRef(null)
const index = shallowRef(null)
const error = ref(null)
const catalog = ref({ state: 'idle', count: 0, tiers: {}, error: null })

async function loadCatalog() {
  if (catalog.value.state === 'loading' || catalog.value.state === 'ready') return
  catalog.value = { ...catalog.value, state: 'loading' }
  try {
    const data = await loadCatalogIndex()
    const stubs = data.rows.map(rowToStub)
    index.value = buildIndex(graph.value, stubs)
    catalog.value = { state: 'ready', count: data.count, tiers: data.tiers, error: null }
  } catch (e) {
    catalog.value = { state: 'error', count: 0, tiers: {}, error: e.message }
  }
}

const tabs = [
  { id: 'graph', label: 'Graph & search', key: '1' },
  { id: 'replay', label: 'FDR replay', key: '2' },
  { id: 'timeline', label: 'Timeline', key: '3' },
  { id: 'about', label: 'Method', key: '4' }
]

const agencyCount = computed(() => (graph.value ? graph.value.agencies.length : 0))
const fdrCount = computed(() => (graph.value ? graph.value.records.filter((r) => r.fdr).length : 0))

onMounted(async () => {
  try {
    const mod = await import('@/data/blackbox/graph.json')
    graph.value = mod.default
    index.value = buildIndex(mod.default)
    if (!store.selectedId) store.selectedId = graph.value.records.find((r) => r.id === 'af447')?.id || graph.value.records[0].id
  } catch (e) {
    error.value = e.message
  }
})
</script>

<style>
/* Global (unscoped) Blackbox theme so child components share tokens */
.bb-root {
  --bb-bg: #0b0f18;
  --bb-panel: #121a2a;
  --bb-panel-2: #182236;
  --bb-line: #26334d;
  --bb-text: #e6eefc;
  --bb-muted: #8fa3c7;
  --bb-accent: #ffbf00;
  --bb-accent-2: #22e08a;
  --bb-danger: #ff4d4d;
  --bb-blue: #4c8dff;
  height: 100%;
  padding-top: 1.55rem;
  background: var(--bb-bg);
  color: var(--bb-text);
  font-family: Tahoma, Verdana, sans-serif;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  user-select: text;
}
.bb-tabs {
  display: flex;
  align-items: stretch;
  background: #070a12;
  border-bottom: 1px solid var(--bb-line);
  height: 30px;
  flex: none;
}
.bb-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  font-size: 11px;
  color: var(--bb-accent);
  border-right: 1px solid var(--bb-line);
}
.bb-brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff6a00;
  box-shadow: 0 0 8px #ff6a00;
}
.bb-brand-sub {
  font-weight: 400;
  letter-spacing: 0;
  color: var(--bb-muted);
  margin-left: 6px;
  font-size: 10px;
}
.bb-tab {
  background: transparent;
  border: none;
  border-right: 1px solid var(--bb-line);
  color: var(--bb-muted);
  padding: 0 14px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.bb-tab:hover { color: var(--bb-text); background: #0f1524; }
.bb-tab.active { color: var(--bb-text); background: var(--bb-panel); box-shadow: inset 0 -2px 0 var(--bb-accent); }
.bb-tab-key { display: inline-block; font-size: 9px; color: #566a92; margin-right: 6px; border: 1px solid #2a3550; border-radius: 3px; padding: 0 3px; }
.bb-body { flex: 1; min-height: 0; position: relative; }
.bb-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--bb-muted); }
.bb-error { color: var(--bb-danger); }
.bb-spinner { width: 26px; height: 26px; border: 3px solid var(--bb-line); border-top-color: var(--bb-accent); border-radius: 50%; animation: bb-spin 0.9s linear infinite; }
@keyframes bb-spin { to { transform: rotate(360deg); } }

/* Shared widgets */
.bb-btn { background: var(--bb-panel-2); border: 1px solid var(--bb-line); color: var(--bb-text); font: inherit; font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer; }
.bb-btn:hover { border-color: var(--bb-accent); }
.bb-btn.active { background: var(--bb-accent); color: #111; border-color: var(--bb-accent); font-weight: 700; }
.bb-btn:disabled { opacity: 0.4; cursor: default; }
.bb-btn.small { padding: 1px 6px; font-size: 10px; }
.bb-input { background: #070a12; border: 1px solid var(--bb-line); color: var(--bb-text); font: inherit; padding: 5px 8px; border-radius: 3px; width: 100%; outline: none; }
.bb-input:focus { border-color: var(--bb-accent); }
.bb-select { background: #070a12; border: 1px solid var(--bb-line); color: var(--bb-text); font: inherit; font-size: 11px; padding: 3px 4px; border-radius: 3px; }
.bb-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border-radius: 10px; font-size: 10px; border: 1px solid transparent; cursor: pointer; white-space: nowrap; }
.bb-chip.factor { color: #111; font-weight: 600; }
.bb-chip.ghost { border-color: var(--bb-line); color: var(--bb-muted); background: transparent; }
.bb-chip.ghost:hover { border-color: var(--bb-accent); color: var(--bb-text); }
.bb-muted { color: var(--bb-muted); }
.bb-h { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bb-muted); margin: 10px 0 4px; }
.bb-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: #2a3550 transparent; }
.bb-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.bb-scroll::-webkit-scrollbar-thumb { background: #2a3550; border-radius: 4px; }
.bb-kbd { font-family: Consolas, monospace; font-size: 10px; background: #070a12; border: 1px solid var(--bb-line); border-radius: 3px; padding: 0 4px; }
.bb-agency { font-size: 9px; font-weight: 700; padding: 0 4px; border-radius: 2px; background: #2a3550; color: #cfe0ff; letter-spacing: 0.05em; }
.bb-link { color: var(--bb-blue); cursor: pointer; text-decoration: underline dotted; }
.bb-link:hover { color: var(--bb-accent); }
</style>
