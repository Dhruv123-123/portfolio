<template>
  <div class="fr-root" ref="rootRef" :class="{ theatre: theatre, cinematic: camera === 'cinematic' }">
    <div class="fr-main" v-if="fdr">
      <div class="fr-left">
        <div class="fr-3d" :class="{ warn: warnLevel > 0, danger: warnLevel > 1 }">
          <canvas ref="sceneCanvas" class="fr-scene"></canvas>
          <canvas ref="hudCanvas" class="fr-hud" v-show="camera === 'cockpit'"></canvas>
          <div class="fr-vignette" :style="{ opacity: vignette }"></div>
          <div class="fr-bars" v-if="camera === 'cinematic'"></div>

          <!-- record chip -->
          <label class="fr-chip" title="Choose a replay">
            <span class="bb-agency">{{ record.agency }}</span>
            <span class="fr-chip-title">{{ record.title }}</span>
            <span class="fr-chip-sub">{{ record.aircraft.type }} · {{ record.date.slice(0, 4) }}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"></path></svg>
            <select class="fr-chip-select" v-model="replayId">
              <option v-for="r in replayable" :key="r.id" :value="r.id">{{ r.title }} — {{ r.aircraft.type }} ({{ r.date.slice(0, 4) }}){{ r.fdr && fidelityOf(r) ? ' · ' + fidelityOf(r) : '' }}</option>
            </select>
          </label>
          <div class="fr-env bb-muted" :title="fdr.source">{{ envLabel }} · {{ fdr.fidelity }} · confidence {{ fdr.confidence || 'medium' }}</div>

          <div class="fr-marker-toast" v-if="activeMarker">{{ activeMarker.label }}</div>
          <div v-for="a in annotations" :key="a.key" class="fr-tag" :class="{ dim: a.age > 25, formation: a.kind === 'formation' }" :style="{ left: a.x + 'px', top: a.y + 'px', opacity: a.opacity, '--tint': a.tint || '' }">
            <span class="fr-tag-dot"></span><span class="fr-tag-text">{{ a.label }}</span>
          </div>
          <div v-if="ghost" class="fr-ghost-note">ghost holds {{ Math.round(ghost.alt).toLocaleString() }} ft · {{ Math.round(ghost.hdg) }}° · {{ Math.round(ghost.gs) }} kt from {{ formatClock(record.t0, ghost.t) }}</div>
          <div v-if="slowmo" class="fr-slowmo">slow motion</div>
          <div v-if="fgBridge.state === 'connected'" class="fr-fg-live">● FlightGear live · {{ fgSent }} frames</div>
          <div class="fr-scene-hint bb-muted">{{ camera === 'orbit' ? 'drag to orbit · wheel to zoom' : camera === 'cockpit' ? 'head-up display · the flight path vector shows where the aircraft is actually going' : camera === 'cinematic' ? 'auto-directed cameras' : 'trail: flown path · faint: full path' }}</div>

          <div v-if="ended" class="fr-ended" @click="seek(fdr.t_start)">
            <div class="fr-ended-t">{{ clock }}</div>
            <div class="fr-ended-l">end of recording</div>
            <div class="fr-ended-s" v-if="record.fatalities > 0">{{ record.fatalities }} of {{ record.occupants ?? '?' }} on board did not survive</div>
            <div class="fr-ended-s" v-else>everyone on board survived</div>
            <div class="fr-ended-h bb-muted">click to rewind · <span class="bb-link" @click.stop="store.openTimeline(record.id)">what the investigators found ▸</span></div>
          </div>
          <div v-if="decoding" class="fr-decode">
            <div class="fr-decode-title">DECODING FLIGHT RECORDER</div>
            <div class="fr-decode-sub">{{ record.aircraft.registration || record.title }} · {{ Object.keys(fdr.params).length }} parameters · {{ fdr.t_end - fdr.t_start }} s</div>
            <pre class="fr-decode-hex">{{ hexLines }}</pre>
          </div>

          <!-- parameter drawer -->
          <div class="fr-drawer" :class="{ open: drawerOpen }">
            <button class="fr-drawer-handle" @click="drawerOpen = !drawerOpen" :title="drawerOpen ? 'hide parameters' : 'show parameters'">{{ drawerOpen ? '▾ parameters' : '▴ parameters' }}</button>
            <canvas ref="stripCanvas" class="fr-strips" v-show="drawerOpen"></canvas>
          </div>

          <!-- layers popover -->
          <div v-if="layersOpen" class="fr-layers" @click.stop>
            <div class="fr-layers-h">Sound</div>
            <label class="fr-row"><span>Engine and slipstream <small>synthesized live from N1 and airspeed (M)</small></span><input type="checkbox" :checked="store.sound" @change="toggleSound" /></label>
            <label class="fr-row" :class="{ off: !trackSheet }"><span>Crew voices <small>{{ trackSheet ? spokenCount + ' lines, one voice per seat, timed to the transcript' : 'no transcript for this record' }}</small></span><input type="checkbox" v-model="trackVoices" :disabled="!trackSheet" /></label>
            <label class="fr-row" :class="{ off: !trackSheet }"><span>Cockpit warnings <small>{{ trackSheet ? warningCount + ' cues from the recorded flags' : 'live synthesis only' }}</small></span><input type="checkbox" v-model="trackWarnings" :disabled="!trackSheet" /></label>
            <label class="fr-row" :class="{ off: !recordings.length }"><span>Real tape <small>{{ recordings.length ? currentRec.kind === 'cvr' ? 'released cockpit voice recorder' : 'air traffic control side' : 'none openly licensed' }}</small></span><input type="checkbox" :checked="deckOn" :disabled="!recordings.length" @change="toggleDeck" /></label>
            <div v-if="deckOn" class="fr-row fr-row-deck">
              <select v-if="recordings.length > 1" class="bb-select" v-model="recIdx"><option v-for="(r, i) in recordings" :key="i" :value="i">{{ r.title }}</option></select>
              <button class="bb-btn small" @click="markAlign" title="The tape is at this moment of the replay right now">align here</button>
              <label class="bb-muted">offset <input type="number" class="bb-input fr-num" v-model.number="deckOffset" step="1" /> s</label>
              <span class="bb-muted fr-deck-clock">{{ deckClock }}</span>
              <a :href="currentRec.page" target="_blank" rel="noopener" class="bb-link">source</a>
              <audio ref="deckEl" :src="currentRec.url" preload="metadata" @loadedmetadata="onDeckMeta" @error="deckError = true"></audio>
              <span v-if="deckError" class="fr-err">could not load</span>
            </div>
            <div class="fr-layers-h">Scene</div>
            <label class="fr-row"><span>Event tags in the sky</span><input type="checkbox" v-model="annotationsOn" /></label>
            <label class="fr-row"><span>Ghost from here <small>holds altitude, heading and speed of this instant</small></span><input type="checkbox" :checked="!!ghost" @change="toggleGhost" /></label>
            <label class="fr-row"><span>Formation <small>every replay abreast from t=0</small></span><input type="checkbox" :checked="formationOn" @change="toggleFormation" /></label>
            <label class="fr-row"><span>Quality</span><select class="bb-select" v-model="quality"><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select></label>
            <div class="fr-layers-h">FlightGear</div>
            <div class="fr-row fr-row-fg">
              <button class="bb-btn small" @click="downloadFg" title="A zip with the trajectory in FlightGear's generic protocol, the protocol file, the fgfs command line and a README">Download package</button>
              <button class="bb-btn small" :class="{ active: fgBridge.state === 'connected' }" @click="toggleFg" :title="'Drive a running FlightGear from this replay: start it with --httpd=8080 --fdm=null'">{{ fgBridge.state === 'connected' ? 'Disconnect' : fgBridge.state === 'connecting' ? 'Connecting…' : 'Connect live' }}</button>
              <input class="bb-input fr-fg-url" v-model="fgUrl" spellcheck="false" />
            </div>
            <div class="fr-fg-status bb-muted">{{ fgStatus }}</div>
          </div>

          <!-- transport -->
          <div class="fr-transport">
            <div class="fr-tr-left">
              <button class="fr-ib" @click="seek(fdr.t_start)" title="rewind"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path></svg></button>
              <button class="fr-play" @click="togglePlay" :title="playing ? 'pause (space)' : 'play (space)'">
                <svg v-if="!playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l11-7z"></path></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>
              </button>
              <button class="fr-ib fr-speed" @click="cycleSpeed" @wheel.prevent="wheelSpeed" title="playback speed · click to cycle, wheel to adjust">{{ speed }}×</button>
            </div>
            <div class="fr-tr-mid">
              <div class="fr-scrub" ref="scrubRef" @mousedown="scrubStart" @touchstart.prevent="scrubStart">
                <div class="fr-scrub-track"><div class="fr-scrub-fill" :style="{ width: pct(time) + '%' }"></div></div>
                <div v-for="(m, i) in fdr.markers" :key="i" class="fr-scrub-marker" :style="{ left: pct(m.t) + '%' }" :title="m.label"></div>
                <div v-for="(c, i) in record.cvr || []" :key="'c' + i" class="fr-scrub-cvr" :style="{ left: pct(c.t) + '%' }"></div>
                <div class="fr-scrub-head" :style="{ left: pct(time) + '%' }"></div>
              </div>
              <div class="fr-scrub-ticks bb-muted"><span v-for="(tk, i) in ticks" :key="i">{{ tk }}</span></div>
            </div>
            <div class="fr-tr-right">
              <div class="fr-clock">
                <div class="fr-clock-t">{{ clock }}</div>
                <div class="fr-clock-s bb-muted">{{ record.time_reference || '' }} · t{{ time >= 0 ? '+' : '' }}{{ time.toFixed(1) }} s</div>
              </div>
              <div class="fr-sep"></div>
              <div class="fr-cams" role="group" aria-label="camera">
                <button v-for="c in cameras" :key="c" class="fr-cam" :class="{ active: camera === c }" @click="setCamera(c)" :title="camTitle[c]" v-html="camIcon[c]"></button>
              </div>
              <button class="fr-ib fr-layers-btn" :class="{ active: layersOpen }" @click="layersOpen = !layersOpen" title="Sound, scene and FlightGear layers (L)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 13l9 5 9-5"></path></svg>
                <span>Layers</span><span class="fr-badge" v-if="layerCount">{{ layerCount }}</span>
              </button>
              <button class="fr-ib" :class="{ active: theatre }" @click="toggleTheatre" title="theatre (F)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"></path></svg></button>
            </div>
          </div>
        </div>
      </div>

      <div class="fr-right">
        <div class="fr-panel-tabs">
          <button class="fr-ptab" :class="{ active: panel === 'pfd' }" @click="panel = 'pfd'">PFD</button>
          <button class="fr-ptab" :class="{ active: panel === 'wx' }" @click="panel = 'wx'">ND · WX</button>
          <button class="fr-ptab" :class="{ active: panel === 'radar' }" @click="panel = 'radar'">Scope</button>
          <span class="bb-muted fr-panel-hint">{{ panel === 'pfd' ? 'primary flight display' : panel === 'wx' ? 'weather radar · heading up' : 'ATC scope · whole track' }}</span>
        </div>
        <canvas ref="pfdCanvas" class="fr-pfd"></canvas>
        <canvas ref="ctlCanvas" class="fr-ctl"></canvas>
        <div class="fr-cvr">
          <div class="fr-cvr-head">
            <span>CVR</span>
            <span class="bb-muted" v-if="!(record.cvr && record.cvr.length)">no public transcript · report events</span>
            <span class="bb-muted" v-else-if="trackSheet">{{ spokenCount }} lines · voices {{ trackVoices ? 'on, press play' : 'off' }}</span>
          </div>
          <div class="fr-cvr-list bb-scroll" ref="cvrList">
            <div v-for="(line, i) in transcript" :key="i" class="fr-cvr-line" :class="{ past: line.t < time, current: i === currentLine, speaking: i === speakingLine, event: line.kind === 'event' }" @click="seek(line.t)">
              <span class="fr-cvr-t">{{ line.clock || fmt(line.t) }}</span>
              <span class="fr-cvr-spk" :class="'spk-' + (line.speaker || '').toLowerCase()">{{ line.speaker }}</span>
              <span class="fr-cvr-text">{{ line.text }}<span v-if="line.translation" class="fr-cvr-tr"> — {{ line.translation }}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="bb-center">
      <div class="bb-spinner"></div>
      <div>Loading FDR keyframes…</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { sampleAll, integrateTrack, trackAt, series, paramRange, formatClock, formatRelative } from './lib/fdr.js'
