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
  Blackbox.vue            shell (top bar, data loading, boot, palette, deep links, CRT)
  theme.css               design system: tokens and the shared component classes every panel uses
  RecordActions.vue       the one action row a record gets everywhere (Timeline, Replay, Story, FlightGear, Wikipedia)
  GraphExplorer.vue       force graph + query engine UI + counterfactuals
  Atlas.vue               globe of every positioned record, century time-scrub
  FdrReplay.vue           three.js replay, PFD/radar, HUD, audio, CVR
  TimelineBuilder.vue     event chain, compare, narrative
  StoryMode.vue           documentary-style walkthrough of one record
  CommandPalette.vue      Ctrl+K jump to accidents, factors, actions
  AboutPanel.vue          method and corpus statistics
  lib/search.js           concept/path/BM25/semantic query engine
  lib/forceGraph.js       canvas force layout with flowing causation particles
  lib/counterfactual.js   single-point factors and corpus-wide chain cuts
  lib/globe.js            three.js globe, point shader, picking, arcs
  lib/geo.js              country centroids, Wikipedia 'read more' links
  lib/fdr.js              keyframe interpolation, track integration
  lib/pfd.js              primary flight display drawing
  lib/hud.js              head-up display and radar scope drawing
  lib/audio.js            synthesized cockpit soundscape (Web Audio + speech)
  lib/scene.js            three.js aircraft, terrain, weather, day/night, cameras
  lib/dag.js              layered layout for causal chains
  lib/narrative.js        markdown narrative generator
```

## Immersive layer

- **Atlas**: `enrich_geo.py` copies Wikidata coordinates (P625) and article links into
  the catalog and records; `build_graph.py` writes them as `la`/`lo`/`w` on index rows.
  Records without coordinates fall back to a country centroid in `lib/geo.js` (drawn faint).
- **Story mode**, **cockpit HUD**, **cinematic cameras**, **synthesized sound**, **radar
  scope**, **counterfactual factor cuts**, **command palette** and **deep links**
  (`/blackbox#tab=replay&id=af447&t=120`) are all client-side; no new data is needed.

### Real recordings

`pipeline/catalog/fetch_audio.py` searches Wikimedia Commons for audio files that
mention each record (Wikipedia title and record title), keeps only public-domain or
Creative Commons files, and writes them to the record as `audio: [{title, url, page,
license, kind, description, duration}]` with `kind` = `atc` | `cvr` | `audio`. The
replay plays a recording in sync with its clock (offset adjustable, "align here"
marks the current moment); the timeline, graph and story list them with credits.

## Replays at scale, cockpit tracks and FlightGear

```bash
python3 blackbox/pipeline/fdr/check_fdr.py blackbox/data/fdr/<id>.json   # keyframe sanity
python3 blackbox/pipeline/fdr/audit_fdr.py --apply                       # drop files without evidence
python3 blackbox/pipeline/audio/render_cockpit_audio.py                  # Piper voices + numpy warnings -> public/blackbox/cockpit
python3 blackbox/pipeline/flightgear/export_flightgear.py                # FlightGear packages -> public/blackbox/flightgear
```

- `pipeline/fdr/FDR_PROMPT.md` drives Haiku workers that mine each cached report text for
  timed altitude, speed, attitude and configuration values and write keyframe files
  (fidelity `narrative`), or build a `schematic` profile from the record's timed states.
- `pipeline/audio/render_cockpit_audio.py` needs `piper` voices in `blackbox/cache/voices`
  (see the script header) and writes a cue sheet plus one MP3 per cue.
- `pipeline/flightgear/export_flightgear.py` writes, per replay, `track.csv` in the generic
  protocol, `blackbox-protocol.xml`, `run.sh` / `run.bat` and a README. The app can also
  build the same package in the browser and drive a running FlightGear live
  (`--httpd=8080 --fdm=null`) through `ws://localhost:8080/PropertyListener`.

## Catalog tier (thousands of accidents)

On top of the hand-reviewed records, `blackbox/data/catalog/` holds summary-level
records for thousands of accidents, served to the app as
`public/blackbox/catalog/index.json` plus per-year shards and loaded on demand
from the Graph tab.

| Tier | Source | Volume | Extraction |
|---|---|---|---|
| `ntsb` | NTSB public aviation database (`avall.mdb`, 2008 onward) | fatal + air-carrier events, ~6,800 | keyword rules over the Board's coded findings, no LLM |
| `wikidata` | Wikidata accident items + English Wikipedia text | ~3,100 worldwide | Haiku subagents read the trimmed article per batch |
| deepened | official report PDFs linked from Wikipedia (542 candidates, ~300 reachable) | ~290 records in `data/reports/wd_*.json` | Haiku subagents read the synopsis, findings, probable cause, recommendations and history of flight; a cross-check rejects records that do not add report-derived events |

```bash
# NTSB tier (needs mdbtools: apt-get install mdbtools)
curl -L -o blackbox/cache/ntsb/avall.zip 'https://data.ntsb.gov/avdata/FileDirectory/DownloadFile?fileID=C%3A%5Cavdata%5Cavall.zip'
cd blackbox/cache/ntsb && unzip avall.zip && for t in events aircraft narratives Findings Events_Sequence; do mdb-export avall.mdb $t > $t.csv; done; cd -
python3 blackbox/pipeline/catalog/ntsb_ingest.py

# Wikidata / Wikipedia tier
python3 blackbox/pipeline/catalog/wikidata_fetch.py       # index (SPARQL, paged by years)
python3 blackbox/pipeline/catalog/wikipedia_fetch.py      # article text + links (raw wikitext, polite)
python3 blackbox/pipeline/catalog/make_batches.py --size 20   # interest-ranked batches for the workers
#   -> run a Haiku worker per batch with catalog/AGENT_PROMPT.md, then:
python3 blackbox/pipeline/catalog/merge_catalog.py
# Deep-read tier (official reports)
python3 blackbox/pipeline/catalog/make_deepen_batches.py --limit 2000 --prefix cand   # rows with agency report links
python3 blackbox/pipeline/catalog/prefetch_reports.py --limit 600 --shard 0 --nshards 6   # download + OCR (tesseract) in parallel shards
python3 blackbox/pipeline/catalog/make_deepen_batches.py --only-fetched --prefix dp --size 4  # batches of items whose text is on disk
#   -> run a Haiku worker per batch with catalog/DEEPEN_PROMPT.md; it writes data/reports/wd_<qid>.json
python3 blackbox/pipeline/catalog/fix_records.py blackbox/data/reports/wd_*.json   # mechanical vocabulary/schema repairs
python3 blackbox/pipeline/validate.py                     # schema + taxonomy
python3 blackbox/pipeline/catalog/check_deep_reads.py     # rejects summary copies and wrong-report reads
python3 blackbox/pipeline/build_graph.py                  # curated bundle + catalog index/shards
```

Aviation Safety Network was considered as the index but it sits behind a bot
challenge and its robots.txt disallows AI crawlers, so it is not scraped; the
Wikidata rows carry ASN ids (property P1755) for cross-reference.

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
