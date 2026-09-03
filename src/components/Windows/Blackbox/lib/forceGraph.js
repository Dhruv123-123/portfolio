/**
 * Minimal force-directed graph on a 2D canvas: pan, zoom, drag, hover, click.
 * Nodes: { id, kind: 'accident' | 'factor' | 'family' | 'agency', label, color, r, x, y, vx, vy, fixed }
 * Links: { source, target, kind: 'has' | 'chain', weight }
 */
export class ForceGraph {
  constructor(canvas, { onHover, onClick, onBackgroundClick } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.nodes = []
    this.links = []
    this.nodeById = {}
    this.transform = { x: 0, y: 0, k: 1 }
    this.alpha = 1
    this.running = false
    this.hover = null
    this.selected = null
    this.highlight = null // Set of node ids to emphasise, others dimmed
    this.emphasisLinks = null // Set of 'a>b' keys for chain edges to emphasise
    this.dragging = null
    this.panning = null
    this.onHover = onHover
    this.onClick = onClick
    this.onBackgroundClick = onBackgroundClick
    this.showChain = true
    this.labelsAlways = false
    this.flow = true // animated particles travelling along causal edges
    this.active = true // false while the tab is hidden: stops the ambient loop
    this._flowRaf = null
    this._flowT = 0
    this._flowLast = 0
    this._bind()
    this._raf = null
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  }

  setData(nodes, links) {
    const prev = this.nodeById
    this.nodes = nodes.map((n) => {
      const old = prev[n.id]
      const angle = Math.random() * Math.PI * 2
      const radius = n.kind === 'factor' ? 120 + Math.random() * 80 : 260 + Math.random() * 160
      return {
        vx: 0,
        vy: 0,
        x: old ? old.x : Math.cos(angle) * radius,
        y: old ? old.y : Math.sin(angle) * radius,
        ...n
      }
    })
    this.nodeById = {}
    for (const n of this.nodes) this.nodeById[n.id] = n
    this.links = links
      .map((l) => ({ ...l, s: this.nodeById[l.source], t: this.nodeById[l.target] }))
      .filter((l) => l.s && l.t)
    this.degree = {}
    for (const l of this.links) {
      this.degree[l.s.id] = (this.degree[l.s.id] || 0) + 1
      this.degree[l.t.id] = (this.degree[l.t.id] || 0) + 1
    }
    this.reheat(1)
    this.startFlow()
  }

  /** Ambient animation: particles flowing along chain edges while the graph is visible. */
  startFlow() {
    if (this._flowRaf || !this.flow) return
    const loop = (ts) => {
      this._flowRaf = null
      if (!this.flow || !this.active) return
      const dt = this._flowLast ? Math.min(0.1, (ts - this._flowLast) / 1000) : 0
      this._flowLast = ts
      this._flowT += dt
      if (!this.running) this.draw()
      this._flowRaf = requestAnimationFrame(loop)
    }
    this._flowRaf = requestAnimationFrame(loop)
  }

  stopFlow() {
    if (this._flowRaf) cancelAnimationFrame(this._flowRaf)
    this._flowRaf = null
    this._flowLast = 0
  }

  setActive(a) {
    this.active = a
    if (a) this.startFlow()
    else this.stopFlow()
  }

