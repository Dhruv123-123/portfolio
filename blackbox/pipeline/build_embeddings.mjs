#!/usr/bin/env node
// Compute sentence embeddings for every accident record so the web app can do
// semantic search. Uses all-MiniLM-L6-v2 (384-d) through @huggingface/transformers.
// Usage (from repo root): node blackbox/pipeline/build_embeddings.mjs
// Writes src/data/blackbox/embeddings.json. The browser embeds the query with
// the same model, so the vectors must come from this exact model id.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pipeline } from '@huggingface/transformers'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const reportsDir = join(root, 'data', 'reports')
const out = join(root, '..', 'src', 'data', 'blackbox', 'embeddings.json')
const MODEL = 'Xenova/all-MiniLM-L6-v2'

export function recordText(rec) {
  const factors = rec.factors.map((f) => `${f.id.replace(/_/g, ' ')}: ${f.evidence || ''}`).join('. ')
  const chain = rec.chain.map(([a, b]) => `${a.replace(/_/g, ' ')} led to ${b.replace(/_/g, ' ')}`).join('. ')
  return [rec.title, rec.aircraft?.type, rec.operator, rec.phase, rec.summary, rec.probable_cause, factors, chain].filter(Boolean).join('\n')
}

const files = readdirSync(reportsDir).filter((f) => f.endsWith('.json')).sort()
const records = files.map((f) => JSON.parse(readFileSync(join(reportsDir, f), 'utf8')))
const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' })
const vectors = []
for (const rec of records) {
  const output = await extractor(recordText(rec), { pooling: 'mean', normalize: true })
  vectors.push({ id: rec.id, v: Array.from(output.data).map((x) => Number(x.toFixed(4))) })
  process.stdout.write(`${rec.id} `)
}
writeFileSync(out, JSON.stringify({ model: MODEL, dims: 384, pooling: 'mean', normalize: true, vectors }))
console.log(`\nwrote ${out} (${vectors.length} vectors)`)
