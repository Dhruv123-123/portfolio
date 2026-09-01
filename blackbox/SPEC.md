# Blackbox data specification

Blackbox is an aviation accident knowledge graph, FDR replay and timeline tool.
Every accident is one JSON record in `blackbox/data/reports/<id>.json`. Optional
flight data recorder keyframes live in `blackbox/data/fdr/<id>.json`.

All factor ids MUST come from `blackbox/data/taxonomy.json`. All phases and actor
codes MUST come from the `phases` and `actors` lists in that file.

## Ground rules for authoring

1. Only state what the official final report (or its published English
   translation / summary) states. Do not invent times, values, quotes or
   recommendation numbers. When a value is unknown, omit the field or use null.
2. Times: `clock` is the local or UTC clock string exactly as the report uses it
   (say which in `time_reference`). `t` is seconds relative to `t0` (the
   reference instant, normally the initiating event). `t` may be negative.
3. CVR lines: quote only lines that appear in the public report transcript.
   Keep each quote short. Provide an English `translation` when the original is
   not English. If no transcript is public, leave `cvr` as an empty array.
4. Recommendations: use the real recommendation number when you are confident
   (for example `A-10-10`, `FRAN-2011-034`, `AO-2010-089-SR-041`); otherwise
   set `id` to null and describe the recommendation in `text`.
5. Confidence: set `extraction.confidence` to `high`, `medium` or `low` for the
   record as a whole and list anything uncertain in `extraction.notes`.
6. Keep numbers in aircraft `state` objects in these units: altitude feet,
   airspeed knots (indicated unless noted), vertical speed feet per minute,
   angles degrees, heading degrees magnetic, thrust percent N1 or EPR as noted.

## Record schema (`blackbox/data/reports/<id>.json`)

```jsonc
{
  "id": "af447",                       // lowercase, [a-z0-9_]
  "title": "Air France 447",
  "flight_number": "AF447",
  "date": "2009-06-01",                // ISO date of the accident (UTC)
  "time_reference": "UTC",             // what `clock` strings are in
  "t0": "2009-06-01T02:10:05Z",        // reference instant for `t` seconds
  "agency": "BEA",                     // lead investigating agency code
  "agencies": [                        // every agency with a formal role
    { "code": "BEA", "name": "Bureau d'Enquêtes et d'Analyses", "country": "France", "role": "lead",
      "report_id": "f-cp090601", "report_title": "Final Report ...", "report_date": "2012-07-05",
      "url": "https://bea.aero/..." },
    { "code": "NTSB", "name": "National Transportation Safety Board", "country": "USA", "role": "accredited_representative" }
  ],
  "aircraft": { "type": "Airbus A330-203", "family": "A330", "manufacturer": "Airbus", "registration": "F-GZCP", "msn": "660", "engines": "GE CF6-80E1A3" },
  "operator": "Air France",
  "route": { "from": "SBGL", "from_name": "Rio de Janeiro Galeão", "to": "LFPG", "to_name": "Paris Charles de Gaulle" },
  "location": { "name": "Atlantic Ocean, 570 nm NE of Natal", "country": "International waters", "lat": 3.06, "lon": -30.56 },
  "phase": "cruise",                   // from taxonomy.phases
  "occupants": 228, "fatalities": 228, "injuries_serious": 0,
  "damage": "destroyed",               // destroyed | substantial | minor | none
  "category": "LOC-I",                 // ICAO occurrence category: LOC-I, CFIT, RE, RI, SCF-PP, SCF-NP, F-NI, F-POST, MAC, FUEL, ICE, WSTRW, USOS, ARC, TURB, OTHR, UNK, SEC, MED, CABIN, GCOL, ADRM, RAMP, ATM, AMAN, LALT, EVAC
  "summary": "Two or three sentence neutral summary of what happened.",
  "probable_cause": "The probable cause / conclusion text, condensed faithfully.",
  "factors": [                         // every taxonomy factor that applied
    { "id": "pitot_blockage", "role": "initiating", "evidence": "One sentence citing what the report found." },
    { "id": "unreliable_airspeed", "role": "contributing", "evidence": "..." },
    { "id": "aerodynamic_stall", "role": "outcome", "evidence": "..." }
  ],                                   // role: initiating | contributing | latent | outcome
  "chain": [                           // directed causal edges between factor ids in this accident
    ["pitot_blockage", "unreliable_airspeed"],
    ["unreliable_airspeed", "autopilot_disconnect"]
  ],
  "events": [                          // the timeline; chronological
    { "t": 0, "clock": "02:10:05", "phase": "cruise", "actor": "SYS",
      "text": "Autopilot and autothrust disconnect; ECAM shows alternate law.",
      "state": { "alt": 35000, "ias": 274, "pitch": 2.5, "hdg": 30, "vs": 0 },
      "factors": ["pitot_blockage", "autopilot_disconnect"],
      "kind": "system" }               // kind: system | crew_action | crew_speech | atc | env | outcome | warning
  ],
  "cvr": [                             // optional; chronological
    { "t": 1, "clock": "02:10:06", "speaker": "PF", "text": "J'ai les commandes.", "translation": "I have the controls." }
  ],
  "recommendations": [
    { "id": "FRAN-2011-034", "to": "EASA", "text": "...", "status": "closed_acceptable",   // open | closed_acceptable | closed_unacceptable | superseded | unknown
      "outcome": "What changed as a result, if known.", "trigger_factors": ["pitot_blockage"] }
  ],
  "dissent": [                         // only when agencies formally disagreed; else []
    { "agency": "NTSB", "position": "What that agency said differently.", "topic": "probable cause" }
  ],
  "safety_changes": ["Concrete industry changes that followed, one per string."],
  "related": ["birgenair301", "northwest6231"],   // ids of accidents with a strong shared mechanism
  "fdr": "af447",                      // id of an FDR keyframe file, or null
  "sources": ["https://..."],
  "extraction": { "method": "llm", "model": "claude", "confidence": "high", "reviewed": true, "notes": [] }
}
```