import { drawPFD, drawControls } from './lib/pfd.js'
import { drawHUD, drawRadar, drawWeatherRadar } from './lib/hud.js'
import { ReplayScene } from './lib/scene.js'
import { ReplayAudio } from './lib/audio.js'
import { CockpitTrack } from './lib/cockpitTrack.js'
import { FlightGearBridge, geoTrack, geoAt, downloadPackage } from './lib/flightgear.js'
import { audioContext } from './lib/synth.js'

const props = defineProps({ graph: Object, index: Object })
const store = useBlackboxStore()

const fdrFiles = import.meta.glob('@/data/blackbox/fdr/*.json')

const replayable = computed(() => props.graph.records.filter((r) => r.fdr).slice().sort((a, b) => (b.interest || (b.tier ? 0 : 100)) - (a.interest || (a.tier ? 0 : 100)) || a.date.localeCompare(b.date)))
const replayId = ref(store.replayId && props.index.byId[store.replayId]?.fdr ? store.replayId : replayable.value.find((r) => r.id === 'af447')?.id || replayable.value[0]?.id)
const record = computed(() => props.index.byId[replayId.value])
const fdr = shallowRef(null)
const track = shallowRef(null)
const fidelityOf = (r) => props.graph.fdr_fidelity?.[r.fdr] || ''

