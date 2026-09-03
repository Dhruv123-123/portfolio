<template>
  <div class="cp-backdrop" @mousedown.self="$emit('close')">
    <div class="cp-box">
      <input ref="inputRef" v-model="q" class="cp-input" placeholder="Jump to an accident, a factor, or an action…" spellcheck="false" @keydown="onKey" />
      <div class="cp-list bb-scroll">
        <template v-for="(group, gi) in groups" :key="gi">
          <div class="cp-group" v-if="group.items.length">{{ group.label }}</div>
          <div v-for="it in group.items" :key="it.key" class="cp-item" :class="{ active: it.flat === activeIdx }" @mouseenter="activeIdx = it.flat" @click="run(it)">
            <span class="cp-icon">{{ it.icon }}</span>
            <span class="cp-title">{{ it.title }}</span>
            <span class="cp-sub bb-muted">{{ it.sub }}</span>
          </div>
        </template>
        <div v-if="!total" class="cp-empty bb-muted">Nothing matches.</div>
      </div>
      <div class="cp-foot bb-muted"><span class="bb-kbd">↑↓</span> move <span class="bb-kbd">↵</span> open <span class="bb-kbd">esc</span> close</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'

const props = defineProps({ graph: Object, index: Object })
const emit = defineEmits(['close', 'action'])
const store = useBlackboxStore()
const q = ref('')
const inputRef = ref(null)
const activeIdx = ref(0)

const ACTIONS = [
  { key: 'a-surprise', icon: '🎲', title: 'Surprise me', sub: 'the story of a random fully-documented accident', run: () => { const pool = props.graph.records.filter((r) => r.events && r.events.length >= 6); const r = pool[Math.floor(Math.random() * pool.length)]; if (r) store.openStory(r.id) } },
  { key: 'a-requiem', icon: '🕯', title: 'Requiem', sub: 'the century as a memorial on the atlas', run: () => emit('action', 'requiem') },
  { key: 'a-atlas', icon: '🌐', title: 'Open the atlas', sub: 'every accident on a globe', run: () => store.openAtlas() },
  { key: 'a-century', icon: '⏵', title: 'Play the century', sub: 'atlas time-lapse from the first record to today', run: () => emit('action', 'century') },
  { key: 'a-story', icon: '🎬', title: 'Tell the story of the selected accident', sub: 'documentary walkthrough', run: () => store.selectedId && store.openStory(store.selectedId) },
  { key: 'a-replay', icon: '✈', title: 'FDR replay', sub: 'flight data recorder replay', run: () => (store.tab = 'replay') },
  { key: 'a-timeline', icon: '⏱', title: 'Timeline of the selected accident', sub: 'event chain, compare, narrative', run: () => store.selectedId && store.openTimeline(store.selectedId) },
  { key: 'a-sound', icon: '🔊', title: 'Toggle cockpit sound', sub: 'synthesized engines, warnings and call-outs in the replay', run: () => emit('action', 'sound') },
  { key: 'a-crt', icon: '📺', title: 'Toggle CRT look', sub: 'scanlines and phosphor glow', run: () => (store.crt = !store.crt) },
  { key: 'a-method', icon: '📖', title: 'How this was built', sub: 'method and data sources', run: () => (store.tab = 'about') }
]

function score(text, terms) {
  const t = text.toLowerCase()
  let s = 0
  for (const w of terms) {
    if (!t.includes(w)) return 0
    s += t.startsWith(w) ? 3 : 1
  }
  return s
}

