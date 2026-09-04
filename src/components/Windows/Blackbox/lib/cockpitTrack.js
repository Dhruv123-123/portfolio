/**
 * Cockpit track player: pre-rendered cue files (spoken CVR lines with a voice per
 * seat, synthesized warnings) scheduled on the Web Audio clock so they land at the
 * exact replay time regardless of frame rate. Cues live under
 * /blackbox/cockpit/<id>/cues.json (see pipeline/audio/render_cockpit_audio.py).
 */
import { publicUrl } from './paths.js'

export class CockpitTrack {
  constructor(getContext) {
    this.getContext = getContext // () => AudioContext (shared with the live synth)
    this.sheet = null
    this.buffers = {}
    this.active = new Map() // cue index -> { src, gain }
    this.enabled = { cvr: true, atc: true, warnings: true }
    this.volume = 1
    this.lastTime = null
    this.lastSpeed = 1
    this.loading = null
    this.id = null
  }

  async load(id) {
    this.stopAll()
    this.sheet = null
    this.buffers = {}
    this.id = id
    if (!id) return null
    this.loading = fetch(publicUrl(`cockpit/${id}/cues.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const sheet = await this.loading
    if (!sheet || sheet.id !== id) return null
    this.sheet = sheet
    return sheet
  }

  async _buffer(file) {
    if (this.buffers[file]) return this.buffers[file]
    const ctx = this.getContext()
    if (!ctx) return null
    const p = fetch(publicUrl(`cockpit/${this.id}/${file}`)).then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)).catch(() => null)
    this.buffers[file] = p
    return p
  }

  /** Warm the decoder for every cue so the first play is on time. */
  async preload() {
    if (!this.sheet) return
    const files = [...new Set(this.sheet.cues.map((c) => c.file))]
    await Promise.all(files.map((f) => this._buffer(f)))
  }

  kindOn(kind) {
    if (kind === 'cvr') return this.enabled.cvr
    if (kind === 'atc') return this.enabled.atc
    return this.enabled.warnings
  }

  /**
   * Called every frame with the replay time. Starts cues whose start falls
   * between the previous and the current time (or, after a seek, cues that are
   * already in progress, started at their offset). Speed scales playback rate
   * of warnings only; speech stays at 1x up to 2x and is muted beyond.
   */
  update(time, playing, speed = 1) {
    if (!this.sheet) return
    if (!playing) { this.stopAll(); this.lastTime = time; return }
    const ctx = this.getContext()
    if (!ctx) return
    const prev = this.lastTime
    const jumped = prev === null || Math.abs(time - prev) > 2.5 * Math.max(1, speed)
    this.sheet.cues.forEach((c, i) => {
      if (this.active.has(i) || !this.kindOn(c.kind)) return
      const startsNow = !jumped && prev !== null && c.t > prev && c.t <= time
      const inProgress = jumped && time >= c.t && time < c.t + c.dur
      if (startsNow || inProgress) this._play(i, c, inProgress ? time - c.t : 0, speed)
    })
    // stop cues that ran past their end (loop cues like the stall cricket repeat via new cues)
    for (const [i, a] of this.active) {
      const c = this.sheet.cues[i]
      if (time > c.t + c.dur / Math.max(0.25, Math.min(4, speed)) + 0.3 || time < c.t - 0.2) { this._stop(i, a) }
    }
    this.lastTime = time
    this.lastSpeed = speed
  }

  async _play(i, cue, offset, speed) {
    const ctx = this.getContext()
    const buf = await this._buffer(cue.file)
    if (!buf || !ctx || this.active.has(i)) return
    const speech = cue.kind === 'cvr' || cue.kind === 'atc'
    if (speech && speed > 2.05) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = speech ? Math.min(2, Math.max(0.5, speed)) : Math.max(0.5, Math.min(4, speed))
    const gain = ctx.createGain()
    const base = cue.kind === 'atc' ? 0.7 : cue.kind === 'cvr' ? 0.95 : cue.kind === 'stall' ? 0.5 : 0.6
    gain.gain.value = base * this.volume
    src.connect(gain)
    gain.connect(this.destination || ctx.destination)
    try { src.start(0, Math.min(buf.duration - 0.01, Math.max(0, offset))) } catch (e) { return }
    const entry = { src, gain }
    this.active.set(i, entry)
    src.onended = () => { if (this.active.get(i) === entry) this.active.delete(i) }
  }

  _stop(i, a) {
    try { a.gain.gain.setTargetAtTime(0, this.getContext().currentTime, 0.02); a.src.stop(this.getContext().currentTime + 0.08) } catch (e) { /* already stopped */ }
    this.active.delete(i)
  }

  stopAll() {
    for (const [i, a] of this.active) this._stop(i, a)
    this.active.clear()
  }

  /** Index of the cue currently sounding (for the transcript highlight), or -1. */
  current(time) {
    if (!this.sheet) return -1
    let best = -1
    this.sheet.cues.forEach((c, i) => { if ((c.kind === 'cvr' || c.kind === 'atc') && time >= c.t && time < c.t + c.dur + 0.4) best = i })
    return best
  }
}