const rootRef = ref(null)
const sceneCanvas = ref(null)
const hudCanvas = ref(null)
const pfdCanvas = ref(null)
const ctlCanvas = ref(null)
const stripCanvas = ref(null)
const scrubRef = ref(null)
const cvrList = ref(null)

const playing = ref(false)
const speed = ref(1)
const speeds = [0.25, 0.5, 1, 2, 4]
const cameras = ['chase', 'cockpit', 'cinematic', 'side', 'front', 'ground', 'orbit']
const camTitle = { chase: 'chase · behind the aircraft', cockpit: 'cockpit · head-up display', cinematic: 'cinematic · auto-directed cuts, slow motion at markers', side: 'abeam', front: 'ahead, looking back', ground: 'fixed near the end of the track', orbit: 'free orbit · drag' }
const ico = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const camIcon = {
  chase: ico('<path d="M3 12l7-7v4h8v6h-8v4z"></path>'),
  cockpit: ico('<circle cx="12" cy="12" r="3"></circle><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path>'),
  cinematic: ico('<rect x="3" y="6" width="13" height="12" rx="2"></rect><path d="M16 10l5-3v10l-5-3z"></path>'),
  side: ico('<path d="M2 12h20M14 6l6 6-6 6"></path>'),
  front: ico('<path d="M22 12H2M10 6l-6 6 6 6"></path>'),
  ground: ico('<path d="M3 20h18M6 20V10l6-4 6 4v10"></path>'),
  orbit: ico('<circle cx="12" cy="12" r="4"></circle><ellipse cx="12" cy="12" rx="10" ry="4"></ellipse>')
}
const camera = ref('chase')
const panel = ref('pfd')
const time = ref(0)
const activeMarker = ref(null)
const theatre = ref(false)
const ended = ref(false)
const decoding = ref(false)
const hexLines = ref('')
const vignette = ref(0)
const warnLevel = ref(0)
const env = ref({ night: 0, rain: 0, storm: false, fog: 0 })
const ghost = ref(null)
const slowmo = ref(false)
const annotationsOn = ref(true)
const annotations = ref([])
const formationOn = ref(false)
const layersOpen = ref(false)
const drawerOpen = ref(true)
const quality = ref('high')
let formationEntries = []
const tintCss = ['#9fd8ff', '#ffb3e6', '#b8ffb0', '#ffe08a', '#d0b3ff', '#ffc7a0']
let prevStall = false

