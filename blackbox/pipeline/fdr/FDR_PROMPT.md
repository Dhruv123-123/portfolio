# FDR reconstruction worker

You reconstruct a flight-data-recorder keyframe file for accidents from the text of the
official investigation report. You are given a batch file (JSON) with items:

```
{ "id": "...", "record_path": "blackbox/data/reports/<id>.json", "text_path": "blackbox/cache/text/<id>.txt" | null,
  "out_path": "blackbox/data/fdr/<id>.json" }
```

For EACH item, do the following, then write the batch's output file listed as `out_log`
(one JSON line per item: `{"id", "status": "written"|"skipped", "note"}`).

## 1. Read the record first
`cat <record_path>`. Note: `t0` (ISO time of the defining moment, t=0), `events` (each has
`t` seconds relative to t0, `clock`, `phase`, `text`, and sometimes `state` with alt/ias/hdg/
pitch/vs/roll), `cvr`, `phase`, `aircraft.type`, `location`, `summary`. The events already
give you a coarse skeleton of altitude and speed against time. t=0 is defined by the record;
keep the same clock.

## 2. Mine the report text for numbers (when text_path is not null)
The text is long. Do NOT cat it whole. Use grep with context to find the flight data
recorder and history-of-flight passages, e.g.:

```
grep -n -i -E "flight data recorder|FDR|radio altitude|knots|ft/min|feet per minute|pitch attitude|angle of attack|heading|N1|thrust lever|stick|autopilot|stall warning|GPWS|EGPWS|TCAS|flaps|landing gear|impact|:[0-5][0-9]:[0-5][0-9]" <text_path> | head -150
```

then `sed -n 'A,Bp'` around the densest clusters (history of flight, section 1.1; flight
recorders, section 1.11; analysis). Extract every (time, parameter, value) you can find:
altitude (pressure or radio), airspeed / CAS / IAS / groundspeed, heading, pitch, roll/bank,
vertical speed, angle of attack, N1 or EPR, thrust lever / throttle, flaps, gear, autopilot,
stall warning, GPWS. Convert clock times to seconds relative to the record's t0. If the
report gives a table (some do), use every row.

## 3. Write the keyframe file
Follow `blackbox/SPEC.md` "FDR keyframe schema" exactly. Required params: `alt_ft`, `ias_kt`,
`pitch_deg`, `roll_deg`, `hdg_deg`, `vs_fpm`; add any others you have evidence for
(`aoa_deg`, `n1_pct`, `thrust_lever`, `stick_pitch`, `stick_roll`, `ths_deg`, `flaps`, `gear`,
`ap`, `athr`, `stall_warn`, `ra_ft`, `gs_kt`, `mach`, `ias_valid`, `law`). Rules:

- `t_start` is 30 to 90 s before the first interesting moment; `t_end` is impact, ditching,
  or where the aircraft stopped. Cover the whole dynamic part with keyframes every 5 to 15 s;
  quiet cruise can be sparser. Keys are `[t, value]`, strictly increasing t, numbers only
  (except `law` and `thrust_lever` labels, which are allowed as strings per the spec).
- Where the report gives no number, interpolate physically plausible values that are
  consistent with the narrative: vertical speed matches the slope of altitude; pitch is
  roughly flight-path angle plus angle of attack; heading changes are smooth; airspeed
  decays in a climb and grows in a dive; N1 follows thrust. Never contradict a number the
  report states.
- `fidelity` MUST be `"narrative"` when built from the report text, or `"schematic"` if you
  only had the record's events. `confidence` is `"low"` unless the report gave you a table
  or many explicit values (`"medium"`). `source` names the report sections you used.
- `markers`: 4 to 12 `{t, label}` at the moments that matter (warning, disconnect, decision,
  impact), phrased from the report.
- `aircraft_model`: airliner_twin (A320/A330/737/767/777/787), airliner_quad (747/A340/A380/
  707/DC-8/Il-62), narrowbody_tri (727/DC-10/L-1011/MD-11/Tu-154), regional_jet (CRJ/ERJ/
  E-jets/BAe 146/F28/F100/DC-9/MD-80), regional_turboprop (ATR/Dash 8/Saab/Fokker 50/
  Metro/King Air/Q400/Il-18/An-24/HS 748). Small piston aircraft: regional_turboprop.
- `terrain`: ocean, mountains, city, runway (takeoff/landing accidents) or flat.
- `units`: note flaps convention (`detent` or `deg`) and N1 vs EPR.

Write the file with a real JSON writer (python3 -c or a heredoc you have checked), then run:

```
python3 blackbox/pipeline/fdr/check_fdr.py <out_path>
```

and fix every problem it prints. Then set `"fdr": "<id>"` in the record JSON with python
(load, set, dump with indent=2, ensure_ascii=False) so the app links them.

## 4. Skip honestly
If the text and the record together give fewer than 4 usable altitude-or-speed points over
time, do not invent a flight: write nothing, and log `"status": "skipped"` with the reason.
A schematic file (fidelity "schematic") is acceptable when the record's events carry at
least 4 states but the text has no FDR detail.

## Ground rules
- Never fabricate times or values that contradict the report. When you interpolate, the
  file's `source` must say "interpolated between stated values" so readers know.
- No model names anywhere in the file. Keep `extraction`-style fields out; the FDR schema
  has none.
- Work through the whole batch; do not stop after one item. Use bash timeouts up to
  600000 ms for long greps. Do not run git.
