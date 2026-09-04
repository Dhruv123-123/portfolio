<template>
  <div class="st-root" @click="advance" tabindex="0" ref="rootRef">
    <canvas ref="bgRef" class="st-bg"></canvas>
    <div class="st-vignette"></div>
    <div class="st-top">
      <span class="st-kicker">STORY · {{ rec.title }}</span>
      <span class="st-count bb-muted">{{ sceneIndex + 1 }} / {{ scenes.length }}</span>
      <span class="st-ctl" @click.stop>
        <button class="bb-btn small icon" :class="{ active: autoplay }" @click="autoplay = !autoplay" title="auto-advance (space)">
          <svg v-if="!autoplay" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z"></path></svg>
          <svg v-else width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>
        </button>
        <button class="bb-btn small" :class="{ active: narrate }" @click="toggleNarrate" title="read aloud with speech synthesis">Narrate</button>
        <button class="bb-btn small icon" @click="prev" title="previous (←)">‹</button>
        <button class="bb-btn small icon" @click="next" title="next (→ or click)">›</button>
        <button class="bb-btn small icon" @click="close" title="close (esc)">×</button>
      </span>
    </div>

    <div class="st-scene" :key="sceneIndex" :class="'st-' + scene.kind">
      <!-- Title card -->
      <template v-if="scene.kind === 'title'">
        <div class="st-date">{{ rec.date }}</div>
        <h1 class="st-h1">{{ rec.title }}</h1>
        <div class="st-sub">{{ rec.aircraft.type }} · {{ rec.operator }}</div>
        <div class="st-sub">{{ rec.location?.name || rec.location?.country || '' }}</div>
        <div class="st-big" v-if="rec.fatalities > 0">{{ rec.fatalities }} <span>of {{ rec.occupants ?? '?' }} on board did not survive</span></div>
        <div class="st-big st-ok" v-else>{{ rec.occupants ?? 'all' }} <span>on board · no fatalities</span></div>
      </template>

      <!-- Setting -->
      <template v-else-if="scene.kind === 'setting'">
        <div class="st-label">{{ scene.label }}</div>
        <div class="st-route" v-if="rec.route && (rec.route.from || rec.route.to)">
          <span>{{ rec.route.from_name || rec.route.from }}</span><span class="st-route-arrow">✈</span><span>{{ rec.route.to_name || rec.route.to }}</span>
        </div>
        <p class="st-text">{{ typed }}<span class="st-cursor" v-if="typing">▌</span></p>
      </template>

      <!-- Event beat -->
      <template v-else-if="scene.kind === 'beat'">
        <div class="st-label">{{ scene.label }}</div>
        <div class="st-clock">{{ scene.ev.clock || formatRelative(scene.ev.t) }}</div>
        <div class="st-actor" :class="'actor-' + scene.ev.actor">{{ actorName(scene.ev.actor) }}<span class="st-kind"> · {{ (scene.ev.kind || '').replace(/_/g, ' ') }}</span></div>
        <p class="st-text">{{ typed }}<span class="st-cursor" v-if="typing">▌</span></p>
        <div class="st-state" v-if="scene.ev.state && Object.keys(scene.ev.state).length">
          <div v-for="(v, k) in scene.ev.state" :key="k" class="st-inst"><span class="st-inst-k">{{ stateLabel(k) }}</span><span class="st-inst-v">{{ stateValue(k, v) }}</span></div>
        </div>
        <div class="st-factors" v-if="scene.ev.factors && scene.ev.factors.length">
          <span v-for="f in scene.ev.factors" :key="f" class="bb-chip factor" :style="{ '--c': factorColor(f) }">{{ factorLabel(f) }}</span>
        </div>
        <div class="st-cvr" v-if="scene.cvr.length">
          <div v-for="(c, i) in scene.cvr" :key="i" class="st-cvr-line"><span class="st-cvr-spk">{{ c.speaker }}</span> “{{ c.translation || c.text }}”</div>
        </div>
      </template>

      <!-- Chain -->
      <template v-else-if="scene.kind === 'chain'">
        <div class="st-label">{{ scene.label }}</div>
        <div class="st-chain">
          <div v-for="(e, i) in rec.chain.slice(0, 14)" :key="i" class="st-chain-row" :style="{ animationDelay: i * 0.35 + 's' }">
            <span class="bb-chip factor" :style="{ '--c': factorColor(e[0]) }">{{ factorLabel(e[0]) }}</span>
            <span class="st-arrow">→</span>
            <span class="bb-chip factor" :style="{ '--c': factorColor(e[1]) }">{{ factorLabel(e[1]) }}</span>
          </div>
          <div v-if="rec.chain.length > 14" class="bb-muted">and {{ rec.chain.length - 14 }} more edges</div>
        </div>
      </template>

      <!-- Findings / dissent / changes / echoes: text scenes -->
      <template v-else-if="scene.kind === 'text'">
        <div class="st-label">{{ scene.label }}</div>
        <p class="st-text" :class="{ small: scene.text.length > 500 }">{{ typed }}<span class="st-cursor" v-if="typing">▌</span></p>
      </template>

      <template v-else-if="scene.kind === 'list'">
        <div class="st-label">{{ scene.label }}</div>
        <div class="st-list">
          <div v-for="(it, i) in scene.items" :key="i" class="st-list-item" :style="{ animationDelay: i * 0.4 + 's' }" @click.stop="it.id && select(it.id)">
            <span class="st-list-head" v-if="it.head">{{ it.head }}</span>
            <span>{{ it.text }}</span>
          </div>
        </div>
      </template>

      <!-- End card -->
      <template v-else-if="scene.kind === 'end'">
        <div class="st-label">{{ rec.title }} · {{ rec.date.slice(0, 4) }}</div>
        <h2 class="st-h2">{{ rec.agencies?.find((a) => a.role === 'lead')?.name || rec.agency }}</h2>
        <div class="st-sub">investigated · {{ (rec.recommendations || []).length }} recommendations · {{ rec.factors.length }} factors in the graph</div>
        <div v-if="rec.audio && rec.audio.length" class="st-audio" @click.stop>
          <div v-for="(a, i) in rec.audio.slice(0, 2)" :key="i" class="st-audio-item">
            <span class="bb-tag">{{ a.kind === 'cvr' ? 'CVR' : a.kind === 'atc' ? 'ATC' : 'Audio' }}</span> {{ a.title }}
            <audio controls preload="none" :src="a.url" class="st-audio-el"></audio>
          </div>
        </div>
        <div class="st-end-actions" @click.stop>
          <button class="bb-btn" @click="go('graph')">Open in graph</button>
          <button class="bb-btn" @click="go('timeline')">Timeline</button>
          <button class="bb-btn" v-if="rec.fdr" @click="go('replay')">Replay</button>
          <button class="bb-btn" @click="go('atlas')">Atlas</button>
          <a :href="wikipediaUrl(rec)" target="_blank" rel="noopener" class="bb-btn st-readmore">{{ hasWikipediaArticle(rec) ? 'Wikipedia ↗' : 'Search Wikipedia ↗' }}</a>
          <button class="bb-btn ghost" @click="restart">Watch again</button>
        </div>
      </template>
    </div>

    <div class="st-progress">
      <div v-for="(s, i) in scenes" :key="i" class="st-seg" :class="{ done: i < sceneIndex, cur: i === sceneIndex }" @click.stop="goTo(i)"><div class="st-seg-fill" :style="{ width: i === sceneIndex ? progress * 100 + '%' : i < sceneIndex ? '100%' : '0%' }"></div></div>
    </div>
    <div class="st-hint bb-muted">click or → to continue · ← back · space auto-play · esc close</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { formatRelative } from './lib/fdr.js'