  reheat(alpha = 0.6) {
    this.alpha = Math.max(this.alpha, alpha)
    this.start()
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.tick()
      this.draw()
      if (this.alpha < 0.005 && !this.dragging) {
        this.running = false
        this._raf = null
        return
      }
      this._raf = requestAnimationFrame(loop)
    }
    this._raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.floor(rect.width * this.dpr)
    this.canvas.height = Math.floor(rect.height * this.dpr)
    if (!this._centered && rect.width) {
      this.transform.x = rect.width / 2
      this.transform.y = rect.height / 2
      this._centered = true
    }
    this.draw()
  }

  fit() {
    if (!this.nodes.length || !this.width) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
    }
    const w = maxX - minX + 80
    const h = maxY - minY + 80
    const k = Math.min(2, Math.max(0.15, Math.min(this.width / w, this.height / h)))
    this.transform.k = k
    this.transform.x = this.width / 2 - ((minX + maxX) / 2) * k
    this.transform.y = this.height / 2 - ((minY + maxY) / 2) * k
    this.draw()
  }

  tick() {
    const nodes = this.nodes
    const alpha = this.alpha
    const n = nodes.length
    // Repulsion (O(n^2) is fine for a few hundred nodes)
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1 }
        const d = Math.sqrt(d2)
        const strength = (a.kind === 'factor' && b.kind === 'factor' ? 2600 : 1400) / d2
        const fx = (dx / d) * strength * alpha
        const fy = (dy / d) * strength * alpha
        if (!a.fixed) { a.vx -= fx; a.vy -= fy }
        if (!b.fixed) { b.vx += fx; b.vy += fy }
      }
    }
    // Springs
    for (const l of this.links) {
      const a = l.s
      const b = l.t
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const rest = l.kind === 'chain' ? 110 : 70
      const k = l.kind === 'chain' ? 0.02 : 0.03
      const f = (d - rest) * k * alpha
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      const wa = 1 / Math.sqrt(1 + (this.degree[a.id] || 1))
      const wb = 1 / Math.sqrt(1 + (this.degree[b.id] || 1))
      if (!a.fixed) { a.vx += fx * wa; a.vy += fy * wa }
      if (!b.fixed) { b.vx -= fx * wb; b.vy -= fy * wb }
    }
    // Centering + integrate
    for (const nd of nodes) {
      if (nd.fixed) continue
      nd.vx -= nd.x * 0.004 * alpha
      nd.vy -= nd.y * 0.004 * alpha
      nd.vx *= 0.6
      nd.vy *= 0.6
      nd.x += nd.vx
      nd.y += nd.vy
    }
    this.alpha *= 0.985
  }

  screenToWorld(px, py) {
    return { x: (px - this.transform.x) / this.transform.k, y: (py - this.transform.y) / this.transform.k }
  }

  nodeAt(px, py) {
    const { x, y } = this.screenToWorld(px, py)
    let best = null
    let bestD = Infinity
    for (const n of this.nodes) {
      const dx = n.x - x
      const dy = n.y - y
      const d = dx * dx + dy * dy
      const r = (n.r + 4) / Math.min(1, this.transform.k)
      if (d < r * r && d < bestD) { bestD = d; best = n }
    }
    return best
  }

  _bind() {
    const c = this.canvas
    const pos = (e) => {
      const rect = c.getBoundingClientRect()
      const src = e.touches ? e.touches[0] : e
      return { x: src.clientX - rect.left, y: src.clientY - rect.top }
    }
    c.addEventListener('mousedown', (e) => {
      const p = pos(e)
      const n = this.nodeAt(p.x, p.y)
      this._downAt = p
      this._moved = false
      if (n) {
        this.dragging = n
        n.fixed = true
        this.reheat(0.3)
      } else {
        this.panning = { x: p.x, y: p.y, tx: this.transform.x, ty: this.transform.y }
      }
      e.preventDefault()
    })
    window.addEventListener('mousemove', (e) => {
      if (!this.width) return
      const p = pos(e)
      if (this.dragging) {
        const w = this.screenToWorld(p.x, p.y)
        this.dragging.x = w.x
        this.dragging.y = w.y
        this._moved = true
        this.reheat(0.2)
        return
      }
      if (this.panning) {
        this.transform.x = this.panning.tx + (p.x - this.panning.x)
        this.transform.y = this.panning.ty + (p.y - this.panning.y)
        this._moved = true
        this.draw()
        return
      }
      if (e.target !== c) return
      const n = this.nodeAt(p.x, p.y)
      if (n !== this.hover) {
        this.hover = n
        c.style.cursor = n ? 'pointer' : 'grab'
        if (this.onHover) this.onHover(n, p)
        this.draw()
      }
    })
    window.addEventListener('mouseup', (e) => {
      if (this.dragging) {
        const n = this.dragging
        n.fixed = false
        this.dragging = null
        if (!this._moved && this.onClick) this.onClick(n)
        this.reheat(0.1)
      } else if (this.panning) {
        this.panning = null
        if (!this._moved && e.target === c && this.onBackgroundClick) this.onBackgroundClick()
      }
    })
    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const p = pos(e)
      const factor = Math.exp(-e.deltaY * 0.0015)
      const k = Math.max(0.1, Math.min(4, this.transform.k * factor))
      const w = this.screenToWorld(p.x, p.y)
      this.transform.k = k
      this.transform.x = p.x - w.x * k
      this.transform.y = p.y - w.y * k
      this.draw()
    }, { passive: false })
    c.addEventListener('mouseleave', () => {
      if (this.hover) { this.hover = null; if (this.onHover) this.onHover(null); this.draw() }
    })
    // Touch: pan and tap
    c.addEventListener('touchstart', (e) => {
      const p = pos(e)
      this._downAt = p
      this._moved = false
      this.panning = { x: p.x, y: p.y, tx: this.transform.x, ty: this.transform.y }
    }, { passive: true })
    c.addEventListener('touchmove', (e) => {
      if (!this.panning) return
      const p = pos(e)
      this.transform.x = this.panning.tx + (p.x - this.panning.x)
      this.transform.y = this.panning.ty + (p.y - this.panning.y)
      this._moved = true
      this.draw()
    }, { passive: true })
    c.addEventListener('touchend', () => {
      if (this.panning && !this._moved) {
        const n = this.nodeAt(this._downAt.x, this._downAt.y)
        if (n && this.onClick) this.onClick(n)
        else if (this.onBackgroundClick) this.onBackgroundClick()
      }
      this.panning = null
    })
  }

  draw() {
    const ctx = this.ctx
    if (!this.width) return
    const { x: tx, y: ty, k } = this.transform
    ctx.save()
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.translate(tx, ty)
    ctx.scale(k, k)
    const hi = this.highlight
    const dimmed = (id) => hi && !hi.has(id)
    const neighbors = this.selected ? this._neighborSet(this.selected) : null

    // Soft glow behind emphasised nodes
    const glowNodes = []
    if (this.selected) glowNodes.push([this.selected, 1])
    if (this.hover && this.hover !== this.selected) glowNodes.push([this.hover, 0.6])
    if (hi) for (const n of this.nodes) if (hi.has(n.id) && n !== this.selected) glowNodes.push([n, 0.35])
    for (const [n, str] of glowNodes.slice(0, 80)) {
      const rr = n.r * 4
      const g = ctx.createRadialGradient(n.x, n.y, n.r * 0.5, n.x, n.y, rr)
      g.addColorStop(0, hexToRgba(n.color, 0.55 * str))
      g.addColorStop(1, hexToRgba(n.color, 0))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(n.x, n.y, rr, 0, Math.PI * 2); ctx.fill()
    }

    // Links
    for (const l of this.links) {
      if (l.kind === 'chain' && !this.showChain) continue
      const a = l.s, b = l.t
      let alpha = 1
      if (hi && (dimmed(a.id) || dimmed(b.id))) alpha = 0.06
      if (neighbors && !(neighbors.has(a.id) && neighbors.has(b.id))) alpha *= 0.15
      if (this.hover && (a === this.hover || b === this.hover)) alpha = 1
      const emph = this.emphasisLinks && this.emphasisLinks.has(`${a.id}>${b.id}`)
      if (l.kind === 'chain') {
        ctx.strokeStyle = emph ? `rgba(255,196,0,${Math.min(1, alpha + 0.3)})` : `rgba(255,150,40,${alpha * 0.55})`
        ctx.lineWidth = emph ? 2.5 : Math.min(4, 0.6 + Math.log2(1 + (l.weight || 1)))
        this._arrow(ctx, a, b, ctx.lineWidth)
      } else {
        ctx.strokeStyle = `rgba(150,170,210,${alpha * 0.35})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
    // Particles: causation flows from cause to effect along chain edges
    if (this.flow && this.showChain) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const t = this._flowT
      for (const l of this.links) {
        if (l.kind !== 'chain') continue
        const a = l.s, b = l.t
        const emph = this.emphasisLinks && this.emphasisLinks.has(`${a.id}>${b.id}`)
        let alpha = emph ? 1 : hi ? (dimmed(a.id) || dimmed(b.id) ? 0 : 0.5) : 0.55
        if (neighbors && !(neighbors.has(a.id) && neighbors.has(b.id))) alpha *= 0.15
        if (alpha < 0.03) continue
        const count = Math.min(4, 1 + Math.floor(Math.log2(1 + (l.weight || 1))))
        const speed = 0.18 + Math.min(0.25, (l.weight || 1) * 0.02)
        for (let i = 0; i < count; i++) {
          const f = (t * speed + i / count + (l._phase || (l._phase = Math.random()))) % 1
          const p = this._curvePoint(a, b, f)
          const size = (emph ? 3.2 : 2.2) * (0.6 + 0.4 * Math.sin(f * Math.PI))
          ctx.fillStyle = emph ? `rgba(255,220,120,${alpha})` : `rgba(255,170,70,${alpha})`
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill()
        }
      }
      ctx.restore()
    }

    // Nodes
    for (const n of this.nodes) {
      let alpha = 1
      if (dimmed(n.id)) alpha = 0.12
      if (neighbors && !neighbors.has(n.id) && n !== this.selected) alpha = Math.min(alpha, 0.25)
      if (n === this.hover) alpha = 1
      ctx.globalAlpha = alpha
      ctx.beginPath()
      if (n.kind === 'factor') {
        ctx.moveTo(n.x, n.y - n.r); ctx.lineTo(n.x + n.r, n.y); ctx.lineTo(n.x, n.y + n.r); ctx.lineTo(n.x - n.r, n.y); ctx.closePath()
      } else if (n.kind === 'accident') {
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
      } else {
        ctx.rect(n.x - n.r, n.y - n.r * 0.7, n.r * 2, n.r * 1.4)
      }
      ctx.fillStyle = n.color
      ctx.fill()
      if (n === this.selected || n === this.hover) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2 / k
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 0.8
        ctx.stroke()
      }
      const showLabel = n.kind !== 'accident' || this.labelsAlways || k > 0.9 || n === this.hover || n === this.selected || (hi && hi.has(n.id)) || (neighbors && neighbors.has(n.id))
      if (showLabel) {
        ctx.font = `${n.kind === 'factor' ? 11 : 10}px Tahoma, Verdana, sans-serif`
        ctx.fillStyle = n.kind === 'factor' ? '#ffe9b0' : '#e6eefc'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const label = n.label
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(8,12,24,0.85)'
        ctx.strokeText(label, n.x, n.y + n.r + 2)
        ctx.fillText(label, n.x, n.y + n.r + 2)
      }
      ctx.globalAlpha = 1
    }
    ctx.restore()
  }

  _arrow(ctx, a, b, width) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    const ux = dx / d
    const uy = dy / d
    // curve slightly so reciprocal edges are visible
    const mx = (a.x + b.x) / 2 - uy * d * 0.12
    const my = (a.y + b.y) / 2 + ux * d * 0.12
    ctx.beginPath()
    ctx.moveTo(a.x + ux * a.r, a.y + uy * a.r)
    ctx.quadraticCurveTo(mx, my, b.x - ux * (b.r + 2), b.y - uy * (b.r + 2))
    ctx.stroke()
    // arrow head
    const ex = b.x - ux * (b.r + 2)
    const ey = b.y - uy * (b.r + 2)
    const tdx = ex - mx
    const tdy = ey - my
    const td = Math.max(1, Math.sqrt(tdx * tdx + tdy * tdy))
    const hx = tdx / td
    const hy = tdy / td
    const size = 5 + width
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - hx * size - hy * size * 0.5, ey - hy * size + hx * size * 0.5)
    ctx.lineTo(ex - hx * size + hy * size * 0.5, ey - hy * size - hx * size * 0.5)
    ctx.closePath()
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()
  }

  /** Point at fraction f along the same quadratic curve _arrow draws. */
  _curvePoint(a, b, f) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    const ux = dx / d
    const uy = dy / d
    const mx = (a.x + b.x) / 2 - uy * d * 0.12
    const my = (a.y + b.y) / 2 + ux * d * 0.12
    const x0 = a.x + ux * a.r, y0 = a.y + uy * a.r
    const x2 = b.x - ux * (b.r + 2), y2 = b.y - uy * (b.r + 2)
    const g = 1 - f
    return { x: g * g * x0 + 2 * g * f * mx + f * f * x2, y: g * g * y0 + 2 * g * f * my + f * f * y2 }
  }

  _neighborSet(node) {
    const s = new Set([node.id])
    for (const l of this.links) {
      if (l.kind === 'chain' && !this.showChain) continue
      if (l.s === node) s.add(l.t.id)
      if (l.t === node) s.add(l.s.id)
    }
    return s
  }

  centerOn(id) {
    const n = this.nodeById[id]
    if (!n || !this.width) return
    this.transform.x = this.width / 2 - n.x * this.transform.k
    this.transform.y = this.height / 2 - n.y * this.transform.k
    this.draw()
  }

  destroy() {
    this.stop()
    this.stopFlow()
  }
}

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(200,200,200,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`
}
