/**
 * Keyframed flight-data-recorder access.
 * A parameter is { interp: 'linear' | 'step', keys: [[t, value], ...] } sorted by t.
 */

function findIndex(keys, t) {
  // last index whose t <= query t, or -1
  let lo = 0
  let hi = keys.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid][0] <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

export function sampleParam(param, t) {
  if (!param || !param.keys || param.keys.length === 0) return null
  const keys = param.keys
  const i = findIndex(keys, t)
  if (i < 0) return keys[0][1]
  if (i >= keys.length - 1) return keys[keys.length - 1][1]
  const [t0, v0] = keys[i]
  const [t1, v1] = keys[i + 1]
  if (param.interp === 'step' || typeof v0 !== 'number' || typeof v1 !== 'number') return v0
  if (t1 === t0) return v1
  const f = (t - t0) / (t1 - t0)
  return v0 + (v1 - v0) * f
}

/** Sample every parameter at time t into a flat object. */
export function sampleAll(fdr, t) {
  const out = { t }
  for (const name of Object.keys(fdr.params)) {
    out[name] = sampleParam(fdr.params[name], t)
  }
  return out
}

/** Sample one parameter on a regular grid for chart drawing. */
export function series(param, tStart, tEnd, n = 200) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = tStart + ((tEnd - tStart) * i) / n
    pts.push([t, sampleParam(param, t)])
  }
  return pts
}

export function paramRange(param) {
  let min = Infinity
  let max = -Infinity
  for (const [, v] of param.keys) {
    if (typeof v !== 'number') continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!isFinite(min)) return [0, 1]
  if (min === max) return [min - 1, max + 1]
  return [min, max]
}

/** Integrate ground track from groundspeed (kt) and heading (deg) into feet, north = -z. */
export function integrateTrack(fdr, dt = 0.5) {
  const pts = []
  let x = 0
  let z = 0
  const gs = fdr.params.gs_kt || fdr.params.ias_kt
  for (let t = fdr.t_start; t <= fdr.t_end; t += dt) {
    const speedFtPerS = (sampleParam(gs, t) || 0) * 1.68781
    const hdg = ((sampleParam(fdr.params.hdg_deg, t) || 0) * Math.PI) / 180
    x += speedFtPerS * Math.sin(hdg) * dt
    z -= speedFtPerS * Math.cos(hdg) * dt
    pts.push({ t, x, z, y: sampleParam(fdr.params.alt_ft, t) || 0 })
  }
  return pts
}

export function trackAt(track, t) {
  if (track.length === 0) return { x: 0, y: 0, z: 0 }
  const dt = track[1] ? track[1].t - track[0].t : 1
  const i = Math.max(0, Math.min(track.length - 1, Math.floor((t - track[0].t) / dt)))
  const a = track[i]
  const b = track[Math.min(track.length - 1, i + 1)]
  const f = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }
}

export function formatClock(t0Iso, t) {
  const rel = `${t >= 0 ? '+' : ''}${t.toFixed(0)} s`
  if (!t0Iso) return rel
  const base = new Date(t0Iso)
  if (isNaN(base.getTime())) return rel
  // Display in the offset the record's t0 was written in (e.g. "-04:00"), so clocks match the report.
  const m = String(t0Iso).match(/([+-])(\d\d):?(\d\d)$/)
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0
  const d = new Date(base.getTime() + t * 1000 + offsetMin * 60000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** Human-readable relative time: seconds close to t0, days/hours far from it. */
export function formatRelative(t) {
  const sign = t < 0 ? '-' : '+'
  const a = Math.abs(t)
  if (a < 3600) return `t${sign}${Number.isInteger(a) ? a : a.toFixed(1)}s`
  if (a < 86400) return `t${sign}${Math.floor(a / 3600)}h${String(Math.round((a % 3600) / 60)).padStart(2, '0')}m`
  return `t${sign}${Math.floor(a / 86400)}d ${Math.round((a % 86400) / 3600)}h`
}
