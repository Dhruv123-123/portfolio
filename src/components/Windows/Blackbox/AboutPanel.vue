<template>
  <div class="ab-root bb-scroll">
    <div class="ab-col">
      <h2>What this is</h2>
      <p>
        Blackbox turns official accident investigation reports from <b>{{ graph.agencies.length }} agencies</b> into one queryable
        knowledge graph, then puts a flight-data-recorder replay and a timeline builder on top of it. Every accident is a
        structured record: a controlled-vocabulary set of <b>{{ graph.taxonomy.factors.length }} factors</b>, a directed causal chain
        between those factors, a timestamped event sequence with aircraft state, CVR excerpts where public, the recommendations
        issued, and any formal dissent between agencies.
      </p>
      <h2>Pipeline</h2>
      <ol class="ab-steps">
        <li><b>fetch_reports.py</b> downloads the final report PDF for each accident from the agency (NTSB, BEA, AAIB, TSB, ATSB and others).</li>
        <li><b>extract_text.py</b> converts each PDF to page-marked text with PyMuPDF.</li>
        <li><b>extract_graph.py</b> sends the whole report, the taxonomy and the JSON schema to Claude with structured outputs, so the model must return a schema-valid record whose factor ids come only from the taxonomy. Prompt caching keeps re-runs cheap.</li>
        <li><b>validate.py</b> rejects unknown factors, broken chains, non-chronological events and dangling references.</li>
        <li><b>build_graph.py</b> merges records into <code>graph.json</code> with aggregate chain statistics; <b>build_embeddings.mjs</b> adds sentence embeddings for semantic search.</li>
      </ol>
      <h2>How search works</h2>
      <p>
        A query is parsed three ways at once. Phrases are matched against factor synonyms to find <i>concepts</i>; when they are
        joined by connectors like "led to" or "→", they become an ordered <i>path query</i> that is checked against each accident's
        causal chain using transitive closure, so "pitot blocked → unreliable airspeed → misdiagnosed" only fully matches accidents
        where the chain actually runs that way. The remaining words score with BM25 over the record text. Optionally, a small
        sentence-embedding model (all-MiniLM-L6-v2) runs in the browser to add semantic similarity. Filters such as
        <code>agency:NTSB</code>, <code>phase:approach</code>, <code>year:1990-2009</code> or <code>fatal:none</code> narrow the set.
      </p>
      <h2>Caveats, honestly</h2>
      <ul>
        <li>The seed corpus shipped here was extracted by Claude from its knowledge of the public final reports and then reviewed, not by running the PDF pipeline on every report. Each record carries a confidence level and notes.</li>
        <li>FDR replays are <b>reconstructed keyframes</b> digitised from the plots published in the reports, not raw recorder data. They follow the published traces but are not evidence.</li>
        <li>CVR excerpts are limited to lines that appear in the public reports.</li>
        <li>Recommendation statuses change; treat them as a snapshot. Always go back to the report before citing anything.</li>
      </ul>
      <h2>The immersive layer</h2>
      <ul>
        <li><b>Atlas</b>: every record with a position is a point of light on a globe; scrub or play the century and watch the accidents draw the coastlines. Records without coordinates sit faintly at their country's centroid.</li>
        <li><b>Story</b>: any record with an event sequence can be told as a documentary: title card, the flight, one beat per event with instrument readouts and nearby CVR lines, the chain revealed edge by edge, findings, what changed, earlier and later echoes.</li>
        <li><b>Replay</b>: cockpit camera with a conformal head-up display, auto-directed cinematic cameras, a radar scope, and a scene whose night, rain, thunderstorms and fog come from the record itself. Sound is synthesized live (engine hum follows N1, slipstream follows airspeed, stall cricket or stick shaker, cavalry charge, GPWS call-outs); no audio files.</li>
        <li><b>Requiem</b>: on the atlas, the century plays itself as a memorial: the interface fades, a drone breathes under the decades, a note sounds for every accident and the camera visits each major one. Selecting any record lights the globe as the sun stood at that moment.</li>
        <li><b>Ghost</b>: in the replay, a translucent aircraft holds the altitude, heading and speed of the instant you press it, so the real flight's divergence is visible. A weather radar panel shows procedural cells matching the record's weather; cinematic mode slows around each marker.</li>
        <li><b>Constellation</b>: the graph as a star chart, factors twinkling, causal chains as constellation lines; with sound on, each query's concepts play as an arpeggio.</li>
        <li><b>Real audio</b>: where an openly licensed recording exists on Wikimedia Commons (mostly FAA air traffic control tapes, which are public domain; a few released cockpit voice recorders), it plays in sync with the replay clock with an adjustable offset, and appears on the timeline, the graph and the story. Cockpit voice recorder audio from US investigations is never released by law, so those accidents carry the controllers' side only.</li>
        <li><b>Formation and tags</b>: in the replay, every recorded flight can be flown abreast of the current one, aligned at t=0, each diverging the way it really did; event tags stay hanging in the sky where they happened.</li>
        <li><b>Orrery and hindsight</b>: the graph can arrange itself as an orrery, each initiating factor a sun with the accidents it started in orbit; an "as of" slider winds the corpus back so factor statistics show only what was known by that year.</li>
        <li><b>Drift</b>: the exhibit plays itself, wandering between the requiem, a story and a cinematic replay until you touch anything.</li>
        <li><b>Counterfactuals</b>: a factor's page counts the accidents where every encoded path from an initiating factor to the outcome runs through it, so removing it would break the chain as written.</li>
        <li><b>Read more</b>: every record links to its Wikipedia article (or a Wikipedia search when none is linked), as a way in, not as a source. The sources remain the agency reports.</li>
      </ul>
      <h2>Keys</h2>
      <p><span class="bb-kbd">1</span>–<span class="bb-kbd">5</span> switch tabs · <span class="bb-kbd">Ctrl K</span> or <span class="bb-kbd">/</span> command palette · replay: <span class="bb-kbd">Space</span> play / pause, <span class="bb-kbd">←</span> <span class="bb-kbd">→</span> step 1 s (shift: 10 s), <span class="bb-kbd">C</span> camera, <span class="bb-kbd">M</span> sound, <span class="bb-kbd">F</span> theatre, <span class="bb-kbd">G</span> ghost · story: <span class="bb-kbd">→</span> next, <span class="bb-kbd">Esc</span> close.</p>
      <p class="bb-muted">On <code>/blackbox</code> the URL hash carries the tab, record, query and story, so any view can be shared.</p>
    </div>
    <div class="ab-col">
      <h2>Corpus</h2>
      <p v-if="catalog && catalog.state === 'ready'">Catalog loaded: <b>{{ catalog.count.toLocaleString() }}</b> summary-level records ({{ Object.entries(catalog.tiers).map(([k, v]) => k + ' ' + v.toLocaleString()).join(', ') }}) on top of the {{ graph.records.length }} hand-reviewed full records below. Wikidata rows were extracted by Haiku subagents from Wikipedia text; NTSB rows are mapped by rules from the Board's coded findings.</p>
      <p v-else class="bb-muted">The catalog tier (Wikidata/Wikipedia worldwide index and the NTSB public database) is loaded on demand from the Graph tab.</p>
      <table class="ab-table">
        <thead><tr><th>Agency</th><th>Records</th><th>Fatalities</th></tr></thead>
        <tbody>
          <tr v-for="row in byAgency" :key="row.code"><td><span class="bb-agency">{{ row.code }}</span> {{ row.name }}</td><td>{{ row.n }}</td><td>{{ row.fatalities.toLocaleString() }}</td></tr>
        </tbody>
      </table>
      <h2>Factor categories</h2>
      <table class="ab-table">
        <tbody>
          <tr v-for="c in byCategory" :key="c.id"><td><span class="ab-swatch" :style="{ background: c.color }"></span>{{ c.label }}</td><td>{{ c.factors }} factors</td><td>{{ c.uses }} uses</td></tr>
        </tbody>
      </table>
      <h2>Most common causal edges</h2>
      <table class="ab-table">
        <tbody>
          <tr v-for="e in topEdges" :key="e.from + e.to"><td>{{ label(e.from) }} → {{ label(e.to) }}</td><td>{{ e.n }}</td></tr>
        </tbody>
      </table>
      <h2>Accidents with formal agency dissent</h2>
      <ul>
        <li v-for="r in dissenting" :key="r.id">{{ r.title }} — {{ r.dissent.map((d) => d.agency).join(', ') }} vs {{ r.agency }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ graph: Object, index: Object, catalog: Object })

