/**
 * Counterfactual analysis over causal chains.
 *
 * For a record, a factor is a "single point" when every path from an initiating
 * factor to an outcome factor passes through it: remove it and the chain, as
 * encoded, no longer reaches the outcome. Across the corpus this ranks factors
 * by how many accidents' chains they would have severed.
 */

function buildAdj(chain) {
  const adj = {}
  const nodes = new Set()
  for (const [a, b] of chain) {
    if (!a || !b) continue
    ;(adj[a] = adj[a] || []).push(b)
    nodes.add(a)
    nodes.add(b)
  }
  return { adj, nodes }
}

/** Nodes with no incoming edge (sources) and no outgoing edge (sinks). */
function endpoints(chain, rec) {
  const { adj, nodes } = buildAdj(chain)
  const hasIn = new Set(chain.map((e) => e[1]))
  const hasOut = new Set(chain.map((e) => e[0]))
  const roles = {}
  for (const f of rec.factors || []) roles[f.id] = f.role
  let sources = [...nodes].filter((n) => !hasIn.has(n))
  let sinks = [...nodes].filter((n) => !hasOut.has(n))
  // Prefer role labels when they exist inside the chain
  const initiating = [...nodes].filter((n) => roles[n] === 'initiating')
  const outcomes = [...nodes].filter((n) => roles[n] === 'outcome')
  if (initiating.length) sources = initiating
  if (outcomes.length) sinks = outcomes
  return { adj, nodes, sources, sinks }
}

function reaches(adj, sources, sinks, banned) {
  const target = new Set(sinks)
  const seen = new Set()
  const stack = sources.filter((s) => s !== banned)
  for (const s of stack) seen.add(s)
  while (stack.length) {
    const n = stack.pop()
    if (target.has(n)) return true
    for (const m of adj[n] || []) {
      if (m === banned || seen.has(m)) continue
      seen.add(m)
      stack.push(m)
    }
  }
  return false
}

/** Factors in this record whose removal disconnects every initiating→outcome path. */
export function singlePoints(rec) {
  const chain = rec.chain || []
  if (chain.length < 2) return []
  const { adj, nodes, sources, sinks } = endpoints(chain, rec)
  if (!sources.length || !sinks.length) return []
  if (!reaches(adj, sources, sinks, null)) return []
  const out = []
  for (const n of nodes) {
    if (sinks.includes(n) && sinks.length === 1) continue
    if (!reaches(adj, sources, sinks, n)) out.push(n)
  }
  return out
}

/**
 * Corpus-wide: for a factor, which records' chains it severs, and how many merely contain it.
 * Cached per index so repeated factor clicks are instant.
 */
export function factorCut(index, factorId) {
  if (!index._cutCache) index._cutCache = {}
  if (index._cutCache[factorId]) return index._cutCache[factorId]
  const severed = []
  let contains = 0
  for (const rec of index.records) {
    if (!(rec.factors || []).some((f) => f.id === factorId)) continue
    contains++
    if (!(rec.chain || []).length) continue
    if (singlePointsCached(rec).includes(factorId)) severed.push(rec.id)
  }
  const res = { factorId, contains, severed }
  index._cutCache[factorId] = res
  return res
}

export function singlePointsCached(rec) {
  if (rec._sp && rec._spLen === (rec.chain || []).length) return rec._sp
  rec._sp = singlePoints(rec)
  rec._spLen = (rec.chain || []).length
  return rec._sp
}

/** Top factors by number of chains they would have severed (curated + deep records only). */
export function topCuts(index, limit = 12) {
  const counts = {}
  for (const rec of index.records) {
    if (rec.stub || !(rec.chain || []).length) continue
    for (const f of singlePointsCached(rec)) counts[f] = (counts[f] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit)
}
