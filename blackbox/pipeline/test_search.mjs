#!/usr/bin/env node
// Regression test for the query engine against the built graph.
// Usage: node blackbox/pipeline/test_search.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildIndex, search, parseQuery } from '../../src/components/Windows/Blackbox/lib/search.js'

const here = dirname(fileURLToPath(import.meta.url))
const graph = JSON.parse(readFileSync(join(here, '..', '..', 'src', 'data', 'blackbox', 'graph.json'), 'utf8'))
const index = buildIndex(graph)

const cases = [
  { q: 'every accident where a stuck pitot tube led to an unreliable airspeed event that was misdiagnosed as a stall', expectTop: ['af447', 'birgenair301', 'northwest6231', 'saratov703', 'austral2553'], minFullPath: 2 },
  { q: 'wrong engine shut down', expectTop: ['kegworth', 'transasia235'] },
  { q: 'maintenance error -> fuel exhaustion -> ditching', expectTop: ['tuninter1153'] },
  { q: 'somatogravic illusion during go-around', expectTop: ['atlas3591', 'flydubai981'] },
  { q: 'agency:NTSB fatigue approach', expectAgency: 'NTSB' },
  { q: 'fatal:none', expectFatal: 0 },
  { q: 'radio altimeter autothrottle retard', expectTop: ['turkish1951'] },
  { q: 'MCAS', expectTop: ['ethiopian302', 'lionair610'] },
  { q: 'TCAS resolution advisory conflict with ATC', expectTop: ['uberlingen'] }
]

let failures = 0
for (const c of cases) {
  const { results, query } = search(index, c.q)
  const ids = results.map((r) => r.id)
  const top = ids.slice(0, Math.max(5, (c.expectTop || []).length + 2))
  const lines = [`Q: ${c.q}`, `   concepts: ${query.concepts.map((x) => x.id).join(' -> ')}${query.ordered ? ' (ordered)' : ''}  filters: ${JSON.stringify(query.filters)}`, `   top: ${top.join(', ')}`]
  if (c.expectTop) {
    const missing = c.expectTop.filter((id) => index.byId[id] && !top.includes(id))
    if (missing.length) { failures++; lines.push(`   FAIL missing from top: ${missing.join(', ')}`) }
    const absent = c.expectTop.filter((id) => !index.byId[id])
    if (absent.length) lines.push(`   (not in corpus: ${absent.join(', ')})`)
  }
  if (c.minFullPath) {
    const full = results.filter((r) => r.why.fullPath).map((r) => r.id)
    lines.push(`   full path matches: ${full.join(', ') || 'none'}`)
    if (full.length < c.minFullPath) { failures++; lines.push(`   FAIL expected at least ${c.minFullPath} full-path matches`) }
  }
  if (c.expectAgency && results.some((r) => index.byId[r.id].agency !== c.expectAgency && !index.byId[r.id].agencies.some((a) => a.code === c.expectAgency))) { failures++; lines.push('   FAIL agency filter leaked') }
  if (c.expectFatal !== undefined && results.some((r) => (index.byId[r.id].fatalities || 0) !== c.expectFatal)) { failures++; lines.push('   FAIL fatal filter leaked') }
  console.log(lines.join('\n'))
}
console.log(failures ? `\n${failures} failure(s)` : '\nall search cases passed')
process.exit(failures ? 1 : 0)