import { wikipediaUrl, hasWikipediaArticle } from './lib/geo.js'
import { similarRecords } from './lib/search.js'

const props = defineProps({ graph: Object, index: Object, recordId: String })
const store = useBlackboxStore()

const rootRef = ref(null)
const bgRef = ref(null)
const sceneIndex = ref(0)
const typed = ref('')
const typing = ref(false)
const autoplay = ref(true)
const narrate = ref(false)
const progress = ref(0)
let typeTimer = null
let holdTimer = null
let raf = null
let sceneStart = 0
let sceneDur = 6000

const rec = computed(() => props.index.byId[props.recordId])
const factorColor = (id) => props.graph.taxonomy.categories[props.index.factorById[id]?.category]?.color || '#888'
const factorLabel = (id) => props.index.factorById[id]?.label || id
const actorName = (a) => props.graph.taxonomy.actors[a] || a || ''
const stateLabel = (k) => ({ alt: 'ALT', ias: 'IAS', pitch: 'PITCH', hdg: 'HDG', vs: 'V/S', aoa: 'AoA', roll: 'ROLL', n1: 'N1', flaps: 'FLAPS', gear: 'GEAR', gs: 'GS', mach: 'MACH', cas: 'CAS', tas: 'TAS', ra: 'RA' }[k] || k.toUpperCase())
const stateValue = (k, v) => {
  if (typeof v !== 'number') return String(v)
  if (k === 'alt') return `${Math.round(v).toLocaleString()} ft`
  if (['ias', 'gs', 'cas', 'tas'].includes(k)) return `${Math.round(v)} kt`
  if (k === 'vs') return `${v > 0 ? '+' : ''}${Math.round(v)} fpm`
  if (['pitch', 'roll', 'aoa', 'hdg'].includes(k)) return `${v}°`
  if (k === 'n1') return `${v}%`
  return String(v)
}

