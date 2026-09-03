#!/usr/bin/env python3
"""Export every replay as a FlightGear package.

Usage: python3 blackbox/pipeline/flightgear/export_flightgear.py [id ...]
Writes public/blackbox/flightgear/<id>/
  track.csv              positions and attitude at 10 Hz in FlightGear's generic protocol
  blackbox-protocol.xml  the generic protocol definition (also copied once to the folder root)
  run.sh / run.bat       fgfs command lines with aircraft, airport, date/time, weather
  README.txt             what the files are and how the geography was anchored
FlightGear plays the track with --fdm=null --generic=file,in,10,track.csv,blackbox-protocol,
so the aircraft flies the recorded trajectory over FlightGear's real terrain and airports.
Geography: the keyframes carry no coordinates, so the integrated ground track is anchored
with its final point on the record's crash-site coordinates; earlier positions are offset
north/east from there (flat-earth, accurate to well under a percent over these distances).
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent
REPORTS = ROOT / "data" / "reports"
FDR = ROOT / "data" / "fdr"
OUT = REPO / "public" / "blackbox" / "flightgear"
FT_PER_DEG_LAT = 364000.0

PROTOCOL = """<?xml version="1.0"?>
<!-- Blackbox replay: FlightGear generic protocol. Feed with
     --fdm=null --generic=file,in,10,track.csv,blackbox-protocol -->
<PropertyList>
 <generic>
  <input>
   <line_separator>newline</line_separator>
   <var_separator>,</var_separator>
   <chunk><name>t</name><type>float</type><node>/blackbox/t-sec</node></chunk>
   <chunk><name>latitude</name><type>double</type><node>/position/latitude-deg</node></chunk>
   <chunk><name>longitude</name><type>double</type><node>/position/longitude-deg</node></chunk>
   <chunk><name>altitude</name><type>float</type><node>/position/altitude-ft</node></chunk>
   <chunk><name>heading</name><type>float</type><node>/orientation/heading-deg</node></chunk>
   <chunk><name>pitch</name><type>float</type><node>/orientation/pitch-deg</node></chunk>
   <chunk><name>roll</name><type>float</type><node>/orientation/roll-deg</node></chunk>
   <chunk><name>airspeed</name><type>float</type><node>/velocities/airspeed-kt</node></chunk>
   <chunk><name>vertical-speed</name><type>float</type><node>/velocities/vertical-speed-fps</node></chunk>
   <chunk><name>gear</name><type>float</type><node>/gear/gear[0]/position-norm</node></chunk>
   <chunk><name>flaps</name><type>float</type><node>/surface-positions/flap-pos-norm</node></chunk>
   <chunk><name>elevator</name><type>float</type><node>/surface-positions/elevator-pos-norm</node></chunk>
   <chunk><name>aileron</name><type>float</type><node>/surface-positions/left-aileron-pos-norm</node></chunk>
   <chunk><name>throttle</name><type>float</type><node>/controls/engines/engine[0]/throttle</node></chunk>
   <chunk><name>n1</name><type>float</type><node>/engines/engine[0]/n1</node></chunk>
   <chunk><name>stall</name><type>int</type><node>/blackbox/stall-warning</node></chunk>
  </input>
 </generic>
