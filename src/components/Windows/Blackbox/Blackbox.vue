<template>
  <div class="bb-root" :class="{ 'bb-crt': store.crt, 'bb-amber': store.crt === 'amber', 'bb-drift': drifting }" @mousedown.capture="onUserActivity" @keydown.capture="onUserActivity">
    <div v-if="booting" class="bb-boot" @click="booting = false">
      <pre class="bb-boot-text">{{ bootText }}<span class="bb-boot-cursor">▌</span></pre>
    </div>
    <header class="bb-top">
      <a v-if="home" :href="home" class="bb-home" title="Back to the site">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"></path></svg>
      </a>
      <div class="bb-brand"><span class="bb-brand-dot"></span>Blackbox</div>
      <nav class="bb-nav" aria-label="Sections">
        <button v-for="t in tabs" :key="t.id" class="bb-tab" :class="{ active: store.tab === t.id }" @click="store.tab = t.id" :title="t.title + ' · key ' + t.key">{{ t.label }}</button>
      </nav>
      <div class="bb-top-right">
        <button class="bb-search" @click="palette = true" title="Jump to an accident, factor or action (Ctrl+K or /)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
          <span class="bb-search-text">Search</span>
          <span class="bb-kbd">⌘K</span>
        </button>
        <span class="bb-menu-wrap">
          <button class="bb-btn icon ghost" :class="{ active: menuOpen }" @click="menuOpen = !menuOpen" title="More">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle></svg>
          </button>
          <div v-if="menuOpen" class="bb-popover bb-menu" @click="menuOpen = false">
            <button class="bb-menu-item" @click="cycleCrt"><span>Screen look</span><span class="bb-muted">{{ store.crt === 'amber' ? 'amber' : store.crt ? 'CRT' : 'plain' }}</span></button>
            <button class="bb-menu-item" @click="toggleDrift"><span>Drift</span><span class="bb-muted">{{ drifting ? 'on' : 'plays itself' }}</span></button>
            <button v-if="deepLinks" class="bb-menu-item" @click="share"><span>Share this view</span><span class="bb-muted">{{ shared ? 'copied' : 'copy link' }}</span></button>
            <div class="bb-divider"></div>
            <button class="bb-menu-item" @click="store.tab = 'about'"><span>Method and sources</span><span class="bb-muted">5</span></button>
            <a class="bb-menu-item" href="https://www.flightgear.org/" target="_blank" rel="noopener"><span>FlightGear</span><span class="bb-muted">↗</span></a>
            <a v-if="source" class="bb-menu-item" :href="source" target="_blank" rel="noopener"><span>Source on GitHub</span><span class="bb-muted">↗</span></a>
          </div>
        </span>
      </div>
    </header>
    <div class="bb-body">
      <div v-if="error" class="bb-center bb-error">Failed to load corpus: {{ error }}</div>
      <div v-else-if="!graph" class="bb-center">
        <div class="bb-spinner"></div>
        <div>Loading accident corpus…</div>
      </div>
      <template v-else>
        <GraphExplorer v-show="store.tab === 'graph'" :graph="graph" :index="index" :active="store.tab === 'graph'" :catalog="catalog" @load-catalog="loadCatalog" />
        <Atlas v-if="atlasMounted" v-show="store.tab === 'atlas'" :graph="graph" :index="index" :active="store.tab === 'atlas'" :catalog="catalog" @load-catalog="loadCatalog" />
        <FdrReplay v-if="store.tab === 'replay'" :graph="graph" :index="index" />
        <TimelineBuilder v-show="store.tab === 'timeline'" :graph="graph" :index="index" :active="store.tab === 'timeline'" />
        <AboutPanel v-show="store.tab === 'about'" :graph="graph" :index="index" :catalog="catalog" />
        <StoryMode v-if="store.storyId && index.byId[store.storyId]" :graph="graph" :index="index" :record-id="store.storyId" />
        <CommandPalette v-if="palette" :graph="graph" :index="index" @close="palette = false" @action="onPaletteAction" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import './theme.css'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { buildIndex } from './lib/search.js'
import { loadCatalogIndex, rowToStub } from './lib/catalog.js'
import GraphExplorer from './GraphExplorer.vue'
import Atlas from './Atlas.vue'
import FdrReplay from './FdrReplay.vue'
import TimelineBuilder from './TimelineBuilder.vue'
import AboutPanel from './AboutPanel.vue'
import StoryMode from './StoryMode.vue'
import CommandPalette from './CommandPalette.vue'