/** Pick up to n events, preferring ones with factors, state or CVR nearby. */
function pickBeats(events, n = 22) {
  if (events.length <= n) return events
  const scored = events.map((e, i) => ({ e, i, s: (e.factors?.length ? 2 : 0) + (e.state && Object.keys(e.state).length ? 1 : 0) + (e.kind === 'outcome' || e.kind === 'warning' ? 2 : 0) + (i === 0 || i === events.length - 1 ? 3 : 0) }))
  const keep = new Set(scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map((x) => x.i))
  return events.filter((_, i) => keep.has(i))
}

const scenes = computed(() => {
  const r = rec.value
  if (!r) return []
  const out = []
  out.push({ kind: 'title' })
  out.push({ kind: 'setting', label: 'The flight', text: r.summary || '' })
  const cvr = r.cvr || []
  const beats = pickBeats(r.events || [])
  beats.forEach((ev, i) => {
    const near = cvr.filter((c) => Math.abs(c.t - ev.t) <= 4 && c.text !== ev.text).slice(0, 2)
    out.push({ kind: 'beat', label: `${(ev.phase || 'sequence').replace(/_/g, ' ')} · ${i + 1} of ${beats.length}`, ev, text: ev.text, cvr: near })
  })
  if ((r.chain || []).length) out.push({ kind: 'chain', label: 'How it unravelled', text: '' })
  if (r.probable_cause) out.push({ kind: 'text', label: 'What the investigators found', text: r.probable_cause.length > 900 ? r.probable_cause.slice(0, 880) + '…' : r.probable_cause })
  if (r.dissent && r.dissent.length) out.push({ kind: 'list', label: 'Where the agencies disagreed', items: r.dissent.map((d) => ({ head: d.agency, text: d.position })) })
  const recs = (r.recommendations || []).slice(0, 6).map((x) => ({ head: x.id || (x.to ? `to ${x.to}` : 'recommendation'), text: x.text }))
  const changes = (r.safety_changes || []).slice(0, 4).map((s) => ({ head: 'changed', text: s }))
  if (recs.length || changes.length) out.push({ kind: 'list', label: 'What changed', items: [...recs, ...changes] })
  const sim = similarRecords(props.index, r.id, 8).map((s) => props.index.byId[s.id]).filter(Boolean)
  const before = sim.filter((x) => x.date < r.date).slice(0, 3)
  const after = sim.filter((x) => x.date > r.date).slice(0, 3)
  if (before.length) out.push({ kind: 'list', label: 'It had happened before', items: before.map((x) => ({ id: x.id, head: x.date.slice(0, 4), text: `${x.title} · ${x.aircraft.type || ''} · ${x.fatalities ?? '?'} fatalities` })) })
  if (after.length) out.push({ kind: 'list', label: 'It happened again', items: after.map((x) => ({ id: x.id, head: x.date.slice(0, 4), text: `${x.title} · ${x.aircraft.type || ''} · ${x.fatalities ?? '?'} fatalities` })) })
  out.push({ kind: 'end' })
  return out
})
const scene = computed(() => scenes.value[Math.min(sceneIndex.value, scenes.value.length - 1)] || { kind: 'title' })