</PropertyList>
"""

FG_AIRCRAFT = [
    (r"a318|a319|a320|a321", "A320-family"), (r"a330", "A330-200"), (r"a340", "A340-300"), (r"a350", "A350-900"), (r"a380", "A380"),
    (r"737-?[89]|737 max|737-?(6|7)", "737-800"), (r"737", "737-300"), (r"747", "747-400"), (r"757", "757-200"), (r"767", "767-300"),
    (r"777", "777-200ER"), (r"787", "787-8"), (r"707", "707"), (r"727", "727-230"), (r"md-?11", "MD-11"), (r"md-?8|dc-?9", "MD-80"), (r"dc-?10", "DC-10-30"),
    (r"dc-?8", "DC-8"), (r"dc-?3", "DC-3"), (r"crj", "CRJ700-family"), (r"erj|embraer 1[79]|e-?1[79]", "E-jet-family"), (r"atr", "ATR-72-500"), (r"dash 8|dhc-?8|q400", "Q400"),
    (r"dhc-?6|twin otter", "dhc6"), (r"saab", "saab-340"), (r"beech|king air|1900", "b1900d"), (r"cessna|c172|c208|caravan", "c172p"), (r"concorde", "Concorde"),
    (r"l-?1011|tristar", "L-1011-500"), (r"tu-?154", "tu154b"), (r"tu-?134", "Tu-134"), (r"il-?76", "IL-76"), (r"an-?2\b", "an2"), (r"an-?24|an-?26", "an24"),
    (r"fokker 100|f100|f28", "fokker100"), (r"fokker 50|f50", "fokker50"), (r"bae 146|avro rj", "bae146"), (r"learjet", "Lear60"), (r"gulfstream", "G550"),
    (r"helicopter|bell|sikorsky|as350|eurocopter|robinson|mi-?8|lynx", "ec130"), (r"balloon|airship", "ufo"),
]


def fg_aircraft(rec):
    import re
    t = f"{rec.get('aircraft', {}).get('type', '')} {rec.get('aircraft', {}).get('manufacturer', '')}".lower()
    for pat, name in FG_AIRCRAFT:
        if re.search(pat, t):
            return name
    return "777-200ER"


def sample(param, t):
    keys = param.get("keys") or []
    if not keys:
        return None
    if t <= keys[0][0]:
        return keys[0][1]
    for i in range(len(keys) - 1):
        t0, v0 = keys[i]
        t1, v1 = keys[i + 1]
        if t0 <= t <= t1:
            if param.get("interp") == "step" or not isinstance(v0, (int, float)) or not isinstance(v1, (int, float)):
                return v0
            f = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return v0 + (v1 - v0) * f
    return keys[-1][1]


def integrate(fdr, dt=0.1):
    """Ground track in feet from groundspeed and heading, north = +y here."""
    p = fdr["params"]
    gs = p.get("gs_kt") or p.get("ias_kt")
    pts = []
    x = y = 0.0
    t = fdr["t_start"]
    while t <= fdr["t_end"] + 1e-9:
        v = (sample(gs, t) or 0) * 1.68781
        h = math.radians(sample(p["hdg_deg"], t) or 0)
        x += v * math.sin(h) * dt
        y += v * math.cos(h) * dt
        pts.append((round(t, 2), x, y))
        t += dt
    return pts


def metar(rec, fdr):
    ids = " ".join(f["id"] for f in rec.get("factors", [])) + " " + (rec.get("summary") or "").lower()
    wx = "9999 FEW040"
    if "thunderstorm" in ids or "convective" in ids or "microburst" in ids or "windshear" in ids:
        wx = "3000 +TSRA BKN015CB OVC030"
    elif "rain" in ids or "precipitation" in ids:
        wx = "5000 RA BKN012 OVC025"
    elif "icing" in ids or "ice_crystal" in ids or "snow" in ids:
        wx = "4000 -SN BKN010 OVC020"
    if "fog" in ids or "low_visibility" in ids:
        wx = "0400 FG VV002"
    return f"XXXX 000000Z 00000KT {wx} 15/10 Q1013"


def export(rec, fdr):
    loc = rec.get("location") or {}
    lat0, lon0 = loc.get("lat"), loc.get("lon")
    anchored = isinstance(lat0, (int, float)) and isinstance(lon0, (int, float))
    if not anchored:
        lat0, lon0 = 0.0, 0.0
    pts = integrate(fdr)
    ex, ey = pts[-1][1], pts[-1][2]
    p = fdr["params"]
    rows = []
    for t, x, y in pts:
        dlat = (y - ey) / FT_PER_DEG_LAT
        dlon = (x - ex) / (FT_PER_DEG_LAT * max(0.2, math.cos(math.radians(lat0))))
        alt = sample(p["alt_ft"], t) or 0
        vs = (sample(p.get("vs_fpm", {"keys": []}), t) or 0) / 60.0
        thr = sample(p.get("thrust_lever", {"keys": []}), t)
        thr = thr if isinstance(thr, (int, float)) else 0.6
        flaps = sample(p.get("flaps", {"keys": []}), t) or 0
        rows.append(",".join([
            f"{t:.2f}", f"{lat0 + dlat:.6f}", f"{lon0 + dlon:.6f}", f"{alt:.1f}", f"{(sample(p['hdg_deg'], t) or 0) % 360:.2f}",
            f"{sample(p['pitch_deg'], t) or 0:.2f}", f"{sample(p['roll_deg'], t) or 0:.2f}", f"{sample(p['ias_kt'], t) or 0:.1f}", f"{vs:.2f}",
            f"{1 if sample(p.get('gear', {'keys': []}), t) == 1 else 0}", f"{min(1.0, flaps / 30.0):.2f}",
            f"{-(sample(p.get('stick_pitch', {'keys': []}), t) or 0):.2f}", f"{sample(p.get('stick_roll', {'keys': []}), t) or 0:.2f}",
            f"{max(0.0, min(1.0, float(thr))):.2f}", f"{sample(p.get('n1_pct', {'keys': []}), t) or 0:.1f}", f"{1 if sample(p.get('stall_warn', {'keys': []}), t) else 0}",
        ]))
    out = OUT / rec["id"]
    out.mkdir(parents=True, exist_ok=True)
    (out / "track.csv").write_text("\n".join(rows) + "\n")
    (out / "blackbox-protocol.xml").write_text(PROTOCOL)
    aircraft = fg_aircraft(rec)
    t0 = rec.get("t0") or f"{rec['date']}T12:00:00Z"
    date = t0[:10].replace("-", ":")
    hhmm = t0[11:19] if len(t0) >= 19 else "12:00:00"
    start = f"{date}:{hhmm}"
    airport = (rec.get("route") or {}).get("to") or (rec.get("route") or {}).get("from") or ""
    common = [f"--aircraft={aircraft}", "--fdm=null", "--generic=file,in,10,track.csv,blackbox-protocol", f"--start-date-gmt={start}", f"--metar='{metar(rec, fdr)}'", "--disable-real-weather-fetch", "--httpd=8080", "--prop:/sim/current-view/view-number=1"]
    if anchored:
        common.append(f"--lat={lat0:.5f}"); common.append(f"--lon={lon0:.5f}")
    elif airport:
        common.append(f"--airport={airport}")
    cmd = "fgfs " + " ".join(common)
    (out / "run.sh").write_text("#!/bin/sh\n# Blackbox replay in FlightGear. Copy this folder into FlightGear's working directory\n# (or run from here with FG_ROOT set) and execute.\ncd \"$(dirname \"$0\")\"\n" + cmd + "\n")
    (out / "run.bat").write_text("@echo off\r\ncd /d %~dp0\r\n" + cmd.replace("--metar='", '--metar="').replace("' --disable", '" --disable') + "\r\n")
    (out / "README.txt").write_text(
        f"{rec['title']} · {rec['date']} · {rec.get('aircraft', {}).get('type', '')}\n\n"
        f"FlightGear replay package generated by Blackbox (fidelity: {fdr.get('fidelity')}, confidence: {fdr.get('confidence', 'medium')}).\n"
        f"Source: {fdr.get('source', '')}\n\n"
        "Files:\n  track.csv               positions and attitude at 10 Hz (generic protocol)\n  blackbox-protocol.xml   protocol definition for fgfs --generic\n  run.sh / run.bat        the fgfs command line\n\n"
        "How to run:\n  1. Install FlightGear (https://www.flightgear.org/) 2020.3 or newer.\n"
        "  2. Copy blackbox-protocol.xml into $FG_ROOT/Protocol/ (FlightGear looks for protocol files there).\n"
        "  3. Run run.sh (Linux/macOS) or run.bat (Windows) from this folder, or paste its fgfs line into the launcher's additional settings.\n"
        "  4. FlightGear opens at the crash-site coordinates on the recorded date and time, with weather set from the record, and the\n"
        "     aircraft flies the recorded trajectory over FlightGear's real terrain. Press V to change the view; --httpd=8080 lets\n"
        "     the Blackbox web replay drive FlightGear live from the browser instead of this file.\n\n"
        f"Geography: {'the final point of the track is anchored on the crash-site coordinates ' + str(lat0) + ', ' + str(lon0) + '; earlier positions are offset from there.' if anchored else 'no crash-site coordinates are known for this record, so the track starts at 0,0; add --lat/--lon or --airport to place it.'}\n"
        "The aircraft type is FlightGear's nearest available model; install it from the launcher's aircraft catalogue if it is missing.\n"
        "This is a reconstruction from the published report, not recorder data, and must not be cited as evidence.\n"
    )
    return {"id": rec["id"], "aircraft": aircraft, "anchored": anchored, "rows": len(rows)}


def main():
    ids = sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "blackbox-protocol.xml").write_text(PROTOCOL)
    index = []
    for p in sorted(REPORTS.glob("*.json")):
        rec = json.loads(p.read_text())
        if not rec.get("fdr") or (ids and rec["id"] not in ids):
            continue
        fp = FDR / f"{rec['fdr']}.json"
        if not fp.exists():
            continue
        index.append(export(rec, json.loads(fp.read_text())))
    (OUT / "index.json").write_text(json.dumps(index))
    print(f"exported {len(index)} FlightGear packages, {sum(1 for i in index if i['anchored'])} anchored on crash-site coordinates")


if __name__ == "__main__":
    main()
