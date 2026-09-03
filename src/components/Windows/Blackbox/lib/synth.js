/**
 * Tiny shared synthesizer: one AudioContext for blips, arpeggios and drones
 * outside the replay. Everything degrades silently when audio is unavailable.
 */
let ctx = null
let master = null

export function audioContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.8
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp)
    comp.connect(ctx.destination)
  } catch (e) {
    ctx = null
  }
  return ctx
}

/** One note. freq in Hz, dur in seconds. */
export function note(freq, { dur = 0.3, gain = 0.08, type = 'sine', delay = 0, attack = 0.01, detune = 0 } = {}) {
  const c = audioContext()
  if (!c) return
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  o.detune.value = detune
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

// Pentatonic scale over a few octaves, so anything sounds consonant.
const PENTA = [0, 2, 4, 7, 9]
export function pentatonic(index, root = 220) {
  const oct = Math.floor(index / PENTA.length)
  const step = PENTA[((index % PENTA.length) + PENTA.length) % PENTA.length]
  return root * Math.pow(2, oct + step / 12)
}

/** Play a sequence of scale degrees as an arpeggio. */
export function arpeggio(degrees, { root = 220, gap = 0.12, dur = 0.5, gain = 0.06, type = 'triangle' } = {}) {
  degrees.forEach((d, i) => note(pentatonic(d, root), { dur, gain, type, delay: i * gap }))
}

/** A slowly breathing drone: returns a controller with setRoot(freq), setLevel(0..1), stop(). */
export function drone(root = 55) {
  const c = audioContext()
  if (!c) return { setRoot() {}, setLevel() {}, stop() {} }
  const out = c.createGain()
  out.gain.value = 0
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 420
  filter.Q.value = 0.8
  const voices = []
  const ratios = [1, 1.5, 2, 3, 1.002, 2.003]
  for (const r of ratios) {
    const o = c.createOscillator()
    o.type = r >= 2 ? 'sine' : 'sawtooth'
    o.frequency.value = root * r
    const g = c.createGain()
    g.gain.value = r >= 2 ? 0.05 : 0.08
    o.connect(g)
    g.connect(filter)
    o.start()
    voices.push({ o, r })
  }
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = c.createGain()
  lfoGain.gain.value = 160
  lfo.connect(lfoGain)
  lfoGain.connect(filter.frequency)
  lfo.start()
  filter.connect(out)
  out.connect(master)
  return {
    setRoot(f) { for (const v of voices) v.o.frequency.setTargetAtTime(f * v.r, c.currentTime, 2.5) },
    setLevel(l) { out.gain.setTargetAtTime(l * 0.5, c.currentTime, 1.2) },
    stop() {
      out.gain.setTargetAtTime(0, c.currentTime, 0.8)
      setTimeout(() => { try { for (const v of voices) v.o.stop(); lfo.stop() } catch (e) { /* ignore */ } }, 3000)
    }
  }
}