function startScene() {
  clearInterval(typeTimer)
  clearTimeout(holdTimer)
  const s = scene.value
  const text = s.text || ''
  typed.value = ''
  typing.value = !!text
  sceneStart = performance.now()
  const cps = 34
  const typeMs = text ? (text.length / cps) * 1000 : 0
  const hold = s.kind === 'title' ? 5200 : s.kind === 'chain' ? 2600 + Math.min(14, (rec.value.chain || []).length) * 380 : s.kind === 'list' ? 3200 + (s.items?.length || 0) * 1400 : s.kind === 'end' ? 1e9 : 2600
  sceneDur = typeMs + hold
  if (text) {
    let i = 0
    typeTimer = setInterval(() => {
      i += 1
      typed.value = text.slice(0, i)
      if (i >= text.length) { clearInterval(typeTimer); typing.value = false }
    }, 1000 / cps)
  }
  if (narrate.value) speak(narrationFor(s))
}
function narrationFor(s) {
  const r = rec.value
  if (s.kind === 'title') return `${r.title}. ${r.date}. ${r.aircraft.type}, ${r.operator}.`
  if (s.kind === 'beat') return `${s.ev.clock || ''}. ${actorName(s.ev.actor)}. ${s.text}`
  if (s.kind === 'chain') return 'How it unravelled. ' + (r.chain || []).slice(0, 8).map((e) => `${factorLabel(e[0])} led to ${factorLabel(e[1])}`).join('. ')
  if (s.kind === 'list') return `${s.label}. ` + (s.items || []).map((it) => `${it.head || ''}. ${it.text}`).join('. ')
  if (s.kind === 'end') return `Investigated by ${r.agencies?.find((a) => a.role === 'lead')?.name || r.agency}.`
  return `${s.label}. ${s.text}`
}
function speak(text) {
  if (typeof speechSynthesis === 'undefined') return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.98
  u.pitch = 0.85
  speechSynthesis.speak(u)
}
function toggleNarrate() {
  narrate.value = !narrate.value
  if (narrate.value) speak(narrationFor(scene.value))
  else if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

function tick(ts) {
  raf = requestAnimationFrame(tick)
  const el = performance.now() - sceneStart
  progress.value = Math.min(1, el / Math.max(1, sceneDur))
  if (autoplay.value && el >= sceneDur && sceneIndex.value < scenes.value.length - 1) next()
  drawBg(ts)
}

function advance() {
  // click anywhere: finish typing first, then move on
  if (typing.value) {
    clearInterval(typeTimer)
    typed.value = scene.value.text || ''
    typing.value = false
    sceneStart = performance.now() - (sceneDur - 2000)
    return
  }
  next()
}
function next() { if (sceneIndex.value < scenes.value.length - 1) { sceneIndex.value++; startScene() } }
function prev() { if (sceneIndex.value > 0) { sceneIndex.value--; startScene() } }
function goTo(i) { sceneIndex.value = i; startScene() }
function restart() { sceneIndex.value = 0; startScene() }
function close() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  store.storyId = null
}
function go(tab) {
  const id = rec.value.id
  close()
  if (tab === 'graph') store.openGraph(id)
  if (tab === 'timeline') store.openTimeline(id)
  if (tab === 'replay') store.openReplay(id)
  if (tab === 'atlas') store.openAtlas(id)
}
function select(id) {
  store.storyId = id
  store.selectedId = id
}

function onKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); advance() }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
  else if (e.code === 'Space') { e.preventDefault(); autoplay.value = !autoplay.value }
}