// Real tape deck (openly licensed recordings, <audio> element synced to the clock)
const deckEl = ref(null)
const recIdx = ref(0)
const deckOn = ref(false)
const deckOffset = ref(0)
const deckVol = ref(0.9)
const deckDur = ref(0)
const deckError = ref(false)
const recordings = computed(() => {
  const list = (record.value && record.value.audio) || []
  const pref = { ogg: 0, oga: 0, mp3: 1, opus: 2, webm: 3, wav: 4, flac: 5 }
  const byBase = {}
  for (const a of list) {
    const base = a.title.replace(/\.[a-z0-9]+$/i, '')
    const ext = (a.title.split('.').pop() || '').toLowerCase()
    if (!(ext in pref)) continue
    if (!byBase[base] || pref[ext] < pref[byBase[base].ext]) byBase[base] = { ...a, ext }
  }
  return Object.values(byBase)
})
const currentRec = computed(() => recordings.value[Math.min(recIdx.value, recordings.value.length - 1)] || {})
const deckClock = computed(() => {
  const el = deckEl.value
  if (!el || !deckDur.value) return 'not loaded'
  const f = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`
  return `${f(el.currentTime || 0)} / ${f(deckDur.value)}`
})
function onDeckMeta() { deckDur.value = deckEl.value ? deckEl.value.duration || 0 : 0; deckError.value = false }
function toggleDeck() {
  deckOn.value = !deckOn.value
  nextTick(() => {
    const el = deckEl.value
    if (!el) return
    if (deckOn.value) { if (deckOffset.value === 0 && fdr.value) deckOffset.value = fdr.value.t_start; el.volume = deckVol.value; if (playing.value) el.play().catch(() => (deckError.value = true)) } else el.pause()
  })
}
function markAlign() { const el = deckEl.value; if (el) deckOffset.value = Math.round((time.value - el.currentTime) * 10) / 10 }
function syncDeck() {
  const el = deckEl.value
  if (!el || !deckOn.value || !deckDur.value) return
  const want = time.value - deckOffset.value
  el.volume = deckVol.value
  el.playbackRate = Math.max(0.25, Math.min(4, speed.value))
  if (want < 0 || want > deckDur.value) { if (!el.paused) el.pause(); return }
  if (Math.abs(el.currentTime - want) > 0.6) el.currentTime = want
  if (playing.value && el.paused) el.play().catch(() => {})
  if (!playing.value && !el.paused) el.pause()
}
watch(recIdx, () => { deckDur.value = 0; deckError.value = false })

// Cockpit track: pre-rendered crew voices and warnings scheduled on the audio clock
const trackSheet = ref(null)
const trackVoices = ref(true)
const trackWarnings = ref(true)
const cockpit = new CockpitTrack(() => audioContext())
const spokenCount = computed(() => (trackSheet.value ? trackSheet.value.cues.filter((c) => c.kind === 'cvr' || c.kind === 'atc').length : 0))
const warningCount = computed(() => (trackSheet.value ? trackSheet.value.cues.filter((c) => c.kind !== 'cvr' && c.kind !== 'atc').length : 0))
const speakingLine = computed(() => {
  if (!trackSheet.value) return -1
  const i = cockpit.current(time.value)
  if (i < 0) return -1
  const cue = trackSheet.value.cues[i]
  return transcript.value.findIndex((l) => l.kind === 'cvr' && Math.abs(l.t - cue.t) < 0.01 && l.text === cue.text)
})
watch([trackVoices, trackWarnings], () => { cockpit.enabled = { cvr: trackVoices.value, atc: trackVoices.value, warnings: trackWarnings.value }; if (audio) audio.warnings = !(trackSheet.value && trackWarnings.value) })

// FlightGear
const fgUrl = ref('ws://localhost:8080/PropertyListener')
const fgBridge = ref(new FlightGearBridge())
const fgSent = ref(0)
const fgStatus = ref('Start FlightGear with --httpd=8080 --fdm=null at the crash site (the package has the command), then connect.')
let geo = null
function toggleFg() {
  const b = fgBridge.value
  if (b.state === 'connected' || b.state === 'connecting') { b.disconnect(); return }
  b.url = fgUrl.value
  b.onState = (state, msg) => { fgStatus.value = state === 'connected' ? 'Connected. The replay drives FlightGear\'s position and attitude while it plays.' : state === 'error' ? msg : state === 'connecting' ? 'Connecting…' : 'Not connected.'; fgBridge.value = b }
  b.connect()
}
function downloadFg() { if (record.value && fdr.value) downloadPackage(record.value, fdr.value) }

let scene = null
let raf = null
let lastTs = 0
let resizeObs = null
let stripCache = null
let decodeTimer = null
let audio = null
let lightningFlash = 0

const clock = computed(() => (record.value ? formatClock(record.value.t0, time.value) : ''))
const fmt = (t) => formatRelative(Math.round(t))
const pct = (t) => (fdr.value ? ((t - fdr.value.t_start) / (fdr.value.t_end - fdr.value.t_start)) * 100 : 0)
const ticks = computed(() => {
  if (!fdr.value) return []
  const n = 4
  return Array.from({ length: n + 1 }, (_, i) => formatClock(record.value.t0, fdr.value.t_start + ((fdr.value.t_end - fdr.value.t_start) * i) / n))
})
const layerCount = computed(() => [store.sound, trackSheet.value && trackVoices.value, deckOn.value, annotationsOn.value, !!ghost.value, formationOn.value, fgBridge.value.state === 'connected'].filter(Boolean).length)
const envLabel = computed(() => {
  const e = env.value
  const parts = [e.night > 0.6 ? 'night' : e.night > 0 ? 'dusk' : 'day']
  if (e.storm) parts.push('thunderstorm')
  else if (e.rain > 0) parts.push('precipitation')
  if (e.fog > 0) parts.push('low visibility')
  return parts.join(' · ')
})

const transcript = computed(() => {
  const rec = record.value
  if (!rec) return []
  const lines = (rec.cvr || []).map((c) => ({ ...c, kind: 'cvr' }))
  const events = (rec.events || []).filter((e) => e.kind !== 'crew_speech' || !lines.length).map((e) => ({ t: e.t, clock: e.clock, speaker: e.actor, text: e.text, kind: 'event' }))
  return [...lines, ...events].sort((a, b) => a.t - b.t)
})
const currentLine = computed(() => {
  let idx = -1
  for (let i = 0; i < transcript.value.length; i++) if (transcript.value[i].t <= time.value) idx = i
  return idx
})

function computeEnv(rec, f) {
  const out = { night: 0, rain: 0, storm: false, fog: 0 }
  const t0 = rec.t0 || ''
  const m = String(t0).match(/T(\d\d):(\d\d)/)
  const off = String(t0).match(/([+-])(\d\d):?(\d\d)$/)
  if (m) {
    let hour = +m[1] + +m[2] / 60
    if (!off && rec.location && typeof rec.location.lon === 'number' && /Z$/.test(t0)) hour = (hour + rec.location.lon / 15 + 24) % 24
    out.night = hour < 5 || hour > 20.5 ? 1 : hour < 6.5 || hour > 18.5 ? 0.5 : 0
  }
  const ids = (rec.factors || []).map((x) => x.id).join(' ') + ' ' + (rec.summary || '').toLowerCase()
  if (/thunderstorm|convective|lightning|microburst|windshear|wind_shear/.test(ids)) { out.storm = true; out.rain = 1 }
  else if (/\b(heavy rain|rain|precipitation|hail|sleet)\b/.test(ids)) out.rain = 0.7
  else if (/\b(icing|ice_crystals?|ice crystals|snow)\b/.test(ids)) out.rain = 0.35
  if (/\b(fog|low_visibility|low visibility|imc|whiteout)\b/.test(ids)) out.fog = 0.8
  if (f.env) Object.assign(out, f.env)
  return out
}

async function loadFdr(id) {
  const rec = props.index.byId[id]
  if (!rec || !rec.fdr) return
  const key = Object.keys(fdrFiles).find((k) => k.endsWith(`/${rec.fdr}.json`))
  if (!key) return
  startDecoding()
  const mod = await fdrFiles[key]()
  fdr.value = mod.default
  track.value = integrateTrack(fdr.value)
  env.value = computeEnv(rec, fdr.value)
  time.value = store.replayTime ?? fdr.value.t_start
  store.replayTime = null
  playing.value = false
  ended.value = false
  stripCache = null
  geo = null
  ghost.value = null
  deckOn.value = false
  deckOffset.value = 0
  recIdx.value = 0
  if (audio) { audio._prev = null; audio.setRain(env.value.rain) }
  cockpit.stopAll()
  trackSheet.value = await cockpit.load(rec.id)
  if (audio) audio.warnings = !(trackSheet.value && trackWarnings.value)
  if (trackSheet.value) cockpit.preload()
  await nextTick()
  initScene()
  if (formationOn.value) await loadFormation()
  if (store.replayAutoplay && Date.now() - store.replayAutoplay < 5000) { setCamera('cinematic'); playing.value = true; if (store.sound && audio) audio.enable(family()) }
  renderFrame(0)
}

function startDecoding() {
  decoding.value = true
  clearInterval(decodeTimer)
  const t0 = performance.now()
  const hex = () => Array.from({ length: 14 }, () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')).join(' ')
  const lines = []
  decodeTimer = setInterval(() => {
    lines.push(`${String(lines.length * 64).padStart(6, '0')}  ${hex()}`)
    if (lines.length > 9) lines.shift()
    hexLines.value = lines.join('\n')
    if (performance.now() - t0 > 1500) { clearInterval(decodeTimer); decoding.value = false }
  }, 70)
}

function initScene() {
  if (scene) { scene.dispose(); scene = null }
  if (!sceneCanvas.value) return
  try {
    scene = new ReplayScene(sceneCanvas.value, { onLightning: () => { lightningFlash = 1; if (audio && audio.enabled) audio._tone(60, audio.ctx.currentTime + 0.4 + Math.random() * 1.5, 1.6, { type: 'sawtooth', gain: 0.18, glideTo: 30 }) } })
    scene.setup(fdr.value, track.value, env.value)
    scene.setCameraMode(camera.value)
    scene.setQuality(quality.value)
    scene.resize()
    if (import.meta.env.DEV || location.hostname === 'localhost') { window.__bbScene = scene; window.__bbCockpit = cockpit }
  } catch (e) {
    console.error('WebGL scene failed', e)
    scene = null
  }
}
watch(quality, (q) => scene && scene.setQuality(q))

async function loadFormation() {
  const others = replayable.value.filter((r) => r.id !== replayId.value && props.index.byId[r.id]?.fdr).slice(0, 6)
  const entries = []
  for (const r of others) {
    const key = Object.keys(fdrFiles).find((k) => k.endsWith(`/${r.fdr}.json`))
    if (!key) continue
    const mod = await fdrFiles[key]()
    const f = mod.default
    const tr = integrateTrack(f)
    entries.push({ id: r.id, title: r.title, fdr: f, track: tr, sample: (t) => sampleAll(f, t), trackAt: (t) => trackAt(tr, t) })
  }
  formationEntries = entries
  scene && scene.setFormation(entries)
}
async function toggleFormation() {
  formationOn.value = !formationOn.value
  if (formationOn.value) await loadFormation()
  else { formationEntries = []; scene && scene.clearFormation() }
}
function toggleGhost() {
  if (!scene || !fdr.value) return
  if (ghost.value) { scene.clearGhost(); ghost.value = null; return }
  const s = sampleAll(fdr.value, time.value)
  const pos = trackAt(track.value, time.value)
  scene.setGhost(time.value, pos, s)
  ghost.value = { t: time.value, alt: pos.y, hdg: (((s.hdg_deg || 0) % 360) + 360) % 360, gs: s.gs_kt || s.ias_kt || 0 }
}
function setCamera(c) { camera.value = c; scene && scene.setCameraMode(c) }
function cycleCamera() { setCamera(cameras[(cameras.indexOf(camera.value) + 1) % cameras.length]) }
function cycleSpeed() { speed.value = speeds[(speeds.indexOf(speed.value) + 1) % speeds.length] }
function wheelSpeed(e) { const i = speeds.indexOf(speed.value); speed.value = speeds[Math.max(0, Math.min(speeds.length - 1, i + (e.deltaY < 0 ? 1 : -1)))] }

function togglePlay() {
  if (!fdr.value) return
  if (!playing.value && time.value >= fdr.value.t_end) time.value = fdr.value.t_start
  ended.value = false
  playing.value = !playing.value
  if (playing.value && store.sound && audio) audio.enable(family())
  if (playing.value && trackSheet.value) { audioContext(); cockpit.preload() }
  if (!playing.value) cockpit.stopAll()
}
function seek(t) {
  if (!fdr.value) return
  if (audio && audio.enabled && t < time.value - 3) audio.rewind()
  time.value = Math.max(fdr.value.t_start, Math.min(fdr.value.t_end, t))
  ended.value = false
  if (audio) audio._prev = null
  cockpit.stopAll()
  renderFrame(2)
}
function family() {
  const mf = (record.value?.aircraft?.manufacturer || record.value?.aircraft?.type || '').toLowerCase()
  return mf.includes('airbus') ? 'airbus' : mf.includes('boeing') || mf.includes('mcdonnell') || mf.includes('douglas') ? 'boeing' : 'other'
}
function toggleSound() {
  if (!audio) audio = new ReplayAudio()
  store.sound = !store.sound
  audio.voice = false // browser speech is replaced by the rendered cockpit track
  audio.warnings = !(trackSheet.value && trackWarnings.value)
  if (store.sound) { audio.enable(family()); audio.setRain(env.value.rain) } else audio.disable()
}
function toggleTheatre() {
  const el = rootRef.value
  if (!theatre.value) { theatre.value = true; if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {}) }
  else { theatre.value = false; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}) }
  nextTick(() => { scene && scene.resize(); stripCache = null; renderFrame(2) })
}
function onFullscreenChange() {
  if (!document.fullscreenElement && theatre.value) theatre.value = false
  nextTick(() => { scene && scene.resize(); stripCache = null; renderFrame(2) })
}
function scrubStart(e) {
  const move = (ev) => {
    const rect = scrubRef.value.getBoundingClientRect()
    const src = ev.touches ? ev.touches[0] : ev
    const f = Math.max(0, Math.min(1, (src.clientX - rect.left) / rect.width))
    seek(fdr.value.t_start + f * (fdr.value.t_end - fdr.value.t_start))
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up) }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); window.addEventListener('touchmove', move); window.addEventListener('touchend', up)
  move(e)
}

function fit(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const r = cv.getBoundingClientRect()
  const w = Math.max(1, Math.floor(r.width))
  const h = Math.max(1, Math.floor(r.height))
  if (cv.width !== Math.floor(w * dpr) || cv.height !== Math.floor(h * dpr)) { cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr) }
  const ctx = cv.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

function renderFrame(dt) {
  if (!fdr.value) return
  const s = sampleAll(fdr.value, time.value)
  const pos = trackAt(track.value, time.value)
  if (scene) scene.update(s, pos, dt)
  if (audio && audio.enabled) audio.update(s, dt, playing.value)
  if (trackSheet.value && (trackVoices.value || trackWarnings.value)) cockpit.update(time.value, playing.value, speed.value)
  updateAnnotations(s)
  syncDeck()
  if (fgBridge.value.state === 'connected') {
    if (!geo) geo = geoTrack(record.value, fdr.value)
    const row = geoAt(geo, time.value)
    if (row) { fgBridge.value.push(row); fgSent.value = fgBridge.value.sent }
  }

  const vs = s.vs_fpm || 0
  const ra = typeof s.ra_ft === 'number' ? s.ra_ft : Infinity
  let level = 0
  let g = ''
  if (ra < 2450 && vs < -1400) { level = 1; g = 'SINK RATE' }
  if ((vs < -3000 && ra < 1500) || (vs < -1800 && ra < 500)) { level = 2; g = 'PULL UP' }
  if (s.stall_warn) level = Math.max(level, 2)
  else if (s.law && s.law !== 'NORMAL') level = Math.max(level, 1)
  warnLevel.value = level
  if (s.stall_warn && !prevStall && playing.value && navigator.vibrate) { try { navigator.vibrate([120, 60, 120]) } catch (e) { /* ignore */ } }
  prevStall = !!s.stall_warn
  const pulse = level > 1 ? 0.35 + 0.25 * Math.abs(Math.sin(performance.now() / 180)) : level === 1 ? 0.2 : 0
  vignette.value = Math.max(pulse, lightningFlash * 0.9)
  lightningFlash *= Math.exp(-dt * 6)

  if (camera.value === 'cockpit' && hudCanvas.value) { const { ctx, w, h } = fit(hudCanvas.value); drawHUD(ctx, w, h, s, { gpws: g }) }
  if (pfdCanvas.value) {
    const { ctx, w, h } = fit(pfdCanvas.value)
    if (panel.value === 'radar') drawRadar(ctx, w, h, track.value, time.value, fdr.value, s, record.value.flight_number || record.value.aircraft.registration || '')
    else if (panel.value === 'wx') drawWeatherRadar(ctx, w, h, track.value, time.value, s, env.value, record.value.id)
    else drawPFD(ctx, w, h, s)
  }
  if (ctlCanvas.value) {
    const { ctx, w, h } = fit(ctlCanvas.value)
    const u = fdr.value.units || {}
    drawControls(ctx, w, h, s, { stickLabel: fdr.value.params.column_force_lb ? 'COLUMN / WHEEL' : 'SIDESTICK', thsLabel: u.ths_deg && u.ths_deg.includes('unit') ? 'STAB TRIM' : 'THS', thsUnit: u.ths_deg && u.ths_deg.includes('unit') ? ' units' : '° NU', thsMin: u.ths_deg && u.ths_deg.includes('unit') ? 0 : -5, thsMax: u.ths_deg && u.ths_deg.includes('unit') ? 17 : 15 })
  }
  if (drawerOpen.value && stripCanvas.value) drawStrips(fit(stripCanvas.value), s)
  let m = null
  for (const mk of fdr.value.markers || []) if (mk.t <= time.value && time.value - mk.t < 4) m = mk
  activeMarker.value = m
}

function updateAnnotations(s) {
  if (!scene || !fdr.value) { annotations.value = []; return }
  const out = []
  if (annotationsOn.value && camera.value !== 'cockpit') {
    const marks = fdr.value.markers || []
    for (let i = 0; i < marks.length; i++) {
      const mk = marks[i]
      if (mk.t > time.value) break
      const age = time.value - mk.t
      const p = scene.project(trackAt(track.value, mk.t))
      if (!p.visible) continue
      out.push({ key: 'm' + i, label: mk.label, x: p.x, y: p.y, age, opacity: Math.min(1, age / 0.6) * (age > 25 ? 0.4 : 0.92) * Math.max(0.25, 1 - p.dist / 1500), kind: 'marker' })
    }
  }
  if (formationOn.value && formationEntries.length) {
    const states = scene.updateFormation(time.value)
    states.forEach((st, i) => {
      if (!st) return
      const p = scene.project(st.pos)
      if (!p.visible) return
      const e = formationEntries[i]
      out.push({ key: 'f' + e.id, label: `${e.title} · ${Math.round(st.state.alt_ft || 0).toLocaleString()} ft`, x: p.x, y: p.y, age: 0, opacity: 0.9, kind: 'formation', tint: tintCss[i % tintCss.length] })
    })
  }
  void s
  annotations.value = out
}

const STRIP_PARAMS = [['alt_ft', 'ALT ft', '#8fb3ff'], ['ias_kt', 'IAS kt', '#22e08a'], ['pitch_deg', 'PITCH °', '#ffbf00'], ['aoa_deg', 'AoA °', '#ff8a5c'], ['vs_fpm', 'V/S fpm', '#c792ea'], ['n1_pct', 'N1 %', '#ffffff'], ['ths_deg', 'TRIM', '#ff5cf0'], ['stick_pitch', 'STICK', '#ffd166']]
function drawStrips({ ctx, w, h }, s) {
  const f = fdr.value
  const params = STRIP_PARAMS.filter(([k]) => f.params[k] && f.params[k].keys.length > 1).slice(0, 5)
  const rowH = h / Math.max(1, params.length)
  const x0 = 64
  const x1 = w - 6
  const tx = (t) => x0 + ((t - f.t_start) / (f.t_end - f.t_start)) * (x1 - x0)
  if (!stripCache || stripCache.w !== w || stripCache.h !== h) {
    const off = document.createElement('canvas')
    off.width = ctx.canvas.width
    off.height = ctx.canvas.height
    const o = off.getContext('2d')
    o.setTransform(ctx.getTransform())
    o.fillStyle = 'rgba(11,15,24,0.92)'
    o.fillRect(0, 0, w, h)
    params.forEach(([key, label, color], i) => {
      const y0 = i * rowH
      const [min, max] = paramRange(f.params[key])
      const ty = (v) => y0 + rowH - 4 - ((v - min) / (max - min)) * (rowH - 8)
      o.strokeStyle = '#1c2740'
      o.beginPath(); o.moveTo(x0, y0 + rowH); o.lineTo(x1, y0 + rowH); o.stroke()
      o.strokeStyle = color
      o.lineWidth = 1.2
      o.beginPath()
      const pts = series(f.params[key], f.t_start, f.t_end, Math.floor(x1 - x0))
      pts.forEach(([t, v], j) => { if (typeof v !== 'number') return; j === 0 ? o.moveTo(tx(t), ty(v)) : o.lineTo(tx(t), ty(v)) })
      o.stroke()
      o.fillStyle = '#8fa3c7'; o.font = '9px Tahoma, sans-serif'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillText(label, 4, y0 + 3)
      o.fillStyle = '#566a92'; o.textAlign = 'right'; o.fillText(String(Math.round(max)), x0 - 4, y0 + 2); o.textBaseline = 'bottom'; o.fillText(String(Math.round(min)), x0 - 4, y0 + rowH - 2)
    })
    o.strokeStyle = 'rgba(255,191,0,0.35)'
    for (const mk of f.markers || []) { o.beginPath(); o.moveTo(tx(mk.t), 0); o.lineTo(tx(mk.t), h); o.stroke() }
    stripCache = { w, h, canvas: off }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(stripCache.canvas, 0, 0)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const cx = tx(time.value)
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke()
  params.forEach(([key, , color], i) => {
    const v = s[key]
    if (typeof v !== 'number') return
    ctx.fillStyle = color; ctx.font = 'bold 10px Tahoma, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
    ctx.fillText(Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1), 4, i * rowH + rowH - 2)
  })
}

function loop(ts) {
  raf = requestAnimationFrame(loop)
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0
  lastTs = ts
  if (playing.value && fdr.value) {
    let k = 1
    if (camera.value === 'cinematic') for (const mk of fdr.value.markers || []) { const d = Math.abs(time.value - mk.t); if (d < 2.5) { k = Math.min(k, 0.3 + 0.7 * (d / 2.5)); break } }
    slowmo.value = k < 0.95
    time.value += dt * speed.value * k
    if (time.value >= fdr.value.t_end) { time.value = fdr.value.t_end; playing.value = false; ended.value = true; if (audio) audio._stopStall(); cockpit.stopAll() }
  }
  renderFrame(dt)
}

watch(currentLine, async (i) => {
  await nextTick()
  const el = cvrList.value?.children?.[i]
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: playing.value ? 'smooth' : 'auto' })
})
watch(replayId, (id) => { store.replayId = id; loadFdr(id) })
watch(() => store.replayId, (id) => {
  if (id && id !== replayId.value && props.index.byId[id]?.fdr) replayId.value = id
  else if (id === replayId.value && store.replayTime !== null) { seek(store.replayTime); store.replayTime = null }
})
watch(panel, () => renderFrame(2))
watch(drawerOpen, () => nextTick(() => { stripCache = null; scene && scene.resize(); renderFrame(2) }))
watch(() => store.replayAutoplay, async () => { await nextTick(); setCamera('cinematic'); if (!playing.value) togglePlay() })
watch(() => store.layersRequest, () => { layersOpen.value = true })

onMounted(() => {
  resizeObs = new ResizeObserver(() => { scene && scene.resize(); stripCache = null; renderFrame(2) })
  resizeObs.observe(rootRef.value)
  loadFdr(replayId.value)
  raf = requestAnimationFrame(loop)
  window.addEventListener('keydown', onKey)
  document.addEventListener('mousedown', onDocClick)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  if (store.sound) { audio = new ReplayAudio(); audio.voice = false; audio.enable(family()) }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(decodeTimer)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('mousedown', onDocClick)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  resizeObs && resizeObs.disconnect()
  scene && scene.dispose()
  scene = null
  cockpit.stopAll()
  fgBridge.value.disconnect()
  if (audio) { audio.dispose(); audio = null }
})
function onDocClick(e) { if (layersOpen.value && !e.target.closest('.fr-layers') && !e.target.closest('.fr-layers-btn')) layersOpen.value = false }
function onKey(e) {
  if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
  if (store.storyId) return
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  if (e.code === 'ArrowRight') seek(time.value + (e.shiftKey ? 10 : 1))
  if (e.code === 'ArrowLeft') seek(time.value - (e.shiftKey ? 10 : 1))
  if (e.key === 'c' || e.key === 'C') cycleCamera()
  if (e.key === 'm' || e.key === 'M') toggleSound()
  if (e.key === 'f' || e.key === 'F') toggleTheatre()
  if (e.key === 'g' || e.key === 'G') toggleGhost()
  if (e.key === 'l' || e.key === 'L') layersOpen.value = !layersOpen.value
}
</script>

<style scoped>
.fr-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--bb-bg); }
.fr-root.theatre { position: fixed; z-index: 9999; }
.fr-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 320px; }
.fr-left { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.fr-3d { position: relative; flex: 1; min-height: 0; background: #0b0f18; overflow: hidden; }
.fr-scene { width: 100%; height: 100%; display: block; }
.fr-hud { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.fr-vignette { position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 120px 40px rgba(255, 40, 40, 0.75); transition: opacity 0.12s; }
.fr-3d.warn .fr-vignette { box-shadow: inset 0 0 90px 30px rgba(255, 170, 40, 0.6); }
.fr-3d.danger .fr-vignette { box-shadow: inset 0 0 140px 50px rgba(255, 30, 30, 0.8); }
.fr-bars { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(#000 0, #000 9%, transparent 9%, transparent 91%, #000 91%); }

.fr-chip { position: absolute; top: 12px; left: 14px; z-index: 3; display: flex; align-items: center; gap: 8px; background: rgba(8,12,24,0.7); border: 1px solid var(--bb-line); border-radius: 4px; padding: 6px 10px; backdrop-filter: blur(4px); cursor: pointer; max-width: min(60%, 520px); color: var(--bb-muted); }
.fr-chip:hover { border-color: #3a4a6a; }
.fr-chip-title { font-weight: 700; color: var(--bb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fr-chip-sub { font-size: 11px; white-space: nowrap; }
.fr-chip-select { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.fr-env { position: absolute; top: 18px; right: 14px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; text-shadow: 0 1px 2px #000; cursor: help; z-index: 2; }
.fr-marker-toast { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); background: rgba(8, 12, 24, 0.85); color: var(--bb-accent); font-weight: 700; padding: 6px 12px; border-radius: 4px; border: 1px solid var(--bb-accent); font-size: 12px; white-space: nowrap; max-width: 90%; overflow: hidden; text-overflow: ellipsis; z-index: 2; }
.cinematic .fr-marker-toast { top: auto; bottom: 22%; background: transparent; border: none; font-size: 15px; letter-spacing: 0.06em; text-shadow: 0 1px 4px #000; }
.fr-scene-hint { position: absolute; bottom: 74px; left: 14px; font-size: 10px; text-shadow: 0 1px 2px #000; z-index: 2; }
.fr-tag { position: absolute; transform: translate(-4px, -50%); pointer-events: none; display: flex; align-items: center; gap: 6px; font-size: 10px; color: #ffe6a8; text-shadow: 0 1px 3px #000; white-space: nowrap; transition: opacity 0.3s; z-index: 1; }
.fr-tag-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bb-accent); box-shadow: 0 0 8px var(--bb-accent); flex: none; }
.fr-tag-text { background: rgba(4,6,12,0.55); border: 1px solid rgba(255,191,0,0.35); border-radius: 3px; padding: 1px 6px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.fr-tag.dim .fr-tag-text { border-color: rgba(255,191,0,0.15); }
.fr-tag.formation { color: var(--tint); }
.fr-tag.formation .fr-tag-dot { background: var(--tint); box-shadow: 0 0 8px var(--tint); }
.fr-tag.formation .fr-tag-text { border-color: var(--tint); }
.fr-ghost-note { position: absolute; top: 40px; right: 14px; font-size: 10px; color: #9fd8ff; text-shadow: 0 1px 2px #000; letter-spacing: 0.04em; z-index: 2; }
.fr-slowmo { position: absolute; bottom: 74px; right: 14px; font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase; color: #fff; text-shadow: 0 1px 3px #000; animation: fr-blink 1s step-end infinite; z-index: 2; }
.fr-fg-live { position: absolute; top: 58px; right: 14px; font-size: 10px; color: #22e08a; text-shadow: 0 1px 2px #000; letter-spacing: 0.06em; z-index: 2; }
.fr-ended { position: absolute; inset: 0; background: rgba(0,0,0,0.88); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; z-index: 5; animation: fr-fade 2.2s ease-out; }
.fr-ended-t { font-family: Consolas, monospace; font-size: 42px; color: #fff; letter-spacing: 0.08em; }
.fr-ended-l { font-size: 12px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--bb-accent); }
.fr-ended-s { font-size: 12px; color: #d3ddf0; margin-top: 10px; }
.fr-ended-h { font-size: 10px; margin-top: 14px; }
@keyframes fr-fade { from { opacity: 0; } to { opacity: 1; } }
.fr-decode { position: absolute; inset: 0; background: #04060c; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-family: Consolas, monospace; }
.fr-decode-title { color: var(--bb-accent); letter-spacing: 0.3em; font-size: 13px; animation: fr-blink 0.5s step-end infinite; }
.fr-decode-sub { color: var(--bb-muted); font-size: 11px; }
.fr-decode-hex { color: #3f6b4f; font-size: 10px; line-height: 1.5; margin: 10px 0 0; text-align: left; min-height: 150px; }
@keyframes fr-blink { 50% { opacity: 0.35; } }

/* parameter drawer above the transport */
.fr-drawer { position: absolute; left: 0; right: 0; bottom: 64px; z-index: 3; display: flex; flex-direction: column; align-items: flex-start; }
.fr-drawer-handle { background: rgba(11,15,24,0.85); border: 1px solid var(--bb-line); border-bottom: none; border-radius: 4px 4px 0 0; color: var(--bb-muted); font: inherit; font-size: 10px; padding: 2px 8px; cursor: pointer; margin-left: 14px; }
.fr-drawer-handle:hover { color: var(--bb-text); }
.fr-strips { width: 100%; height: 150px; display: block; border-top: 1px solid var(--bb-line); }
.theatre .fr-strips { height: 100px; }

/* transport */
.fr-transport { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; z-index: 4; background: #070a12; border-top: 1px solid var(--bb-line); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 0 14px; }
.fr-tr-left { display: flex; align-items: center; gap: 6px; }
.fr-ib { height: 30px; min-width: 30px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: 1px solid var(--bb-line); border-radius: 4px; color: var(--bb-text); font: inherit; font-size: 11px; cursor: pointer; }
.fr-ib:hover { border-color: #3a4a6a; }
.fr-ib.active { background: var(--bb-accent); color: #111; border-color: var(--bb-accent); font-weight: 700; }
.fr-play { width: 40px; height: 40px; border-radius: 50%; background: var(--bb-accent); border: none; color: #111; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.fr-play:hover { filter: brightness(1.1); }
.fr-speed { font-family: Consolas, monospace; font-size: 12px; min-width: 44px; }
.fr-tr-mid { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.fr-scrub { position: relative; height: 22px; cursor: pointer; }
.fr-scrub-track { position: absolute; left: 0; right: 0; top: 9px; height: 4px; background: #2a3550; border-radius: 2px; overflow: hidden; }
.fr-scrub-fill { height: 100%; background: var(--bb-accent); }
.fr-scrub-marker { position: absolute; top: 3px; width: 2px; height: 16px; background: var(--bb-accent); opacity: 0.7; }
.fr-scrub-cvr { position: absolute; top: 16px; width: 1px; height: 5px; background: #4c8dff; }
.fr-scrub-head { position: absolute; top: 2px; width: 12px; height: 18px; margin-left: -6px; background: #fff; border-radius: 3px; box-shadow: 0 0 6px #fff; }
.fr-scrub-ticks { display: flex; justify-content: space-between; font-family: Consolas, monospace; font-size: 9px; margin-top: 2px; }
.fr-tr-right { display: flex; align-items: center; gap: 12px; }
.fr-clock { text-align: right; }
.fr-clock-t { font-family: Consolas, monospace; font-size: 22px; font-weight: 700; color: #fff; line-height: 1; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }
.fr-clock-s { font-family: Consolas, monospace; font-size: 10px; margin-top: 3px; }
.fr-sep { width: 1px; height: 30px; background: var(--bb-line); }
.fr-cams { display: flex; gap: 2px; border: 1px solid var(--bb-line); border-radius: 4px; padding: 2px; }
.fr-cam { width: 26px; height: 24px; border-radius: 3px; background: transparent; border: none; color: var(--bb-muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.fr-cam:hover { color: var(--bb-text); }
.fr-cam.active { background: var(--bb-accent); color: #111; }
.fr-badge { font-size: 9px; color: #111; background: var(--bb-accent); border-radius: 8px; padding: 0 5px; font-weight: 700; }
.fr-ib.active .fr-badge { background: #111; color: var(--bb-accent); }

/* layers popover */
.fr-layers { position: absolute; right: 60px; bottom: 74px; width: 300px; z-index: 6; background: #0f1524; border: 1px solid var(--bb-line); border-radius: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.6); padding: 6px 0; max-height: calc(100% - 90px); overflow: auto; }
.fr-layers-h { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--bb-muted); padding: 8px 12px 4px; }
.fr-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 12px; font-size: 11px; cursor: pointer; }
.fr-row small { display: block; font-size: 9px; color: var(--bb-muted); margin-top: 1px; }
.fr-row.off { opacity: 0.5; }
.fr-row input[type='checkbox'] { accent-color: var(--bb-accent); width: 15px; height: 15px; flex: none; }
.fr-row-deck, .fr-row-fg { flex-wrap: wrap; justify-content: flex-start; gap: 6px; cursor: default; }
.fr-num { width: 52px; padding: 1px 4px; font-size: 10px; }
.fr-deck-clock { font-family: Consolas, monospace; font-size: 10px; }
.fr-err { color: var(--bb-danger); font-size: 10px; }
.fr-fg-url { font-size: 10px; padding: 2px 6px; width: 100%; font-family: Consolas, monospace; }
.fr-fg-status { font-size: 10px; padding: 0 12px 6px; line-height: 1.4; }

/* right column */
.fr-right { display: flex; flex-direction: column; border-left: 1px solid var(--bb-line); min-height: 0; }
.fr-panel-tabs { display: flex; gap: 2px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--bb-line); }
.fr-ptab { padding: 3px 10px; border-radius: 3px; background: transparent; border: none; color: var(--bb-muted); font: inherit; font-size: 10px; cursor: pointer; }
.fr-ptab.active { background: var(--bb-accent); color: #111; font-weight: 700; }
.fr-panel-hint { font-size: 9px; margin-left: auto; }
.fr-pfd { width: 100%; height: 250px; display: block; flex: none; }
.fr-ctl { width: 100%; height: 118px; display: block; border-top: 1px solid var(--bb-line); border-bottom: 1px solid var(--bb-line); flex: none; }
.fr-cvr { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.fr-cvr-head { padding: 6px 8px; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bb-muted); display: flex; justify-content: space-between; gap: 6px; border-bottom: 1px solid var(--bb-line); }
.fr-cvr-head .bb-muted { text-transform: none; letter-spacing: 0; }
.fr-cvr-list { flex: 1; overflow: auto; padding: 4px 6px 20px; }
.fr-cvr-line { display: grid; grid-template-columns: 52px 44px 1fr; gap: 6px; padding: 3px 4px; border-radius: 3px; font-size: 11px; line-height: 1.35; cursor: pointer; opacity: 0.5; }
.fr-cvr-line.past { opacity: 0.85; }
.fr-cvr-line.current { opacity: 1; background: #1c2a45; box-shadow: inset 2px 0 0 var(--bb-accent); }
.fr-cvr-line.speaking { background: #23305a; box-shadow: inset 2px 0 0 #9fd8ff; }
.fr-cvr-line.event { font-style: italic; color: #b8c6e3; }
.fr-cvr-t { color: var(--bb-muted); font-family: Consolas, monospace; font-size: 10px; }
.fr-cvr-spk { font-weight: 700; font-size: 10px; color: var(--bb-accent); }
.spk-pf, .spk-capt { color: #ff8a5c; }
.spk-pnf, .spk-pm, .spk-fo { color: #22e08a; }
.spk-atc { color: #4c8dff; }
.spk-sys { color: #c792ea; }
.fr-cvr-tr { color: var(--bb-muted); }
@media (max-width: 900px) {
  .fr-main { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
  .fr-right { border-left: none; border-top: 1px solid var(--bb-line); max-height: 40%; }
  .fr-pfd { height: 200px; }
  .fr-transport { grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; height: auto; padding: 6px 10px; gap: 6px 10px; }
  .fr-tr-right { grid-column: 1 / -1; justify-content: space-between; }
  .fr-drawer { bottom: 96px; }
  .fr-layers { right: 10px; bottom: 100px; width: calc(100% - 20px); }
}
</style>