const props = defineProps({ deepLinks: { type: Boolean, default: false }, home: { type: String, default: '' }, source: { type: String, default: '' } })
const home = computed(() => props.home)
const source = computed(() => props.source)
const deepLinks = computed(() => props.deepLinks)
const store = useBlackboxStore()
const graph = shallowRef(null)
const palette = ref(false)
const shared = ref(false)
const menuOpen = ref(false)
const drifting = ref(false)
let driftTimer = null
let driftStep = 0
function cycleCrt() {
  store.crt = store.crt === false ? true : store.crt === true ? 'amber' : false
}
/** Drift: an autonomous tour. Each leg hands off to the next; any click or key ends it. */
function toggleDrift() {
  if (drifting.value) { stopDrift(); return }
  drifting.value = true
  driftStep = 0
  driftLeg()
}
function stopDrift() {
  if (!drifting.value) return
  drifting.value = false
  clearTimeout(driftTimer)
  if (store.storyId) store.storyId = null
}
function driftLeg() {
  if (!drifting.value || !graph.value) return
  const legs = ['requiem', 'story', 'replay', 'story', 'graph']
  const leg = legs[driftStep % legs.length]
  driftStep++
  let hold = 45000
  if (leg === 'requiem') { store.storyId = null; store.openAtlas(); store.atlasRequiemRequest = Date.now(); hold = 50000 }
  else if (leg === 'story') {
    const pool = graph.value.records.filter((r) => r.events && r.events.length >= 8)
    const r = pool[Math.floor(Math.random() * pool.length)]
    store.tab = 'graph'
    if (r) store.openStory(r.id)
    hold = 70000
  } else if (leg === 'replay') {
    store.storyId = null
    const pool = graph.value.records.filter((r) => r.fdr)
    const r = pool[Math.floor(Math.random() * pool.length)]
    if (r) { store.openReplay(r.id); store.replayAutoplay = Date.now() }
    hold = 60000
  } else if (leg === 'graph') {
    store.storyId = null
    store.openGraph(null, ['unreliable airspeed misdiagnosed as a stall', 'fatigue on approach', 'wrong engine shut down', 'fuel exhaustion after a diversion'][Math.floor(Math.random() * 4)])
    hold = 25000
  }
  driftTimer = setTimeout(driftLeg, hold)
}
function onUserActivity(e) {
  if (!drifting.value) return
  // the drift button itself, and the story overlay's own controls, do not end the tour
  if (e.target && e.target.closest && e.target.closest('.bb-tab-icon')) return
  stopDrift()
}
async function share() {
  writeHash()
  try {
    await navigator.clipboard.writeText(window.location.href)
    shared.value = true
    setTimeout(() => (shared.value = false), 1800)
  } catch (e) {
    window.prompt('Copy this link', window.location.href)
  }
}
const booting = ref(false)
const bootText = ref('')
let bootTimer = null

function onPaletteAction(a) {
  if (a === 'century') {
    store.openAtlas()
    store.atlasPlayRequest = Date.now()
  }
  if (a === 'sound') store.sound = !store.sound
  if (a === 'requiem') {
    store.openAtlas()
    store.atlasRequiemRequest = Date.now()
  }
}

/** Boot sequence: once per browser session, a short console-style start-up. */
function boot() {
  let seen = false
  try { seen = sessionStorage.getItem('bb-booted') === '1' } catch (e) { /* storage blocked */ }
  if (seen) return
  try { sessionStorage.setItem('bb-booted', '1') } catch (e) { /* ignore */ }
  booting.value = true
  const lines = [
    'BLACKBOX  flight recorder analysis console',
    'mounting taxonomy ............ 122 causal factors',
    'reading curated reports ...... 372 records',
    'indexing catalog ............. 9,952 summaries available',
    'flight data recorders ........ 105 replays',
    'audio synthesis .............. ready',
    'READY.'
  ]
  let i = 0
  const step = () => {
    bootText.value = lines.slice(0, i + 1).join('\n')
    i++
    if (i < lines.length) bootTimer = setTimeout(step, 120 + Math.random() * 160)
    else bootTimer = setTimeout(() => (booting.value = false), 700)
  }
  step()
}

/** Deep links: mirror the essential state into the URL hash and restore it on load. */
function readHash() {
  const h = (window.location.hash || '').replace(/^#/, '')
  if (!h) return null
  const p = new URLSearchParams(h)
  return { tab: p.get('tab'), id: p.get('id'), t: p.get('t'), q: p.get('q'), story: p.get('story') }
}
function applyHash(state) {
  if (!state || !graph.value) return
  if (state.id && index.value.byId[state.id]) {
    store.selectedId = state.id
    if (state.tab === 'replay' && index.value.byId[state.id].fdr) {
      store.replayId = state.id
      if (state.t !== null && state.t !== '' && !isNaN(+state.t)) store.replayTime = +state.t
    }
  }
  if (state.q) store.query = state.q
  if (state.tab && ['graph', 'atlas', 'replay', 'timeline', 'about'].includes(state.tab)) store.tab = state.tab
  if (state.story && index.value.byId[state.story]) store.storyId = state.story
}
function writeHash() {
  if (!props.deepLinks) return
  const p = new URLSearchParams()
  p.set('tab', store.tab)
  const id = store.tab === 'replay' ? store.replayId || store.selectedId : store.selectedId
  if (id) p.set('id', id)
  if (store.query && store.tab === 'graph') p.set('q', store.query)
  if (store.storyId) p.set('story', store.storyId)
  const next = '#' + p.toString()
  if (window.location.hash !== next) history.replaceState(null, '', next)
}
watch(() => [store.tab, store.selectedId, store.replayId, store.query, store.storyId], writeHash)

function onGlobalKey(e) {
  const inField = e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.value = !palette.value; return }
  if (e.key === '/' && !inField && !palette.value && !store.storyId) { e.preventDefault(); palette.value = true; return }
  if (e.key === 'Escape' && palette.value) palette.value = false
  if (!inField && !palette.value && !store.storyId && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const t = tabs.find((x) => x.key === e.key)
    if (t) store.tab = t.id
  }
}
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
  { id: 'atlas', label: 'Atlas', title: 'Every accident on a globe', key: '1' },
  { id: 'graph', label: 'Graph', title: 'Causal graph and search', key: '2' },
  { id: 'replay', label: 'Replay', title: 'Flight data recorder replay', key: '3' },
  { id: 'timeline', label: 'Timeline', title: 'Event chain, compare, narrative', key: '4' },
  { id: 'about', label: 'Method', title: 'Method and sources', key: '5' }
]
// The globe is heavy: mount it the first time the tab is opened, then keep it warm.
const atlasMounted = ref(false)
watch(() => store.tab, (t) => { if (t === 'atlas') atlasMounted.value = true }, { immediate: true })


