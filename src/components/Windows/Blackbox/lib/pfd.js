/**
 * Canvas primary flight display and control-position panel.
 * drawPFD(ctx, w, h, s) where s = sampled FDR state plus flags.
 */
const SKY = '#1e6fd9'
const GROUND = '#8a4b1e'
const AMBER = '#ffbf00'
const GREEN = '#22e08a'
const MAGENTA = '#ff5cf0'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function drawPFD(ctx, w, h, s) {
  ctx.save()
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0b0f18'
  ctx.fillRect(0, 0, w, h)

  const pad = 8
  const tapeW = Math.max(46, w * 0.13)
  const adiX = pad + tapeW + 6
  const adiW = w - 2 * (pad + tapeW + 6)
  const adiY = 34
  const adiH = h - adiY - 44
  const cx = adiX + adiW / 2
  const cy = adiY + adiH / 2
  const pitch = s.pitch_deg || 0
  const roll = s.roll_deg || 0
  const pxPerDeg = adiH / 50

  // Attitude indicator
  ctx.save()
  ctx.beginPath()
  ctx.rect(adiX, adiY, adiW, adiH)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate((-roll * Math.PI) / 180)
  ctx.translate(0, pitch * pxPerDeg)
  const big = Math.max(adiW, adiH) * 3
  ctx.fillStyle = SKY
  ctx.fillRect(-big, -big, big * 2, big)
  ctx.fillStyle = GROUND
  ctx.fillRect(-big, 0, big * 2, big)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-big, 0)
  ctx.lineTo(big, 0)
  ctx.stroke()
  // pitch ladder
  ctx.lineWidth = 1.5
  ctx.font = '11px Tahoma, sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  for (let deg = -90; deg <= 90; deg += 5) {
    if (deg === 0) continue
    const y = -deg * pxPerDeg
    const major = deg % 10 === 0
    const len = major ? 40 : 20
    ctx.beginPath()
    ctx.moveTo(-len / 2, y)
    ctx.lineTo(len / 2, y)
    ctx.stroke()
    if (major) {
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.abs(deg)), -len / 2 - 4, y)
      ctx.textAlign = 'left'
      ctx.fillText(String(Math.abs(deg)), len / 2 + 4, y)
    }
  }
  ctx.restore()

  // Roll scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(adiX, adiY, adiW, adiH)
  ctx.clip()
  ctx.translate(cx, cy)
  const rr = adiH * 0.44
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const ang = ((a - 90) * Math.PI) / 180
    const len = a === 0 ? 12 : Math.abs(a) % 30 === 0 ? 10 : 6
    ctx.beginPath()
    ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
    ctx.lineTo(Math.cos(ang) * (rr + len), Math.sin(ang) * (rr + len))
    ctx.stroke()
  }
  ctx.rotate((-roll * Math.PI) / 180)
  ctx.fillStyle = AMBER
  ctx.beginPath()
  ctx.moveTo(0, -rr + 2)
  ctx.lineTo(-7, -rr + 14)
  ctx.lineTo(7, -rr + 14)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Aircraft symbol
  ctx.strokeStyle = AMBER
  ctx.fillStyle = '#000'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - 70, cy); ctx.lineTo(cx - 30, cy); ctx.lineTo(cx - 30, cy + 10)
  ctx.moveTo(cx + 70, cy); ctx.lineTo(cx + 30, cy); ctx.lineTo(cx + 30, cy + 10)
  ctx.stroke()
  ctx.fillStyle = AMBER
  ctx.fillRect(cx - 3, cy - 3, 6, 6)

  // Flight path / AoA readout inside ADI
  ctx.font = 'bold 11px Tahoma, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  if (typeof s.aoa_deg === 'number') {
    ctx.fillStyle = s.aoa_deg > 12 ? AMBER : '#ffffff'
    ctx.fillText(`AoA ${s.aoa_deg.toFixed(1)}°`, adiX + 6, adiY + adiH - 16)
  }
  if (s.law && s.law !== 'NORMAL') {
    ctx.fillStyle = AMBER
    ctx.textAlign = 'right'
    ctx.fillText(String(s.law), adiX + adiW - 6, adiY + adiH - 16)
  }
  if (s.stall_warn) {
    const blink = Math.floor(performance.now() / 250) % 2 === 0
    if (blink) {
      ctx.fillStyle = '#ff2d2d'
      ctx.font = 'bold 22px Tahoma, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('STALL', cx, adiY + 26)
    }
  }
  if (s.ias_valid === 0) {
    ctx.fillStyle = '#ff2d2d'
    ctx.font = 'bold 12px Tahoma, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SPD', pad + tapeW / 2, adiY + adiH / 2 - 60)
  }

  // Speed tape
  drawTape(ctx, pad, adiY, tapeW, adiH, s.ias_kt || 0, { major: 20, minor: 10, pxPerUnit: adiH / 120, label: 'IAS', unit: 'kt', invalid: s.ias_valid === 0, left: true })
  // Altitude tape
  const altScale = adiH / 1200
  drawTape(ctx, w - pad - tapeW, adiY, tapeW, adiH, s.alt_ft || 0, { major: 200, minor: 100, pxPerUnit: altScale, label: 'ALT', unit: 'ft', left: false })

  // VSI
  const vs = s.vs_fpm || 0
  const vsiX = w - pad - tapeW - 4
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(vsiX - 8, adiY, 8, adiH)
  const vsNorm = Math.max(-1, Math.min(1, Math.sign(vs) * Math.log10(1 + Math.abs(vs) / 500) / Math.log10(31)))
  ctx.fillStyle = Math.abs(vs) > 6000 ? AMBER : GREEN
  ctx.fillRect(vsiX - 8, cy, 8, -vsNorm * (adiH / 2 - 4))
  ctx.font = '10px Tahoma, sans-serif'
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(`${vs > 0 ? '+' : ''}${Math.round(vs / 100) * 100}`, vsiX - 10, adiY + 2)

  // FMA
  ctx.fillStyle = '#05080f'
  ctx.fillRect(0, 0, w, 30)
  ctx.font = 'bold 11px Tahoma, sans-serif'
  ctx.textBaseline = 'middle'
  const fma = []
  fma.push({ text: s.athr === 1 ? 'A/THR' : s.thrust_lever >= 0.99 ? 'TOGA' : s.thrust_lever <= 0.02 ? 'IDLE' : 'MAN THR', color: s.athr === 1 ? GREEN : s.thrust_lever >= 0.99 ? '#fff' : AMBER })
  fma.push({ text: s.ap === 1 ? 'AP1' : 'AP OFF', color: s.ap === 1 ? GREEN : AMBER })
  fma.push({ text: s.gear === 1 ? 'GEAR DN' : 'GEAR UP', color: '#8fb3ff' })
  fma.push({ text: s.flaps ? `FLAPS ${s.flaps}` : 'CLEAN', color: '#8fb3ff' })
  const cellW = w / fma.length
  fma.forEach((f, i) => {
    ctx.fillStyle = f.color
    ctx.textAlign = 'center'
    ctx.fillText(f.text, cellW * i + cellW / 2, 15)
    if (i) {
      ctx.strokeStyle = '#2a3550'
      ctx.beginPath(); ctx.moveTo(cellW * i, 4); ctx.lineTo(cellW * i, 26); ctx.stroke()
    }
  })

  // Heading strip
  const hdg = ((s.hdg_deg || 0) % 360 + 360) % 360
  const hy = h - 40
  ctx.fillStyle = '#05080f'
  ctx.fillRect(adiX, hy, adiW, 40)
  ctx.save()
  ctx.beginPath(); ctx.rect(adiX, hy, adiW, 40); ctx.clip()
  const pxPerHdg = adiW / 60
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.font = '10px Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let d = -40; d <= 40; d += 5) {
    const val = ((Math.round(hdg / 5) * 5 + d) % 360 + 360) % 360
    const x = cx + (Math.round(hdg / 5) * 5 + d - hdg) * pxPerHdg
    const major = val % 10 === 0
    ctx.beginPath(); ctx.moveTo(x, hy + 4); ctx.lineTo(x, hy + (major ? 14 : 9)); ctx.stroke()
    if (major) ctx.fillText(String(Math.round(val / 10)).padStart(2, '0'), x, hy + 16)
  }
  ctx.restore()
  ctx.fillStyle = AMBER
  ctx.beginPath(); ctx.moveTo(cx, hy + 2); ctx.lineTo(cx - 6, hy - 6); ctx.lineTo(cx + 6, hy - 6); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 12px Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${Math.round(hdg).toString().padStart(3, '0')}°`, cx, h - 2)
  if (typeof s.mach === 'number') {
    ctx.textAlign = 'left'
    ctx.font = '11px Tahoma, sans-serif'
    ctx.fillText(`M ${s.mach.toFixed(2)}`, pad, h - 4)
  }
  if (typeof s.ra_ft === 'number' && s.ra_ft <= 2500 && s.ra_ft >= 0) {
    ctx.textAlign = 'right'
    ctx.fillStyle = s.ra_ft < 400 ? AMBER : '#fff'
    ctx.font = 'bold 12px Tahoma, sans-serif'
    ctx.fillText(`RA ${Math.round(s.ra_ft)}`, w - pad, h - 4)
  }
  ctx.restore()
}

function drawTape(ctx, x, y, w, h, value, opt) {
  ctx.save()
  ctx.fillStyle = 'rgba(40,48,70,0.9)'
  ctx.fillRect(x, y, w, h)
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  const cy = y + h / 2
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.font = '11px Tahoma, sans-serif'
  ctx.textBaseline = 'middle'
  const span = h / opt.pxPerUnit
  const start = Math.floor((value - span / 2) / opt.minor) * opt.minor
  for (let v = start; v <= value + span / 2; v += opt.minor) {
    if (v < 0) continue
    const yy = cy - (v - value) * opt.pxPerUnit
    const major = v % opt.major === 0
    const len = major ? 8 : 4
    ctx.beginPath()
    if (opt.left) { ctx.moveTo(x + w, yy); ctx.lineTo(x + w - len, yy) } else { ctx.moveTo(x, yy); ctx.lineTo(x + len, yy) }
    ctx.stroke()
    if (major) {
      ctx.textAlign = opt.left ? 'right' : 'left'
      ctx.fillText(String(v), opt.left ? x + w - 11 : x + 11, yy)
    }
  }
  if (opt.invalid) {
    // data dropout: the tape breaks into static
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.16})`
      ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 2 + Math.random() * 12, 1 + Math.random() * 2)
    }
  }
  // current value box
  ctx.fillStyle = opt.invalid ? '#7a1010' : '#000'
  roundRect(ctx, x + 2, cy - 12, w - 4, 24, 3)
  ctx.fill()
  ctx.strokeStyle = AMBER
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = opt.invalid ? '#ff8080' : GREEN
  ctx.font = 'bold 13px Tahoma, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(opt.invalid ? '---' : String(Math.round(value)), x + w / 2, cy)
  ctx.fillStyle = '#9fb4d8'
  ctx.font = '9px Tahoma, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(`${opt.label} ${opt.unit}`, x + w / 2, y + 3)
  ctx.restore()
}

