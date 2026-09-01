/**
 * Layered layout for a small causal DAG (factor chain). Returns nodes with
 * layer/x/y and edges with path coordinates, for SVG rendering.
 */
export function layoutChain(chain, labelOf, { nodeH = 24, gapX = 46, gapY = 12, charW = 6.1, padX = 10 } = {}) {
  const nodes = new Map()
  const out = new Map()
  const inn = new Map()
  for (const [a, b] of chain) {
    for (const id of [a, b]) {
      if (!nodes.has(id)) {
        nodes.set(id, { id, label: labelOf(id) })
        out.set(id, [])
        inn.set(id, [])
      }
    }
    out.get(a).push(b)
    inn.get(b).push(a)
  }
  // Break cycles: DFS marking back edges
  const state = {}
  const backEdges = new Set()
  const visit = (u) => {
    state[u] = 1
    for (const v of out.get(u)) {
      if (state[v] === 1) backEdges.add(`${u}>${v}`)
      else if (!state[v]) visit(v)
    }
    state[u] = 2
  }
  for (const id of nodes.keys()) if (!state[id]) visit(id)
  const fwd = (u) => out.get(u).filter((v) => !backEdges.has(`${u}>${v}`))
  const fwdIn = (v) => inn.get(v).filter((u) => !backEdges.has(`${u}>${v}`))
  // Longest path layering
  const layer = {}
  const depth = (u) => {
    if (layer[u] !== undefined) return layer[u]
    const preds = fwdIn(u)
    layer[u] = preds.length ? 1 + Math.max(...preds.map(depth)) : 0
    return layer[u]
  }
  for (const id of nodes.keys()) depth(id)
  const layers = []
  for (const id of nodes.keys()) (layers[layer[id]] = layers[layer[id]] || []).push(id)
  // Order within layers by barycenter of predecessors (two passes)
  const pos = {}
  layers.forEach((ids, i) => ids.forEach((id, j) => (pos[id] = j)))
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < layers.length; i++) {
      layers[i].sort((a, b) => {
        const ba = fwdIn(a).length ? fwdIn(a).reduce((s, p) => s + pos[p], 0) / fwdIn(a).length : pos[a]
        const bb = fwdIn(b).length ? fwdIn(b).reduce((s, p) => s + pos[p], 0) / fwdIn(b).length : pos[b]
        return ba - bb
      })
      layers[i].forEach((id, j) => (pos[id] = j))
    }
  }
  // Coordinates
  const widths = {}
  for (const n of nodes.values()) widths[n.id] = Math.max(60, n.label.length * charW + padX * 2)
  const layerW = layers.map((ids) => Math.max(...ids.map((id) => widths[id])))
  const layerX = []
  let x = 0
  for (let i = 0; i < layers.length; i++) {
    layerX.push(x)
    x += layerW[i] + gapX
  }
  const totalW = x - gapX
  const maxRows = Math.max(...layers.map((l) => l.length))
  const totalH = maxRows * (nodeH + gapY) - gapY
  const placed = []
  layers.forEach((ids, i) => {
    const colH = ids.length * (nodeH + gapY) - gapY
    const y0 = (totalH - colH) / 2
    ids.forEach((id, j) => {
      const n = nodes.get(id)
      n.x = layerX[i] + (layerW[i] - widths[id]) / 2
      n.y = y0 + j * (nodeH + gapY)
      n.w = widths[id]
      n.h = nodeH
      n.layer = i
      placed.push(n)
    })
  })
  const edges = chain.map(([a, b]) => {
    const s = nodes.get(a)
    const t = nodes.get(b)
    const back = backEdges.has(`${a}>${b}`)
    const x1 = back ? s.x : s.x + s.w
    const y1 = s.y + s.h / 2
    const x2 = back ? t.x + t.w : t.x
    const y2 = t.y + t.h / 2
    const dx = Math.max(24, Math.abs(x2 - x1) * 0.5)
    const d = back
      ? `M ${x1} ${y1} C ${x1 - dx} ${y1 + 30}, ${x2 + dx} ${y2 + 30}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
    return { from: a, to: b, d, back }
  })
  return { nodes: placed, edges, width: totalW, height: totalH }
}