onMounted(async () => {
  boot()
  window.addEventListener('keydown', onGlobalKey)
  const initial = props.deepLinks ? readHash() : null
  try {
    const mod = await import('@/data/blackbox/graph.json')
    graph.value = mod.default
    index.value = buildIndex(mod.default)
    if (!store.selectedId) store.selectedId = graph.value.records.find((r) => r.id === 'af447')?.id || graph.value.records[0].id
    if (initial) {
      // catalog ids need the catalog first
      if (initial.id && !index.value.byId[initial.id] && /^(wd_|ntsb_)/.test(initial.id)) await loadCatalog()
      applyHash(initial)
    }
  } catch (e) {
    error.value = e.message
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  clearTimeout(bootTimer)
  clearTimeout(driftTimer)
})
</script>

<style>
/* Shell chrome. Tokens and shared components live in theme.css. */
.bb-top { display: flex; align-items: center; gap: 4px; height: 44px; padding: 0 10px 0 8px; background: var(--bb-panel); border-bottom: 1px solid var(--bb-line); flex: none; }
.bb-home { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--bb-radius); color: var(--bb-muted); text-decoration: none; }
.bb-home:hover { color: var(--bb-text); background: var(--bb-panel-2); }
.bb-brand { display: flex; align-items: center; gap: 8px; padding: 0 14px 0 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.01em; color: var(--bb-text); }
.bb-brand-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bb-accent); }
.bb-nav { display: flex; align-items: stretch; height: 100%; gap: 2px; }
.bb-tab { position: relative; background: transparent; border: none; color: var(--bb-muted); padding: 0 12px; font: inherit; font-size: 12.5px; cursor: pointer; }
.bb-tab:hover { color: var(--bb-text); }
.bb-tab.active { color: var(--bb-text); }
.bb-tab.active::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; background: var(--bb-accent); border-radius: 1px; }
.bb-top-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.bb-search { display: flex; align-items: center; gap: 8px; height: var(--bb-control); width: 200px; max-width: 30vw; background: var(--bb-bg); border: 1px solid var(--bb-line-2); border-radius: var(--bb-radius); padding: 0 8px; color: var(--bb-muted); font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
.bb-search:hover { border-color: var(--bb-muted); color: var(--bb-text-2); }
.bb-search-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-menu-wrap { position: relative; }
.bb-menu { right: 0; top: 34px; width: 240px; }
@media (max-width: 700px) { .bb-search { width: 34px; } .bb-search-text, .bb-search .bb-kbd { display: none; } .bb-brand { padding-right: 6px; } .bb-tab { padding: 0 8px; } }

.bb-boot { position: absolute; inset: 0; z-index: 100; background: #04060a; display: flex; align-items: center; justify-content: center; cursor: pointer; animation: bb-boot-in 0.2s; }
.bb-boot-text { font-family: var(--bb-mono); font-size: 12px; line-height: 1.7; color: var(--bb-accent); margin: 0; letter-spacing: 0.04em; }
.bb-boot-cursor { animation: bb-blink 0.6s step-end infinite; }
@keyframes bb-blink { 50% { opacity: 0; } }
@keyframes bb-boot-in { from { opacity: 0; } to { opacity: 1; } }
/* Amber monochrome */
.bb-amber { filter: sepia(1) saturate(2.4) hue-rotate(-12deg) contrast(1.05); }
.bb-drift .bb-top { opacity: 0.35; transition: opacity 1.5s; }
.bb-drift .bb-top:hover { opacity: 1; }
/* CRT look */
.bb-crt::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 200; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px), radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%); mix-blend-mode: multiply; animation: bb-flicker 4s infinite; }
.bb-crt { text-shadow: 0 0 1px rgba(120,220,255,0.35); position: relative; }
@keyframes bb-flicker { 0%, 100% { opacity: 1; } 47% { opacity: 1; } 48% { opacity: 0.85; } 49% { opacity: 1; } 83% { opacity: 1; } 84% { opacity: 0.9; } 85% { opacity: 1; } }
</style>
