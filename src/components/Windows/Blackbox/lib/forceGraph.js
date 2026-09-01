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
  }
}
