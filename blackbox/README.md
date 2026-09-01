# Blackbox

A cross-agency aviation accident knowledge graph, FDR replay and timeline builder.
It lives inside the portfolio as a desktop window and at `/blackbox`.

Ask it: *"every accident where a stuck pitot tube led to an unreliable airspeed
event that was misdiagnosed as a stall"* and it returns the accidents whose
encoded causal chain actually runs that way (Birgenair 301, Northwest 6231, Air
France 447, Austral 2553, Saratov 703 ...), with the matched path shown.

## Layout

```
blackbox/
  SPEC.md                 data specification (record + FDR schemas, authoring rules)
  data/taxonomy.json      122 controlled factors with synonyms, phases, actor codes
  data/reports/<id>.json  one structured record per accident
  data/fdr/<id>.json      reconstructed FDR keyframes for the replay
  pipeline/
    sources.json          report PDF URLs per accident
    fetch_reports.py      download PDFs -> cache/pdf
    extract_text.py       PDF -> page-marked text (PyMuPDF) -> cache/text
    extract_graph.py      Claude structured extraction -> data/reports
    validate.py           schema + taxonomy + chronology checks
    build_graph.py        merge -> src/data/blackbox/graph.json (+ fdr copies)
    build_embeddings.mjs  sentence embeddings -> src/data/blackbox/embeddings.json
    test_search.mjs       query-engine regression cases
src/components/Windows/Blackbox/
  Blackbox.vue            shell (tabs, data loading)
  GraphExplorer.vue       force graph + query engine UI
  FdrReplay.vue           three.js replay, PFD, control panel, strips, CVR
  TimelineBuilder.vue     event chain, compare, narrative
  AboutPanel.vue          method and corpus statistics
  lib/search.js           concept/path/BM25/semantic query engine
  lib/forceGraph.js       canvas force layout
  lib/fdr.js              keyframe interpolation, track integration
  lib/pfd.js              primary flight display drawing
  lib/scene.js            three.js aircraft, terrain, cameras
  lib/dag.js              layered layout for causal chains
  lib/narrative.js        markdown narrative generator
```

## Running the pipeline

```bash
pip install -r blackbox/pipeline/requirements.txt
python3 blackbox/pipeline/fetch_reports.py af447 colgan3407
python3 blackbox/pipeline/extract_text.py
export ANTHROPIC_API_KEY=...          # or `ant auth login`
python3 blackbox/pipeline/extract_graph.py af447 --force
python3 blackbox/pipeline/validate.py
python3 blackbox/pipeline/build_graph.py
node blackbox/pipeline/build_embeddings.mjs
node blackbox/pipeline/test_search.mjs
```

`extract_graph.py` sends the entire report text, the taxonomy and the JSON schema
to Claude with structured outputs, so the returned record is schema-valid and
uses only taxonomy factor ids. It refuses to overwrite a record marked
`reviewed: true` unless `--force` is passed.

## How search works

1. **Concepts.** Phrases in the query are matched (longest first) against factor
   labels and synonyms in the taxonomy.
2. **Paths.** When concepts are joined by connectors ("led to", "then", "->",
   "misdiagnosed as"), consecutive concepts become an ordered path that is checked
   against each accident's `chain` by BFS. Full ordered paths score highest, then
   partial hops, then concept presence.
3. **Text.** Remaining words score with BM25 over summary, cause, evidence,
   events and recommendations.
4. **Semantic (optional).** all-MiniLM-L6-v2 runs in the browser via
   `@huggingface/transformers` and adds cosine similarity to precomputed vectors.
5. **Filters.** `agency:NTSB` (lead), `with:BEA` (any role), `phase:approach`,
   `year:1990-2009`, `type:737`, `operator:air france`, `country:canada`,
   `category:LOC-I`, `fatal:none` / `fatal:>100`.

## Data provenance and caveats

- The seed corpus was produced by Claude from its knowledge of the public final
  reports, following `SPEC.md`, and then validated. It was not produced by running
  `extract_graph.py` over every PDF (the pipeline was exercised on the fetch and
  text-extraction stages against NTSB and BEA reports; the extraction stage needs
  an API key). Each record carries `extraction.confidence` and `extraction.notes`.
- FDR files are **reconstructed keyframes** digitised from published report
  figures and narrative, not raw recorder data.
- CVR lines are restricted to what the public reports print.
- Recommendation ids and statuses are included only when known; otherwise null
  or `unknown`.

Verify against the report before citing anything.