## FDR keyframe schema (`blackbox/data/fdr/<id>.json`)

Reconstructed from the parameter plots and tables published in the final
report. Each parameter is a list of `[t, value]` keyframes, `t` in seconds from
the record's `t0`. The replay interpolates between keyframes (`linear`) or holds
the previous value (`step`).

```jsonc
{
  "id": "af447", "record": "af447",
  "source": "BEA final report, appendix 3 FDR plots; values digitised at key points",
  "fidelity": "reconstructed",         // reconstructed | tabulated
  "t_start": -30, "t_end": 263,
  "aircraft_model": "airliner_twin",   // airliner_twin | airliner_quad | regional_turboprop | regional_jet | narrowbody_tri
  "params": {
    "alt_ft":      { "interp": "linear", "keys": [[-30, 35000], [0, 35000], [40, 37500]] },
    "ias_kt":      { "interp": "linear", "keys": [[-30, 274]] },
    "pitch_deg":   { "interp": "linear", "keys": [[-30, 2.5]] },   // + nose up
    "roll_deg":    { "interp": "linear", "keys": [[-30, 0]] },     // + right wing down
    "hdg_deg":     { "interp": "linear", "keys": [[-30, 30]] },
    "vs_fpm":      { "interp": "linear", "keys": [[-30, 0]] },
    "aoa_deg":     { "interp": "linear", "keys": [[-30, 2.5]] },
    "n1_pct":      { "interp": "linear", "keys": [[-30, 100]] },   // average of engines unless split
    "thrust_lever":{ "interp": "step",   "keys": [[-30, 0.7]] },   // 0 idle .. 1 TOGA; or label strings
    "stick_pitch": { "interp": "linear", "keys": [[-30, 0]] },     // -1 full nose down .. +1 full nose up
    "stick_roll":  { "interp": "linear", "keys": [[-30, 0]] },     // -1 full left .. +1 full right
    "ths_deg":     { "interp": "linear", "keys": [[-30, -3]] },    // stabilizer trim, + nose up
    "flaps":       { "interp": "step",   "keys": [[-30, 0]] },     // detent number or degrees, note in `units`
    "gear":        { "interp": "step",   "keys": [[-30, 0]] },     // 0 up, 1 down
    "ap":          { "interp": "step",   "keys": [[-30, 1], [0, 0]] },
    "stall_warn":  { "interp": "step",   "keys": [[-30, 0], [46, 1]] },
    "ra_ft":       { "interp": "linear", "keys": [] },             // radio altitude when relevant
    "gs_kt":       { "interp": "linear", "keys": [] }
  },
  "units": { "flaps": "detent", "n1_pct": "% N1" },
  "markers": [ { "t": 0, "label": "AP disconnect" } ],
  "camera_hint": "chase",
  "terrain": "ocean"                    // ocean | flat | runway | mountains | city
}
```

Every FDR file must give at least `alt_ft`, `ias_kt`, `pitch_deg`, `roll_deg`,
`hdg_deg`, `vs_fpm`, and keyframes dense enough (roughly every 5 to 15 s during
the dynamic part) that the replay follows the shape of the published traces.