const label = (id) => props.graph.taxonomy.factors.find((f) => f.id === id)?.label || id
const byAgency = computed(() => {
  const m = {}
  for (const r of props.graph.records) {
    const a = props.graph.agencies.find((x) => x.code === r.agency)
    m[r.agency] = m[r.agency] || { code: r.agency, name: a?.name || '', n: 0, fatalities: 0 }
    m[r.agency].n++
    m[r.agency].fatalities += r.fatalities || 0
  }
  return Object.values(m).sort((a, b) => b.n - a.n)
})
const byCategory = computed(() =>
  Object.entries(props.graph.taxonomy.categories).map(([id, c]) => {
    const factors = props.graph.taxonomy.factors.filter((f) => f.category === id)
    return { id, label: c.label, color: c.color, factors: factors.length, uses: factors.reduce((s, f) => s + (props.graph.stats.factor_counts[f.id] || 0), 0) }
  })
)
const topEdges = computed(() => props.graph.stats.chain_edges.slice(0, 12))
const dissenting = computed(() => props.graph.records.filter((r) => r.dissent && r.dissent.length))
</script>

<style scoped>
.ab-root { position: absolute; inset: 0; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 14px 20px 30px; line-height: 1.5; }
.ab-col h2 { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bb-accent); margin: 14px 0 6px; }
.ab-col h2:first-child { margin-top: 0; }
.ab-col p, .ab-col li { color: #d3ddf0; }
.ab-steps { padding-left: 18px; }
.ab-steps li { margin-bottom: 4px; }
code { font-family: Consolas, monospace; background: #070a12; padding: 0 3px; border-radius: 2px; }
.ab-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.ab-table td, .ab-table th { border-bottom: 1px solid var(--bb-line); padding: 3px 4px; text-align: left; }
.ab-table th { color: var(--bb-muted); font-weight: 400; font-size: 10px; }
.ab-swatch { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border-radius: 2px; }
ul { padding-left: 18px; }
@media (max-width: 900px) { .ab-root { grid-template-columns: 1fr; } }
</style>
