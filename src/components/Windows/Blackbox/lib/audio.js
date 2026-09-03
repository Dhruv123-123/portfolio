/**
 * Synthesized cockpit soundscape for the FDR replay. Everything is generated
 * with the Web Audio API and the browser's speech synthesis; no audio assets.
 *
 * Layers: engine hum (follows N1), slipstream (follows IAS), stall warning
 * (cricket + "STALL" voice, or stick shaker rattle), master warning chime,
 * autopilot-disconnect cavalry charge, overspeed clacker, GPWS altitude
 * call-outs, "SINK RATE" / "PULL UP" / "TERRAIN", and optional spoken CVR lines.
 */

const CALLOUT_GATES = [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10]
const WORDS = { 2500: 'two thousand five hundred', 1000: 'one thousand', 500: 'five hundred', 400: 'four hundred', 300: 'three hundred', 200: 'two hundred', 100: 'one hundred', 50: 'fifty', 40: 'forty', 30: 'thirty', 20: 'twenty', 10: 'ten' }

function noiseBuffer(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

export class ReplayAudio {
  constructor() {
    this.ctx = null
    this.enabled = false
    this.voice = true
    this.ready = false
    this._prev = null
    this._lastRa = null
    this._lastSpeech = 0
    this._stallTimer = 0
    this._chimeTimer = 0
    this._gpwsTimer = 0
    this._sinkTimer = 0
    this.family = 'airbus'
  }

  /** Must be called from a user gesture. */
  enable(family = 'airbus') {
    this.family = family
    if (!this.ctx) this._build()
    if (this.ctx.state === 'suspended') this.ctx.resume()
    this.enabled = true
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.2)
  }

  disable() {
    this.enabled = false
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
    this._stopStall()
    this._stopClacker()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  }

  _build() {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 4
    this.master.connect(comp)
    comp.connect(ctx.destination)
    this.noise = noiseBuffer(ctx)

    // Engine: two detuned saws through a low-pass plus filtered noise for the fan.
    this.engGain = ctx.createGain()
    this.engGain.gain.value = 0
    const engFilter = ctx.createBiquadFilter()
    engFilter.type = 'lowpass'
    engFilter.frequency.value = 220
    engFilter.Q.value = 1.2
    this.engOsc = [ctx.createOscillator(), ctx.createOscillator()]
    this.engOsc[0].type = 'sawtooth'
    this.engOsc[1].type = 'triangle'
    this.engOsc[0].frequency.value = 60
    this.engOsc[1].frequency.value = 61
    for (const o of this.engOsc) { o.connect(engFilter); o.start() }
    engFilter.connect(this.engGain)
    this.fanNoise = this._noiseSource()
    this.fanFilter = ctx.createBiquadFilter()
    this.fanFilter.type = 'bandpass'
    this.fanFilter.frequency.value = 900
    this.fanFilter.Q.value = 0.7
    this.fanGain = ctx.createGain()
    this.fanGain.gain.value = 0
    this.fanNoise.connect(this.fanFilter)
    this.fanFilter.connect(this.fanGain)
    this.fanGain.connect(this.master)
    this.engGain.connect(this.master)

    // Slipstream: noise through a low-pass whose cut-off rises with airspeed.
    this.windNoise = this._noiseSource()
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'lowpass'
    this.windFilter.frequency.value = 300
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    this.windNoise.connect(this.windFilter)
    this.windFilter.connect(this.windGain)
    this.windGain.connect(this.master)

    // Rain bed (enabled by the scene when weather is present).
    this.rainNoise = this._noiseSource()
    this.rainFilter = ctx.createBiquadFilter()
    this.rainFilter.type = 'highpass'
    this.rainFilter.frequency.value = 2500
    this.rainGain = ctx.createGain()
    this.rainGain.gain.value = 0
    this.rainNoise.connect(this.rainFilter)
    this.rainFilter.connect(this.rainGain)
    this.rainGain.connect(this.master)
    this.ready = true
  }

  _noiseSource() {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.start()
    return src
  }

  setRain(level) {
    if (!this.ctx) return
    this.rainGain.gain.setTargetAtTime(level * 0.25, this.ctx.currentTime, 0.5)
  }

  /** Short tone helper. */
  _tone(freq, t0, dur, { type = 'sine', gain = 0.25, glideTo = null } = {}) {
    const ctx = this.ctx
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t0)
    if (glideTo) o.frequency.linearRampToValueAtTime(glideTo, t0 + dur)
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01)
    g.gain.setValueAtTime(gain, t0 + dur - 0.02)
    g.gain.linearRampToValueAtTime(0, t0 + dur)
    o.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + dur + 0.02)
  }

  /** Tape rewind: a short descending sweep with a little noise. */
  rewind() {
    if (!this.enabled) return
    const t = this.ctx.currentTime
    this._tone(1400, t, 0.28, { type: 'sawtooth', gain: 0.05, glideTo: 180 })
    this._tone(700, t + 0.03, 0.22, { type: 'square', gain: 0.02, glideTo: 90 })
  }

  /** Airbus cavalry charge on AP disconnect. */
  cavalryCharge() {
    if (!this.enabled) return
    const t = this.ctx.currentTime
    const seq = [740, 880, 740, 880, 740, 880, 740, 880]
    seq.forEach((f, i) => this._tone(f, t + i * 0.16, 0.14, { type: 'square', gain: 0.12 }))
  }

  /** Boeing-style single chime / Airbus continuous repetitive chime burst. */
  masterWarning() {
    if (!this.enabled) return
    const t = this.ctx.currentTime
    for (let i = 0; i < 3; i++) this._tone(1046, t + i * 0.32, 0.12, { type: 'triangle', gain: 0.18 })
  }

  /** Two rising whoops (GPWS) followed by speech. */
  _whoop(words) {
    const t = this.ctx.currentTime
    this._tone(400, t, 0.28, { type: 'sawtooth', gain: 0.1, glideTo: 900 })
    this._tone(400, t + 0.34, 0.28, { type: 'sawtooth', gain: 0.1, glideTo: 900 })
    this.say(words, { pitch: 0.6, rate: 1.05, urgent: true, delay: 700 })
  }

  _startStall() {
    if (this.stallNode) return
    const ctx = this.ctx
    if (this.family === 'boeing' || this.family === 'other') {
      // Stick shaker: bursts of low noise at ~20 Hz.
      const src = this._noiseSource()
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = 180
      const g = ctx.createGain()
      g.gain.value = 0
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 19
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.45
      lfo.connect(lfoGain)
      lfoGain.connect(g.gain)
      src.connect(f)
      f.connect(g)
      g.connect(this.master)
      lfo.start()
      this.stallNode = { stop: () => { src.stop(); lfo.stop() } }
    } else {
      // Cricket: high chirp amplitude-modulated fast.
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = 1750
      const g = ctx.createGain()
      g.gain.value = 0
      const lfo = ctx.createOscillator()
      lfo.type = 'square'
      lfo.frequency.value = 11
      const lg = ctx.createGain()
      lg.gain.value = 0.06
      lfo.connect(lg)
      lg.connect(g.gain)
      o.connect(g)
      g.connect(this.master)
      o.start()
      lfo.start()
      this.stallNode = { stop: () => { o.stop(); lfo.stop() } }
    }
  }
  _stopStall() {
    if (this.stallNode) { try { this.stallNode.stop() } catch (e) { /* already stopped */ } this.stallNode = null }
  }

  _startClacker() {
    if (this.clackNode) return
    const ctx = this.ctx
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = 520
    const g = ctx.createGain()
    g.gain.value = 0
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 14
    const lg = ctx.createGain()
    lg.gain.value = 0.05
    lfo.connect(lg)
    lg.connect(g.gain)
    o.connect(g)
    g.connect(this.master)
    o.start()
    lfo.start()
    this.clackNode = { stop: () => { o.stop(); lfo.stop() } }
  }
  _stopClacker() {
    if (this.clackNode) { try { this.clackNode.stop() } catch (e) { /* already stopped */ } this.clackNode = null }
  }

  /** Speech synthesis with a rough per-speaker voice profile. */
  say(text, { pitch = 1, rate = 1, urgent = false, delay = 0, lang = 'en-US', volume = 1 } = {}) {
    if (!this.enabled || !this.voice || typeof speechSynthesis === 'undefined' || !text) return
    const speak = () => {
      const u = new SpeechSynthesisUtterance(text)
      u.pitch = pitch
      u.rate = rate
      u.lang = lang
      u.volume = volume
      if (urgent) speechSynthesis.cancel()
      speechSynthesis.speak(u)
    }
    delay ? setTimeout(speak, delay) : speak()
  }

  /** Speak a CVR line; the speaker code picks a voice profile. */
  sayLine(line) {
    const text = line.translation || line.text
    if (!text) return
    const spk = (line.speaker || '').toUpperCase()
    const prof = { CAPT: { pitch: 0.75, rate: 1.0 }, PF: { pitch: 0.85, rate: 1.05 }, PNF: { pitch: 1.0, rate: 1.0 }, PM: { pitch: 1.0, rate: 1.0 }, FO: { pitch: 1.05, rate: 1.05 }, ATC: { pitch: 1.2, rate: 1.15, volume: 0.7 }, SYS: { pitch: 0.55, rate: 0.95 }, GPWS: { pitch: 0.55, rate: 0.95 }, CABIN: { pitch: 1.15, rate: 1.0 } }[spk] || { pitch: 0.95, rate: 1.0 }
    this.say(text.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, ''), prof)
  }

  /** Per-frame update with the sampled FDR state. */
  update(s, dt, playing) {
    if (!this.enabled || !this.ctx) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const live = playing ? 1 : 0
    const n1 = typeof s.n1_pct === 'number' ? s.n1_pct : typeof s.n1_left_pct === 'number' ? (s.n1_left_pct + (s.n1_right_pct ?? s.n1_left_pct)) / 2 : 60
    const ias = typeof s.ias_kt === 'number' && s.ias_valid !== 0 ? s.ias_kt : (s.gs_kt || 250)
    const f = 38 + n1 * 1.1
    this.engOsc[0].frequency.setTargetAtTime(f, now, 0.3)
    this.engOsc[1].frequency.setTargetAtTime(f * 1.503, now, 0.3)
    this.engGain.gain.setTargetAtTime(live * (0.02 + (n1 / 100) * 0.16), now, 0.25)
    this.fanFilter.frequency.setTargetAtTime(400 + n1 * 22, now, 0.3)
    this.fanGain.gain.setTargetAtTime(live * (0.01 + (n1 / 100) * 0.09), now, 0.25)
    this.windFilter.frequency.setTargetAtTime(150 + ias * 5, now, 0.3)
    this.windGain.gain.setTargetAtTime(live * Math.min(0.28, (ias / 320) * 0.22), now, 0.25)

    const prev = this._prev
    if (prev && playing) {
      if (s.ap === 0 && prev.ap === 1) { this.cavalryCharge(); this.say('autopilot', { pitch: 0.6, rate: 1.1, delay: 900 }) }
      if (s.stall_warn && !prev.stall_warn) { this._startStall(); if (this.family !== 'boeing') this.say('stall stall', { pitch: 0.55, rate: 1.05, urgent: true }) }
      if (!s.stall_warn && prev.stall_warn) this._stopStall()
      if (s.law && prev.law && s.law !== prev.law && s.law !== 'NORMAL') this.masterWarning()
      if (s.ias_valid === 0 && prev.ias_valid !== 0) this.masterWarning()
      if (typeof s.gear === 'number' && s.gear !== prev.gear) this._tone(180, now, 0.35, { type: 'triangle', gain: 0.06 })
      // Altitude call-outs while descending
      if (typeof s.ra_ft === 'number' && typeof prev.ra_ft === 'number' && s.ra_ft < prev.ra_ft) {
        for (const g of CALLOUT_GATES) {
          if (prev.ra_ft > g && s.ra_ft <= g) { this.say(WORDS[g], { pitch: 0.6, rate: 1.0 }); break }
        }
      }
    }
    // Stall tone keeps running while the flag is on
    if (s.stall_warn) {
      this._stallTimer += dt
      if (this._stallTimer > 1.6 && this.family !== 'boeing' && playing) { this._stallTimer = 0; this.say('stall stall', { pitch: 0.55, rate: 1.05 }) }
      if (!this.stallNode && playing) this._startStall()
    } else this._stopStall()
    if (!playing) this._stopStall()

    // Overspeed clacker
    const over = (typeof s.mach === 'number' && s.mach > 0.87) || ias > 360
    if (over && playing) this._startClacker()
    else this._stopClacker()

    // GPWS: sink rate / pull up / terrain
    const vs = s.vs_fpm || 0
    const ra = typeof s.ra_ft === 'number' ? s.ra_ft : Infinity
    this._gpwsTimer += dt
    if (playing && ra < 2450 && this._gpwsTimer > 2.2) {
      if ((vs < -3000 && ra < 1500) || (vs < -1800 && ra < 500)) { this._gpwsTimer = 0; this._whoop('pull up') }
      else if (vs < -1400 && ra < 2450) { this._gpwsTimer = 0; this.say('sink rate', { pitch: 0.6, rate: 1.05 }) }
    }
    this._prev = { ...s }
  }

  dispose() {
    this.disable()
    if (this.ctx) { try { this.ctx.close() } catch (e) { /* ignore */ } this.ctx = null }
  }
}