// Background: drifting embers and a horizon that tilts with the current beat's attitude
let particles = []
let lastAlt = 20000
function drawBg(ts) {
  const cv = bgRef.value
  if (!cv) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const r = cv.getBoundingClientRect()
  const w = Math.max(1, Math.floor(r.width))
  const h = Math.max(1, Math.floor(r.height))
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#04060c'
  ctx.fillRect(0, 0, w, h)
  if (!particles.length) for (let i = 0; i < 140; i++) particles.push({ x: Math.random() * w, y: Math.random() * h, s: 0.4 + Math.random() * 1.6, v: 4 + Math.random() * 14, a: Math.random() })
  const s = scene.value
  const st = s.kind === 'beat' && s.ev.state ? s.ev.state : null
  const pitch = st && typeof st.pitch === 'number' ? st.pitch : 0
  const roll = st && typeof st.roll === 'number' ? st.roll : 0
  // altitude paints the sky: high is deep and starry, low is warm ground glow
  if (st && typeof st.alt === 'number') lastAlt = st.alt
  const altK = Math.min(1, Math.max(0, lastAlt / 40000))
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h)
  skyGrad.addColorStop(0, `rgba(${Math.round(4 + 10 * (1 - altK))},${Math.round(6 + 14 * (1 - altK))},${Math.round(12 + 40 * (1 - altK))},1)`)
  skyGrad.addColorStop(1, `rgba(${Math.round(10 + 30 * (1 - altK))},${Math.round(8 + 14 * (1 - altK))},${Math.round(6 + 4 * (1 - altK))},1)`)
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, w, h)
  // horizon
  ctx.save()
  ctx.translate(w / 2, h * 0.62)
  ctx.rotate((-roll * Math.PI) / 180)
  ctx.translate(0, pitch * (h / 90))
  const grad = ctx.createLinearGradient(0, -h, 0, h)
  grad.addColorStop(0, 'rgba(20,40,90,0.0)')
  grad.addColorStop(0.5, 'rgba(60,110,200,0.10)')
  grad.addColorStop(0.5001, 'rgba(120,80,30,0.10)')
  grad.addColorStop(1, 'rgba(60,40,10,0.0)')
  ctx.fillStyle = grad
  ctx.fillRect(-w * 2, -h * 2, w * 4, h * 4)
  ctx.strokeStyle = 'rgba(255,191,0,0.28)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(-w * 2, 0); ctx.lineTo(w * 2, 0); ctx.stroke()
  ctx.restore()
  // embers
  const dt = 1 / 60
  for (const p of particles) {
    p.y -= p.v * dt
    p.x += Math.sin(ts / 1700 + p.a * 9) * 0.15
    if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w }
    ctx.fillStyle = altK > 0.5 ? `rgba(220,230,255,${0.15 + p.a * 0.5})` : `rgba(255,${180 + Math.floor(p.a * 60)},120,${0.15 + p.a * 0.35})`
    ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill()
  }
}

watch(() => props.recordId, () => { sceneIndex.value = 0; startScene() })
onMounted(() => {
  startScene()
  raf = requestAnimationFrame(tick)
  window.addEventListener('keydown', onKey, true)
  rootRef.value && rootRef.value.focus()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(typeTimer)
  clearTimeout(holdTimer)
  window.removeEventListener('keydown', onKey, true)
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
})
</script>