/** Sidestick / column, thrust, trim, config panel. */
export function drawControls(ctx, w, h, s, opts = {}) {
  ctx.save()
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0b0f18'
  ctx.fillRect(0, 0, w, h)
  ctx.font = '10px Tahoma, sans-serif'
  ctx.fillStyle = '#9fb4d8'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  // Stick box
  const box = Math.min(w * 0.42, h - 30)
  const bx = 8
  const by = 16
  ctx.fillText(opts.stickLabel || 'PITCH / ROLL INPUT', bx + box / 2, 3)
  ctx.strokeStyle = '#3a4a6a'
  ctx.lineWidth = 1
  ctx.strokeRect(bx, by, box, box)
  ctx.beginPath(); ctx.moveTo(bx + box / 2, by); ctx.lineTo(bx + box / 2, by + box); ctx.moveTo(bx, by + box / 2); ctx.lineTo(bx + box, by + box / 2); ctx.stroke()
  const sp = Math.max(-1, Math.min(1, s.stick_pitch || 0))
  const sr = Math.max(-1, Math.min(1, s.stick_roll || 0))
  const px = bx + box / 2 + sr * (box / 2 - 6)
  const py = by + box / 2 - sp * (box / 2 - 6)
  ctx.strokeStyle = 'rgba(255,191,0,0.5)'
  ctx.beginPath(); ctx.moveTo(bx + box / 2, by + box / 2); ctx.lineTo(px, py); ctx.stroke()
  ctx.fillStyle = Math.abs(sp) > 0.85 ? '#ff2d2d' : AMBER
  ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#9fb4d8'
  ctx.font = '9px Tahoma, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('NU', bx + 2, by + 2)
  ctx.textBaseline = 'bottom'
  ctx.fillText('ND', bx + 2, by + box - 2)

  // Gauges column
  const gx = bx + box + 14
  const gw = w - gx - 8
  let gy = 16
  const gauge = (label, value, min, max, fmt, color) => {
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#9fb4d8'
    ctx.font = '10px Tahoma, sans-serif'
    ctx.fillText(label, gx, gy)
    ctx.textAlign = 'right'
    ctx.fillStyle = color || '#fff'
    ctx.font = 'bold 10px Tahoma, sans-serif'
    ctx.fillText(fmt, gx + gw, gy)
    ctx.fillStyle = '#243049'
    ctx.fillRect(gx, gy + 13, gw, 6)
    const f = Math.max(0, Math.min(1, (value - min) / (max - min)))
    ctx.fillStyle = color || GREEN
    ctx.fillRect(gx, gy + 13, gw * f, 6)
    gy += 26
  }
  const tl = typeof s.thrust_lever === 'number' ? s.thrust_lever : null
  if (tl !== null) gauge('THRUST LEVER', tl, 0, 1, tl >= 0.99 ? 'TOGA' : tl <= 0.02 ? 'IDLE' : `${Math.round(tl * 100)}%`, tl >= 0.99 ? '#fff' : AMBER)
  if (typeof s.n1_pct === 'number') gauge('N1', s.n1_pct, 0, 110, `${s.n1_pct.toFixed(0)}%`, GREEN)
  if (typeof s.n1_left_pct === 'number') gauge('N1 LEFT', s.n1_left_pct, 0, 110, `${s.n1_left_pct.toFixed(0)}%`, GREEN)
  if (typeof s.n1_right_pct === 'number') gauge('N1 RIGHT', s.n1_right_pct, 0, 110, `${s.n1_right_pct.toFixed(0)}%`, GREEN)
  if (typeof s.ths_deg === 'number') gauge(opts.thsLabel || 'STAB TRIM', s.ths_deg, opts.thsMin ?? -5, opts.thsMax ?? 15, `${s.ths_deg.toFixed(1)}${opts.thsUnit || '° NU'}`, s.ths_deg > 10 ? AMBER : MAGENTA)
  if (typeof s.column_force_lb === 'number') gauge('COLUMN FORCE', s.column_force_lb, -60, 60, `${s.column_force_lb.toFixed(0)} lb`, AMBER)
  ctx.restore()
}
