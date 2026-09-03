/**
 * Head-up display symbology drawn over the cockpit camera, and a radar scope.
 */
const HUD = 'rgba(120,255,140,0.95)'
const HUD_DIM = 'rgba(120,255,140,0.45)'
const WARN = 'rgba(255,70,70,0.95)'

export function drawHUD(ctx, w, h, s, opts = {}) {
  ctx.save()
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const pitch = s.pitch_deg || 0
  const roll = s.roll_deg || 0
  const pxPerDeg = h / 40
  ctx.lineWidth = 1.5
  ctx.strokeStyle = HUD
  ctx.fillStyle = HUD
  ctx.font = '12px Consolas, monospace'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 2

  // Pitch ladder, rotated with roll and shifted with pitch (conformal)
  ctx.save()
  ctx.beginPath()
  ctx.rect(cx - w * 0.28, cy - h * 0.34, w * 0.56, h * 0.68)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate((-roll * Math.PI) / 180)
  ctx.translate(0, pitch * pxPerDeg)
  for (let deg = -60; deg <= 60; deg += 5) {
    const y = -deg * pxPerDeg
    if (Math.abs(y - pitch * pxPerDeg) > h * 0.5) continue
    const major = deg % 10 === 0
    const len = deg === 0 ? w * 0.22 : major ? 60 : 30
    ctx.strokeStyle = deg < 0 ? HUD_DIM : HUD
    ctx.setLineDash(deg < 0 ? [6, 4] : [])
    ctx.beginPath()
    if (deg === 0) {
      ctx.moveTo(-len, y); ctx.lineTo(-40, y); ctx.moveTo(40, y); ctx.lineTo(len, y)
    } else {
      ctx.moveTo(-len, y); ctx.lineTo(-18, y); ctx.moveTo(18, y); ctx.lineTo(len, y)
      ctx.moveTo(-len, y); ctx.lineTo(-len, y + (deg > 0 ? 8 : -8))
      ctx.moveTo(len, y); ctx.lineTo(len, y + (deg > 0 ? 8 : -8))
    }
    ctx.stroke()
    if (major && deg !== 0) {
      ctx.setLineDash([])
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.abs(deg)), -len - 6, y)
      ctx.textAlign = 'left'
      ctx.fillText(String(Math.abs(deg)), len + 6, y)
    }
  }
  ctx.setLineDash([])
  ctx.restore()

  // Flight path vector: pitch minus angle of attack (approximate), stays level with the horizon
  if (typeof s.aoa_deg === 'number') {
    const fpa = pitch - s.aoa_deg
    const fy = cy - (fpa - pitch) * pxPerDeg
    ctx.strokeStyle = HUD
    ctx.beginPath(); ctx.arc(cx, fy, 9, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(cx - 22, fy); ctx.lineTo(cx - 9, fy); ctx.moveTo(cx + 9, fy); ctx.lineTo(cx + 22, fy); ctx.moveTo(cx, fy - 9); ctx.lineTo(cx, fy - 18); ctx.stroke()
  }
  // Boresight
  ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 12, cy); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx, cy); ctx.lineTo(cx + 6, cy + 6); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx + 30, cy); ctx.stroke()

  // Speed and altitude boxes
  ctx.font = 'bold 15px Consolas, monospace'
  ctx.textAlign = 'right'
  const lx = cx - w * 0.3
  const rx = cx + w * 0.3
  ctx.strokeStyle = s.ias_valid === 0 ? WARN : HUD
  ctx.strokeRect(lx - 66, cy - 13, 66, 26)
  ctx.fillStyle = s.ias_valid === 0 ? WARN : HUD
  ctx.fillText(s.ias_valid === 0 ? '---' : String(Math.round(s.ias_kt || 0)), lx - 6, cy)
  ctx.fillStyle = HUD
  ctx.strokeStyle = HUD
  ctx.textAlign = 'left'
  ctx.strokeRect(rx, cy - 13, 78, 26)
  ctx.fillText(String(Math.round(s.alt_ft || 0)), rx + 6, cy)
  ctx.font = '11px Consolas, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('KT', lx - 6, cy - 22)
  if (typeof s.mach === 'number') ctx.fillText(`M ${s.mach.toFixed(2)}`, lx - 6, cy + 24)
  ctx.textAlign = 'left'
  ctx.fillText('FT', rx + 6, cy - 22)
  const vs = s.vs_fpm || 0
  ctx.fillText(`${vs > 0 ? '+' : ''}${Math.round(vs / 50) * 50}`, rx + 6, cy + 24)
  if (typeof s.ra_ft === 'number' && s.ra_ft < 2500 && s.ra_ft >= 0) {
    ctx.fillStyle = s.ra_ft < 500 ? 'rgba(255,200,80,0.95)' : HUD
    ctx.fillText(`RA ${Math.round(s.ra_ft)}`, rx + 6, cy + 42)
  }
  if (typeof s.aoa_deg === 'number') {
    ctx.fillStyle = s.aoa_deg > 12 ? WARN : HUD
    ctx.textAlign = 'right'
    ctx.fillText(`α ${s.aoa_deg.toFixed(1)}`, lx - 6, cy + 42)
  }

  // Heading tape (top)
  const hdg = (((s.hdg_deg || 0) % 360) + 360) % 360
  const ty = 26
  ctx.fillStyle = HUD
  ctx.strokeStyle = HUD
  ctx.textAlign = 'center'
  ctx.font = '11px Consolas, monospace'
  const ppd = w * 0.5 / 60
  for (let d = -30; d <= 30; d += 5) {
    const val = (((Math.round(hdg / 5) * 5 + d) % 360) + 360) % 360
    const x = cx + (Math.round(hdg / 5) * 5 + d - hdg) * ppd
    const major = val % 10 === 0
    ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x, ty + (major ? 8 : 4)); ctx.stroke()
    if (major) ctx.fillText(String(val / 10).padStart(2, '0'), x, ty + 16)
  }
  ctx.beginPath(); ctx.moveTo(cx, ty - 2); ctx.lineTo(cx - 5, ty - 9); ctx.lineTo(cx + 5, ty - 9); ctx.closePath(); ctx.fill()
  ctx.font = 'bold 13px Consolas, monospace'
  ctx.fillText(`${String(Math.round(hdg)).padStart(3, '0')}`, cx, ty - 18)

  // Mode annunciations (bottom)
  ctx.font = 'bold 12px Consolas, monospace'
  const modes = []
  modes.push(s.ap === 1 ? 'AP' : 'AP OFF')
  modes.push(s.athr === 1 ? 'A/THR' : s.thrust_lever >= 0.99 ? 'TOGA' : s.thrust_lever <= 0.02 ? 'IDLE' : 'MAN')
  if (s.law && s.law !== 'NORMAL') modes.push(String(s.law))
  if (s.gear === 1) modes.push('GEAR')
  if (s.flaps) modes.push(`F${s.flaps}`)
  ctx.textAlign = 'center'
  modes.forEach((m, i) => {
    const warn = m === 'AP OFF' || m === 'IDLE' || (s.law && m === String(s.law))
    ctx.fillStyle = warn ? 'rgba(255,200,80,0.95)' : HUD
    ctx.fillText(m, cx + (i - (modes.length - 1) / 2) * 80, h - 22)
  })

  // Warnings
  if (s.stall_warn && Math.floor(performance.now() / 250) % 2 === 0) {
    ctx.fillStyle = WARN
    ctx.font = 'bold 26px Consolas, monospace'
    ctx.fillText('STALL', cx, cy - h * 0.3)
  }
  if (opts.gpws && Math.floor(performance.now() / 300) % 2 === 0) {
    ctx.fillStyle = WARN
    ctx.font = 'bold 22px Consolas, monospace'
    ctx.fillText(opts.gpws, cx, cy + h * 0.28)
  }
  ctx.restore()
}