<style scoped>
.st-root { position: absolute; inset: 0; z-index: 50; background: #04060c; color: var(--bb-text); overflow: hidden; cursor: pointer; outline: none; font-family: var(--bb-font); }
.st-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.st-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 180px 60px rgba(0,0,0,0.85); }
.st-top { position: absolute; top: 10px; left: 16px; right: 16px; display: flex; align-items: center; gap: 12px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--bb-muted); z-index: 2; }
.st-count { flex: 1; letter-spacing: 0.1em; }
.st-ctl { display: flex; gap: 4px; cursor: default; }
.st-scene { position: absolute; inset: 40px 8% 60px; display: flex; flex-direction: column; justify-content: center; gap: 10px; animation: st-in 0.9s ease-out; max-width: 900px; margin: 0 auto; }
@keyframes st-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.st-date { font-family: var(--bb-mono); font-size: 14px; letter-spacing: 0.3em; color: var(--bb-muted); }
.st-h1 { font-size: clamp(30px, 6vw, 64px); margin: 0; line-height: 1.05; font-weight: 600; letter-spacing: -0.02em; }
.st-h2 { font-size: clamp(22px, 3.5vw, 36px); margin: 0; }
.st-sub { font-size: 14px; color: #b8c6e3; }
.st-big { margin-top: 16px; font-size: clamp(36px, 7vw, 72px); font-weight: 700; color: #ff6a5c; line-height: 1; }
.st-big span { font-size: 14px; font-weight: 400; color: #b8c6e3; display: block; margin-top: 6px; }
.st-big.st-ok { color: #22e08a; }
.st-label { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--bb-accent); }
.st-route { display: flex; align-items: center; gap: 14px; font-size: 20px; }
.st-route-arrow { color: var(--bb-accent); animation: st-fly 3s ease-in-out infinite; }
@keyframes st-fly { 0%, 100% { transform: translateX(-4px); } 50% { transform: translateX(4px); } }
.st-text { font-size: clamp(16px, 2.2vw, 24px); line-height: 1.5; margin: 0; color: #f0f4ff; max-width: 820px; }
.st-text.small { font-size: clamp(13px, 1.5vw, 17px); }
.st-cursor { color: var(--bb-accent); animation: st-blink 0.7s step-end infinite; }
@keyframes st-blink { 50% { opacity: 0; } }
.st-clock { font-family: var(--bb-mono); font-size: clamp(28px, 5vw, 48px); color: #fff; letter-spacing: 0.06em; font-variant-numeric: tabular-nums; }
.st-actor { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ff8a5c; }
.actor-ATC { color: #4c8dff; } .actor-SYS { color: #c792ea; } .actor-ENV { color: #8fb3ff; } .actor-FO, .actor-PM, .actor-PNF { color: #22e08a; }
.st-kind { color: var(--bb-muted); font-weight: 400; letter-spacing: 0.05em; }
.st-state { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.st-inst { background: rgba(19,23,30,0.8); border: 1px solid var(--bb-line-2); border-radius: var(--bb-radius); padding: 6px 10px; display: flex; flex-direction: column; min-width: 78px; animation: st-in 0.6s ease-out both; }
.st-inst-k { font-size: 9px; color: var(--bb-muted); letter-spacing: 0.1em; }
.st-inst-v { font-family: var(--bb-mono); font-size: 16px; color: var(--bb-accent-2); font-variant-numeric: tabular-nums; }
.st-factors { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.st-cvr { margin-top: 10px; border-left: 2px solid var(--bb-line); padding-left: 10px; }
.st-cvr-line { font-size: 14px; font-style: italic; color: #d3ddf0; line-height: 1.5; }
.st-cvr-spk { font-style: normal; font-weight: 700; font-size: 10px; color: var(--bb-accent); margin-right: 6px; }
.st-chain { display: flex; flex-direction: column; gap: 6px; }
.st-chain-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; animation: st-in 0.6s ease-out both; }
.st-chain-row .bb-chip { font-size: 12.5px; height: 26px; padding: 0 11px; }
.st-arrow { color: var(--bb-accent); font-weight: 700; font-size: 16px; }
.st-list { display: flex; flex-direction: column; gap: 10px; }
.st-list-item { font-size: 15px; line-height: 1.45; animation: st-in 0.7s ease-out both; display: flex; gap: 12px; align-items: baseline; }
.st-list-head { font-family: var(--bb-mono); font-size: 11px; color: var(--bb-accent); white-space: nowrap; min-width: 60px; }
.st-audio { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; cursor: default; }
.st-audio-item { font-size: 12px; color: #d3ddf0; }
.st-audio-el { display: block; width: min(420px, 100%); height: 30px; margin-top: 3px; }
.st-readmore { color: var(--bb-blue); }
.st-end-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 16px; cursor: default; }
.st-progress { position: absolute; left: 16px; right: 16px; bottom: 30px; display: flex; gap: 3px; z-index: 2; }
.st-seg { flex: 1; height: 3px; background: rgba(255,255,255,0.14); border-radius: 2px; overflow: hidden; cursor: pointer; }
.st-seg-fill { height: 100%; background: var(--bb-accent); transition: width 0.2s linear; }
.st-hint { position: absolute; bottom: 10px; left: 16px; font-size: 10px; }
</style>
