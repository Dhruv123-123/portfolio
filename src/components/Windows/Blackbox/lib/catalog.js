/**
 * Catalog tier: thousands of summary-level records served as a compact index
 * plus per-year shards under /blackbox/catalog/.
 */
const BASE = '/blackbox/catalog'
let indexPromise = null
const shardCache = {}

export function loadCatalogIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}/index.json`).then((r) => {
      if (!r.ok) throw new Error(`catalog index ${r.status}`)
      return r.json()
    })
  }
  return indexPromise
}

/** Expand a compact index row into a record-shaped stub the search index understands. */
export function rowToStub(row) {
  return {
    id: row.id,
    tier: row.tier,
    depth: row.depth,
    stub: true,
    title: row.title,
    date: row.date,
    agency: row.agency || 'UNKNOWN',
    agencies: row.agency ? [{ code: row.agency, role: 'lead' }] : [],
    operator: row.operator || '',
    aircraft: { type: row.ac || '', manufacturer: row.mf || '' },
    location: { country: row.cty || '', lat: typeof row.la === 'number' ? row.la : null, lon: typeof row.lo === 'number' ? row.lo : null },
    phase: row.phase || 'unknown',
    category: row.category || 'UNK',
    fatalities: row.fatalities ?? null,
    occupants: row.occupants ?? null,
    summary: row.s || '',
    probable_cause: '',
    factors: (row.f || []).map((id) => ({ id, role: 'contributing' })),
    chain: row.c || [],
    events: [],
    cvr: [],
    recommendations: [],
    dissent: row.d ? [{ agency: '?', position: 'formal dissent recorded (open the record)' }] : [],
    report_links: row.r ? ['(see record)'] : [],
    interest: row.interest || 0,
    curated_id: row.curated_id || null,
    qid: row.qid || null,
    wikipedia: row.w ? `https://en.wikipedia.org/wiki/${row.w}` : null,
    asn_id: row.asn_id || null,
    ntsb_no: row.ntsb_no || null,
    extraction: { method: row.tier === 'ntsb' ? 'rules' : 'llm', confidence: 'medium', reviewed: false }
  }
}

/** Load the full catalog record from its year shard. */
export async function loadCatalogRecord(id, date) {
  const year = (date || '').slice(0, 4)
  if (!year) return null
  if (!shardCache[year]) {
    shardCache[year] = fetch(`${BASE}/${year}.json`).then((r) => (r.ok ? r.json() : []))
  }
  const rows = await shardCache[year]
  return rows.find((r) => r.id === id) || null
}