const groups = computed(() => {
  const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  let flat = 0
  const out = []
  // accidents
  const recs = []
  const pool = props.index.records
  for (const r of pool) {
    const text = `${r.title} ${r.flight_number || ''} ${r.operator || ''} ${r.aircraft?.type || ''} ${r.date} ${r.location?.country || ''} ${r.agency}`
    const s = terms.length ? score(text, terms) : 1
    if (!s) continue
    recs.push({ r, s: s * 10 + (r.interest || (r.tier ? 0 : 50)) })
    if (recs.length > 4000) break
  }
  recs.sort((a, b) => b.s - a.s)
  out.push({ label: 'Accidents', items: recs.slice(0, terms.length ? 10 : 6).map(({ r }) => ({ key: r.id, flat: flat++, icon: r.fdr ? '✈' : '●', title: r.title, sub: `${r.date} · ${r.aircraft?.type || ''} · ${r.fatalities ?? '?'} fatalities`, run: () => store.openGraph(r.id) })) })
  // factors
  const facs = []
  for (const f of props.graph.taxonomy.factors) {
    const text = `${f.label} ${f.id.replace(/_/g, ' ')} ${f.synonyms.join(' ')}`
    const s = terms.length ? score(text, terms) : 0
    if (s) facs.push({ f, s })
  }
  facs.sort((a, b) => b.s - a.s)
  out.push({ label: 'Factors', items: facs.slice(0, 6).map(({ f }) => ({ key: 'f-' + f.id, flat: flat++, icon: '◆', title: f.label, sub: `${props.index.stats.factor_counts[f.id] || 0} accidents · search the graph`, run: () => store.openGraph(null, f.label.toLowerCase()) })) })
  // real recordings
  const withAudio = props.graph.records.filter((r) => r.audio && r.audio.length && (!terms.length || score(`${r.title} ${r.operator || ''} recording audio atc cvr listen`, terms)))
  out.push({ label: 'Real recordings', items: withAudio.slice(0, terms.length ? 8 : 4).map((r) => ({ key: 'au-' + r.id, flat: flat++, icon: '♪', title: r.title, sub: `${r.audio.some((a) => a.kind === 'cvr') ? 'CVR' : 'ATC'} · ${r.fdr ? 'synced replay' : 'timeline'}`, run: () => (r.fdr ? store.openReplay(r.id) : store.openTimeline(r.id)) })) })
  // actions
  const acts = ACTIONS.filter((a) => !terms.length || score(`${a.title} ${a.sub}`, terms))
  out.push({ label: 'Actions', items: acts.map((a) => ({ ...a, flat: flat++ })) })
  // free-text search
  if (terms.length) out.push({ label: 'Search', items: [{ key: 'search', flat: flat++, icon: '🔍', title: `Ask the graph: “${q.value}”`, sub: 'causal-path and text search', run: () => store.openGraph(null, q.value) }] })
  return out
})
const total = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

function run(it) {
  it.run()
  emit('close')
}
function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close') }
  else if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx.value = Math.min(total.value - 1, activeIdx.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx.value = Math.max(0, activeIdx.value - 1) }
  else if (e.key === 'Enter') {
    e.preventDefault()
    const it = groups.value.flatMap((g) => g.items).find((x) => x.flat === activeIdx.value)
    if (it) run(it)
  } else activeIdx.value = 0
}
onMounted(() => inputRef.value && inputRef.value.focus())
</script>

<style scoped>
.cp-backdrop { position: absolute; inset: 0; z-index: 60; background: rgba(2, 4, 10, 0.6); backdrop-filter: blur(3px); display: flex; justify-content: center; align-items: flex-start; padding-top: 8vh; }
.cp-box { width: min(620px, 92%); background: #0b1020; border: 1px solid var(--bb-line); border-radius: 8px; box-shadow: 0 20px 80px rgba(0,0,0,0.7); overflow: hidden; animation: cp-in 0.15s ease-out; }
@keyframes cp-in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
.cp-input { width: 100%; box-sizing: border-box; background: transparent; border: none; border-bottom: 1px solid var(--bb-line); color: #fff; font: inherit; font-size: 15px; padding: 14px 16px; outline: none; }
.cp-list { max-height: 50vh; overflow: auto; padding: 6px 0; }
.cp-group { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--bb-muted); padding: 8px 16px 2px; }
.cp-item { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: center; padding: 6px 16px; cursor: pointer; font-size: 12px; }
.cp-item.active { background: #1c2a45; box-shadow: inset 3px 0 0 var(--bb-accent); }
.cp-icon { text-align: center; color: var(--bb-accent); }
.cp-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-sub { font-size: 10px; white-space: nowrap; }
.cp-empty { padding: 16px; }
.cp-foot { padding: 6px 16px; border-top: 1px solid var(--bb-line); font-size: 10px; display: flex; gap: 8px; }
</style>
