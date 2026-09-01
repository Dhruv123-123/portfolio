/**
 * Query engine for the accident knowledge graph.
 *
 * Three signals are combined:
 *  1. Concept matching: taxonomy synonyms found in the query map to factor ids.
 *     Consecutive concepts are treated as a causal path, checked against each
 *     accident's chain (transitive closure).
 *  2. Lexical BM25 over the record text.
 *  3. Optional semantic similarity from precomputed sentence embeddings.
 */

const CONNECTORS = /\b(led to|leading to|leads to|caused|causing|cause[sd]?|resulting in|resulted in|results in|then|followed by|after|because of|due to|misdiagnosed as|mistaken for|into|->|→|and then|so that|which)\b/g
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'with', 'by', 'for', 'was', 'were', 'is', 'are', 'that', 'this', 'every', 'all', 'accident', 'accidents', 'crash', 'crashes', 'where', 'which', 'when', 'flight', 'flights', 'event', 'events', 'led', 'lead', 'leads', 'leading', 'as', 'it', 'its', 'from', 'into', 'then', 'after', 'before', 'any', 'show', 'me', 'find', 'list'])

export function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .map(stem)
}

function stem(w) {
  if (w.length <= 3) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function recordText(rec) {
  const parts = [
    rec.title, rec.flight_number, rec.operator, rec.aircraft?.type, rec.aircraft?.family, rec.aircraft?.manufacturer,
    rec.location?.name, rec.location?.country, rec.agency, rec.phase, rec.category, rec.summary, rec.probable_cause,
    ...(rec.agencies || []).map((a) => `${a.code} ${a.name || ''}`),
    ...(rec.factors || []).map((f) => `${f.id.replace(/_/g, ' ')} ${f.evidence || ''}`),
    ...(rec.events || []).map((e) => e.text),
    ...(rec.recommendations || []).map((r) => r.text),
    ...(rec.safety_changes || []),
    ...(rec.dissent || []).map((d) => `${d.agency} dissent ${d.position}`)
  ]
  return parts.filter(Boolean).join(' ')
}

/** Build the search index once from graph.json. */
export function buildIndex(graph) {
  const factorById = {}
  for (const f of graph.taxonomy.factors) factorById[f.id] = f

  // Synonym table: longest phrases first so "stall warning" wins over "stall".
  const phrases = []
  for (const f of graph.taxonomy.factors) {
    const all = new Set([f.label.toLowerCase(), f.id.replace(/_/g, ' '), ...f.synonyms.map((s) => s.toLowerCase())])
    for (const p of all) phrases.push({ phrase: p, id: f.id, words: p.split(/\s+/).length })
  }
  phrases.sort((a, b) => b.phrase.length - a.phrase.length)

  const records = graph.records
  const byId = {}
  const docs = []
  const df = {}
  let totalLen = 0
  for (const rec of records) {
    byId[rec.id] = rec
    const tokens = tokenize(recordText(rec))
    const tf = {}
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1
    for (const t of Object.keys(tf)) df[t] = (df[t] || 0) + 1
    docs.push({ id: rec.id, tf, len: tokens.length })
    totalLen += tokens.length
  }
  const avgLen = totalLen / Math.max(1, docs.length)

  // Per-record adjacency and reachability from chain edges.
  const adjacency = {}
  for (const rec of records) {
    const adj = {}
    for (const [a, b] of rec.chain || []) {
      ;(adj[a] = adj[a] || []).push(b)
    }
    adjacency[rec.id] = adj
  }

  const agencyCodes = new Set(graph.agencies.map((a) => a.code.toLowerCase()))
  const families = new Set(records.map((r) => (r.aircraft?.family || '').toLowerCase()).filter(Boolean))

  return { graph, records, byId, factorById, phrases, docs, df, avgLen, adjacency, agencyCodes, families }
}

/** Find a directed path a ⇝ b in one record's chain. Returns array of ids or null. */
export function findPath(index, recId, a, b) {
  const adj = index.adjacency[recId] || {}
  if (a === b) return [a]
  const parent = { [a]: null }
  const queue = [a]
  while (queue.length) {
    const cur = queue.shift()
    for (const next of adj[cur] || []) {
      if (next in parent) continue
      parent[next] = cur
      if (next === b) {
        const path = [b]
        let p = cur
        while (p !== null) {
          path.unshift(p)
          p = parent[p]
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

const FILTER_RE = /\b(agency|with|phase|year|type|aircraft|operator|op|country|category|cat|fatal|fatalities):(\S+)/gi

/** Parse a natural-language or structured query. */
export function parseQuery(raw, index) {
  let text = (raw || '').trim()
  const filters = {}
  text = text.replace(FILTER_RE, (_, key, value) => {
    const k = key.toLowerCase()
    const v = value.toLowerCase()
    if (k === 'agency') filters.agency = v.toUpperCase()
    else if (k === 'with') filters.with = v.toUpperCase()
    else if (k === 'phase') filters.phase = v
    else if (k === 'year') {
      const m = v.match(/^(\d{4})?(?:-|\.\.)?(\d{4})?$/)
      if (m) filters.year = [m[1] ? +m[1] : 0, m[2] ? +m[2] : 9999]
      const gt = v.match(/^>(\d{4})$/)
      const lt = v.match(/^<(\d{4})$/)
      if (gt) filters.year = [+gt[1], 9999]
      if (lt) filters.year = [0, +lt[1]]
    } else if (k === 'type' || k === 'aircraft') filters.type = v
    else if (k === 'operator' || k === 'op') filters.operator = v
    else if (k === 'country') filters.country = v
    else if (k === 'category' || k === 'cat') filters.category = v.toUpperCase()
    else if (k === 'fatal' || k === 'fatalities') filters.fatal = v
    return ' '
  })

  const lower = ' ' + text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9À-ɏ\-→>]+/g, ' ') + ' '
  const concepts = []
  let masked = lower
  for (const { phrase, id } of index.phrases) {
    let from = 0
    const needle = ' ' + phrase + ' '
    while (true) {
      const pos = masked.indexOf(needle, from)
      if (pos < 0) break
      concepts.push({ id, phrase, pos })
      masked = masked.slice(0, pos + 1) + '#'.repeat(phrase.length) + masked.slice(pos + 1 + phrase.length)
      from = pos + needle.length
    }
  }
  concepts.sort((a, b) => a.pos - b.pos)
  // Deduplicate consecutive identical concepts
  const seq = []
  for (const c of concepts) if (!seq.length || seq[seq.length - 1].id !== c.id) seq.push(c)

  const hasConnector = CONNECTORS.test(lower)
  CONNECTORS.lastIndex = 0
  const ordered = seq.length >= 2 && (hasConnector || /->|→/.test(text))

  // Plain agency or family mentions become soft boosts
  const boosts = {}
  for (const tok of lower.split(' ')) {
    if (index.agencyCodes.has(tok)) boosts.agency = tok.toUpperCase()
    if (index.families.has(tok)) boosts.family = tok
  }
  const tokens = tokenize(masked.replace(/#/g, ' '))
  return { raw, text, filters, concepts: seq, ordered, tokens, boosts, allTokens: tokenize(text) }
}

function bm25(index, doc, tokens) {
  const k1 = 1.2
  const b = 0.75
  const N = index.docs.length
  let score = 0
  for (const t of tokens) {
    const tf = doc.tf[t]
    if (!tf) continue
    const df = index.df[t] || 0
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.len) / index.avgLen)))
  }
  return score
}

function passesFilters(rec, filters) {
  if (filters.agency && rec.agency.toUpperCase() !== filters.agency) return false
  if (filters.with && !(rec.agencies || []).some((a) => a.code.toUpperCase() === filters.with)) return false
  if (filters.phase && rec.phase !== filters.phase) return false
  if (filters.year) {
    const y = +rec.date.slice(0, 4)
    if (y < filters.year[0] || y > filters.year[1]) return false
  }
  if (filters.type) {
    const hay = `${rec.aircraft?.type || ''} ${rec.aircraft?.family || ''} ${rec.aircraft?.manufacturer || ''}`.toLowerCase()
    if (!hay.includes(filters.type)) return false
  }
  if (filters.operator && !(rec.operator || '').toLowerCase().includes(filters.operator)) return false
  if (filters.country && !(rec.location?.country || '').toLowerCase().includes(filters.country)) return false
  if (filters.category && (rec.category || '').toUpperCase() !== filters.category) return false
  if (filters.fatal) {
    const f = rec.fatalities || 0
    if (filters.fatal === 'none' || filters.fatal === '0') {
      if (f !== 0) return false
    } else if (filters.fatal === 'any' || filters.fatal === 'yes') {
      if (f === 0) return false
    } else {
      const m = filters.fatal.match(/^([<>]=?)(\d+)$/)
      if (m) {
        const n = +m[2]
        if (m[1] === '>' && !(f > n)) return false
        if (m[1] === '>=' && !(f >= n)) return false
        if (m[1] === '<' && !(f < n)) return false
        if (m[1] === '<=' && !(f <= n)) return false
      }
    }
  }
  return true
}

function bestSnippet(rec, tokens, conceptIds) {
  const candidates = []
  for (const f of rec.factors || []) {
    if (f.evidence) candidates.push({ text: f.evidence, bonus: conceptIds.includes(f.id) ? 2 : 0 })
  }
  for (const e of rec.events || []) candidates.push({ text: e.text, bonus: (e.factors || []).some((x) => conceptIds.includes(x)) ? 1 : 0 })
  candidates.push({ text: rec.summary, bonus: 0.5 })
  let best = null
  let bestScore = -1
  for (const c of candidates) {
    const toks = new Set(tokenize(c.text))
    let s = c.bonus
    for (const t of tokens) if (toks.has(t)) s += 1
    if (s > bestScore) {
      bestScore = s
      best = c.text
    }
  }
  return best
}

/**
 * Run a query. `semantic` is an optional map id -> cosine similarity in [−1, 1].
 * Returns ranked results with explanations.
 */
export function search(index, raw, { semantic = null, limit = 50 } = {}) {
  const q = parseQuery(raw, index)
  const conceptIds = q.concepts.map((c) => c.id)
  const results = []
  const empty = !q.tokens.length && !conceptIds.length && !semantic

  for (const doc of index.docs) {
    const rec = index.byId[doc.id]
    if (!passesFilters(rec, q.filters)) continue
    const recFactors = new Set((rec.factors || []).map((f) => f.id))
    const present = conceptIds.filter((id) => recFactors.has(id))
    const missing = conceptIds.filter((id) => !recFactors.has(id))

    let pathScore = 0
    const hops = []
    let fullPath = false
    if (present.length >= 2) {
      let allHops = true
      let path = null
      for (let i = 0; i < conceptIds.length - 1; i++) {
        const a = conceptIds[i]
        const b = conceptIds[i + 1]
        if (!recFactors.has(a) || !recFactors.has(b)) {
          allHops = false
          continue
        }
        const p = findPath(index, rec.id, a, b)
        if (p) {
          hops.push(p)
          pathScore += 3
          path = path ? path.concat(p.slice(1)) : p
        } else {
          allHops = false
        }
      }
      fullPath = allHops && missing.length === 0 && hops.length === conceptIds.length - 1
      if (fullPath) pathScore += 3
    }
    const conceptScore = present.length * 1.5 - missing.length * 0.5
    const lexRaw = bm25(index, doc, q.tokens)
    const semScore = semantic ? Math.max(0, semantic[rec.id] || 0) : 0
    let boost = 0
    if (q.boosts.agency && (rec.agency.toUpperCase() === q.boosts.agency || (rec.agencies || []).some((a) => a.code.toUpperCase() === q.boosts.agency))) boost += 1.5
    if (q.boosts.family && (rec.aircraft?.family || '').toLowerCase() === q.boosts.family) boost += 1.5

    const score = pathScore + conceptScore + lexRaw * 0.6 + semScore * 6 + boost
    if (!empty && score <= 0.05 && !(q.filters && Object.keys(q.filters).length && !q.tokens.length && !conceptIds.length)) continue
    const mergedPath = hops.length ? hops.reduce((acc, p) => (acc.length ? acc.concat(p.slice(1)) : p), []) : []
    results.push({
      id: rec.id,
      score,
      why: {
        concepts: present,
        missing,
        path: mergedPath,
        fullPath,
        hops: hops.length,
        lexical: lexRaw,
        semantic: semScore,
        snippet: bestSnippet(rec, q.allTokens, conceptIds)
      }
    })
  }
  results.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return { query: q, results: results.slice(0, limit), total: results.length }
}

/** Cosine similarities between a query vector and precomputed record vectors. */
export function cosineMap(queryVec, embeddings) {
  const out = {}
  for (const { id, v } of embeddings.vectors) {
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += v[i] * queryVec[i]
    out[id] = dot
  }
  return out
}

/** Accidents that share the most factors / chain edges with the given record. */
export function similarRecords(index, recId, limit = 6) {
  const rec = index.byId[recId]
  if (!rec) return []
  const mine = new Set(rec.factors.map((f) => f.id))
  const myEdges = new Set(rec.chain.map(([a, b]) => `${a}>${b}`))
  const scored = []
  for (const other of index.records) {
    if (other.id === recId) continue
    const theirs = new Set(other.factors.map((f) => f.id))
    let shared = 0
    for (const f of mine) if (theirs.has(f)) shared++
    const union = new Set([...mine, ...theirs]).size
    let sharedEdges = 0
    for (const [a, b] of other.chain) if (myEdges.has(`${a}>${b}`)) sharedEdges++
    const score = shared / Math.max(1, union) + sharedEdges * 0.15 + (rec.related?.includes(other.id) ? 0.3 : 0)
    scored.push({ id: other.id, score, shared, sharedEdges })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