/**
 * Radar scope: a top-down view of the whole flight track with a rotating sweep.
 * track: integrated positions in feet; t: current time; fdr: for t_start/t_end.
 */
export function drawRadar(ctx, w, h, track, t, fdr, s, label = '') {
  ctx.save()
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#04110a'
  ctx.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const rad = Math.min(w, h) / 2 - 6
  // fit track into the scope
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of track) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
  const span = Math.max(maxX - minX, maxZ - minZ, 6076) * 1.15
  const mx = (minX + maxX) / 2
  const mz = (minZ + maxZ) / 2
  const sx = (x) => cx + ((x - mx) / span) * rad * 2
  const sz = (z) => cy + ((z - mz) / span) * rad * 2
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.clip()
  // range rings
  ctx.strokeStyle = 'rgba(60,200,110,0.25)'
  ctx.lineWidth = 1
  const nmPx = (6076 / span) * rad * 2
  const ringNm = span / 6076 > 40 ? 10 : span / 6076 > 12 ? 5 : 1
  for (let r = ringNm; r * nmPx < rad * 1.5; r += ringNm) { ctx.beginPath(); ctx.arc(cx, cy, r * nmPx, 0, Math.PI * 2); ctx.stroke() }
  ctx.beginPath(); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.stroke()
  // sweep
  const ang = ((performance.now() / 2600) % 1) * Math.PI * 2
  const g = ctx.createConicGradient ? ctx.createConicGradient(ang - Math.PI / 2, cx, cy) : null
  if (g) {
    g.addColorStop(0, 'rgba(80,255,140,0.35)')
    g.addColorStop(0.18, 'rgba(80,255,140,0.0)')
    g.addColorStop(1, 'rgba(80,255,140,0.0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, ang - Math.PI / 2 - Math.PI * 2, ang - Math.PI / 2); ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = 'rgba(120,255,160,0.8)'
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang - Math.PI / 2) * rad, cy + Math.sin(ang - Math.PI / 2) * rad); ctx.stroke()
  // track history: fading blips every few seconds
  const dt = track[1] ? track[1].t - track[0].t : 1
  const step = Math.max(1, Math.round(4 / dt))
  for (let i = 0; i < track.length; i += step) {
    const p = track[i]
    if (p.t > t) break
    const age = (t - p.t) / (fdr.t_end - fdr.t_start)
    ctx.fillStyle = `rgba(120,255,160,${Math.max(0.12, 1 - age * 1.4)})`
    ctx.fillRect(sx(p.x) - 1.5, sz(p.z) - 1.5, 3, 3)
  }
  // future path faint
  ctx.strokeStyle = 'rgba(120,255,160,0.15)'
  ctx.setLineDash([2, 4])
  ctx.beginPath()
  track.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z))))
  ctx.stroke()
  ctx.setLineDash([])
  // current position + data block
  let cur = track[0]
  for (const p of track) { if (p.t <= t) cur = p; else break }
  const px = sx(cur.x)
  const py = sz(cur.z)
  ctx.strokeStyle = '#c8ffd8'
  ctx.lineWidth = 1.5
  ctx.strokeRect(px - 4, py - 4, 8, 8)
  ctx.beginPath(); ctx.moveTo(px + 4, py - 4); ctx.lineTo(px + 22, py - 18); ctx.stroke()
  ctx.fillStyle = '#c8ffd8'
  ctx.font = 'bold 10px Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  const fl = Math.round((s.alt_ft || 0) / 100)
  ctx.fillText(label || 'TGT', px + 24, py - 20)
  ctx.fillText(`${String(fl).padStart(3, '0')} ${Math.round(s.gs_kt || s.ias_kt || 0)}`, px + 24, py - 8)
  ctx.restore()
  ctx.fillStyle = 'rgba(120,255,160,0.7)'
  ctx.font = '9px Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(`RNG ${ringNm} NM`, 6, 5)
}
