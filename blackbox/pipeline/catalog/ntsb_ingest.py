#!/usr/bin/env python3
"""Build catalog records from the NTSB public aviation database (avall.mdb).

Usage:
  python3 blackbox/pipeline/catalog/ntsb_ingest.py [--all] [--min-year 2008]

Expects the CSV exports produced by mdb-export in blackbox/cache/ntsb/
(events, aircraft, narratives, Findings, Events_Sequence). No LLM is used: NTSB
findings and occurrence descriptions are mapped onto the Blackbox taxonomy with
keyword rules, and the causal chain is inferred from finding order (marked as
heuristic). By default only fatal accidents and air-carrier operations
(Part 121/129/135) are kept, which is what the web bundle can carry.
Writes blackbox/data/catalog/ntsb.jsonl.
"""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(sys.maxsize)
ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "ntsb"
OUT = ROOT / "data" / "catalog" / "ntsb.jsonl"
TAX = json.loads((ROOT / "data" / "taxonomy.json").read_text())

# Keyword rules: regex over the NTSB finding description -> taxonomy factor id.
FINDING_RULES = [
    (r"pitot", "pitot_blockage"), (r"static (port|system)", "static_port_blockage"), (r"airspeed indicat", "unreliable_airspeed"),
    (r"angle of attack|aoa", "aoa_sensor_failure"), (r"radio altimeter", "radio_altimeter_failure"),
    (r"autopilot|autoflight", "mode_confusion"), (r"autothrottle|autothrust", "autothrottle_mode_confusion"),
    (r"aerodynamic stall|stall/spin|stall warning|angle of attack.*exceed|inadvertent stall", "aerodynamic_stall"),
    (r"stall/spin", "loss_of_control_inflight"),
    (r"spatial disorientation", "spatial_disorientation"), (r"somatogravic", "somatogravic_illusion"),
    (r"visual illusion|black hole", "visual_illusion"), (r"incapacitat|impairment|medical|alcohol|drug", "pilot_incapacitation"),
    (r"fatigue-pilot|fatigue - pilot|fatigue, pilot|personnel issues-.*fatigue", "fatigue"),
    (r"training|qualification|lack of experience|experience/knowledge|knowledge of procedures", "inadequate_training"),
    (r"total experience|recent experience|inexperience", "pilot_experience"),
    (r"crm|crew resource|communication - flight crew|coordination", "crm_breakdown"),
    (r"monitoring|scanning|attention|awareness|situational", "inadequate_monitoring"),
    (r"risk assessment|preflight (inspection|planning)|use of policy/procedure|use of checklist|not followed|procedures/directives|regulation|limitation", "procedural_noncompliance"),
    (r"distraction|preoccupied|non-pertinent", "sterile_cockpit_violation"),
    (r"unstabilized|stabilized approach|approach path|descent rate|glidepath", "unstable_approach"),
    (r"go-around|go around|missed approach", "go_around_not_flown"),
    (r"landing distance|long landing|touchdown point", "landing_long"), (r"tailwind", "tailwind_landing"),
    (r"wet runway|contaminated|standing water|snow|ice.*runway|slush", "contaminated_runway"),
    (r"delayed action|delayed|reverse thrust|braking", "delayed_deceleration"),
    (r"runway excursion|overrun|veer", "runway_overrun"), (r"incursion", "runway_incursion"), (r"wrong runway|wrong surface|taxiway", "wrong_runway"),
    (r"atc|air traffic control|controller", "atc_communication_error"), (r"tcas|traffic alert", "tcas_ra_conflict"),
    (r"midair|mid-air", "midair_collision"), (r"ground collision|collision with (aircraft|vehicle)|collided", "ground_collision"),
    (r"signage|marking|lighting|airport", "airport_infrastructure"),
    (r"controlled flight into terrain|cfit|terrain", "cfit"), (r"loss of control|loss of aircraft control", "loss_of_control_inflight"),
    (r"gpws|terrain warning", "gpws_warning_response"), (r"navigation|off course|course deviation", "navigation_error"),
    (r"altimeter setting|barometric", "altimeter_setting_error"), (r"below minimum|minimum descent|decision height|minimums", "descent_below_minimums"),
    (r"fog|low visibility|imc|instrument meteorological|reduced visibility|cloud|ceiling", "low_visibility"),
    (r"dark night|night", "dark_night"), (r"thunderstorm|convective|turbulence|precipitation|heavy rain", "convective_weather"),
    (r"windshear|wind shear|microburst|gust", "windshear"), (r"icing|ice accumulation|structural icing|airframe ice", "airframe_icing"),
    (r"anti-ice|de-ice|deice|carburetor heat|carb heat", "deicing_inadequate"), (r"fuel icing|fuel.*ice", "fuel_system_icing"),
    (r"volcanic", "volcanic_ash"), (r"bird|wildlife|animal", "bird_strike"),
    (r"loss of engine power|engine failure|powerplant|power loss|engine.*failure|failure.*engine|cylinder|piston|crankshaft|connecting rod|valve|magneto|ignition|carburetor|turbocharger|propeller|reduction gear|compressor|turbine", "engine_failure"),
    (r"total loss of power|all engines|both engines|dual engine", "dual_engine_failure"), (r"uncontained", "uncontained_engine_failure"),
    (r"wrong engine", "wrong_engine_shutdown"), (r"wrong (lever|control|switch)|inadvertent (activation|selection)|control confusion|mixture control|fuel selector", "control_misidentification"),
    (r"fuel exhaustion", "fuel_exhaustion"), (r"fuel starvation|fuel selector|fuel supply|fuel contamination|fuel system", "fuel_starvation"),
    (r"fuel leak", "fuel_leak"), (r"fuel quantity|fuel planning|fuel calculation|fuel gauge", "fuel_quantity_error"),
    (r"fuel tank explosion|explosion", "fuel_tank_explosion"), (r"wiring|electrical (system|fault|short|arcing)|arcing", "wiring_failure"),
    (r"flammab", "flammable_material"), (r"fire|smoke", "inflight_fire"), (r"cargo", "cargo_fire"),
    (r"decompression|depressuriz", "explosive_decompression"), (r"pressuriz", "cabin_pressurization_failure"), (r"hypoxia|oxygen", "hypoxia"),
    (r"cargo door|door", "cargo_door_failure"), (r"structural failure|in-flight breakup|breakup|wing.*fail|spar|structure", "structural_failure"),
    (r"fatigue/wear|fatigue crack|fatigue fracture|metal fatigue|corrosion|crack", "metal_fatigue"), (r"bulkhead", "pressure_bulkhead_failure"),
    (r"hydraulic", "hydraulic_failure"), (r"flight control|elevator|aileron|rudder|control cable|control system|trim system|flap system|actuator|servo", "flight_control_failure"),
    (r"rudder", "rudder_hardover"), (r"stabilizer|trim tab|jackscrew", "stabilizer_trim_failure"), (r"thrust reverser", "thrust_reverser_inflight"),
    (r"windshield|windscreen", "windshield_failure"), (r"landing gear|gear collapse|gear extension|gear retraction|brake", "landing_gear_failure"),
    (r"maintenance|installation|improper (repair|assembly|installation)|inspection|overhaul|service bulletin|airworthiness directive|not installed|incorrect service", "maintenance_error"),
    (r"lubricat|wear", "inadequate_lubrication"), (r"inspection", "inadequate_inspection"),
    (r"weight and balance|center of gravity|cg |overweight|weight/balance|load", "weight_and_balance_error"),
    (r"performance calculation|takeoff performance|density altitude|performance data|climb capability", "takeoff_performance_error"),
    (r"flap setting|configuration|takeoff configuration", "takeoff_configuration_error"), (r"tail strike|tailstrike", "tail_strike"),
    (r"hard landing|bounced|porpoise", "hard_landing"), (r"ditching|water", "ditching"), (r"post-crash|postcrash|post-impact", "post_impact_fire"),
    (r"evacuation|egress|survival|restraint|seat", "evacuation_deficiency"),
    (r"design|manufacturer|certification", "design_deficiency"), (r"warning|alert|annunciat", "warning_system_deficiency"),
    (r"faa|oversight|regulator|surveillance", "regulatory_oversight"), (r"operator|company|management|scheduling|pressure|safety management|organizational", "operator_safety_culture"),
    (r"documentation|manual|guidance|information", "manufacturer_communication"), (r"deferred|previously (reported|identified)|history of|unresolved|recurring", "known_defect_unresolved"),
    (r"intentional|suicide|deliberate|homicide", "deliberate_act"), (r"excessive speed|high speed|airspeed.*exceed|overspeed", "excessive_speed"),
    (r"low airspeed|airspeed.*not (attained|maintained)|below.*airspeed|slow", "low_energy_state"),
    (r"pilot induced|over-?control|excessive (control|input)|abrupt", "inappropriate_control_input"), (r"workload|task saturation", "high_workload"),
    (r"emergency landing|forced landing|off-airport|off airport", "emergency_landing"),
]
FINDING_RULES = [(re.compile(p, re.I), fid) for p, fid in FINDING_RULES]
KNOWN = {f["id"] for f in TAX["factors"]}
assert all(fid in KNOWN for _, fid in FINDING_RULES), [fid for _, fid in FINDING_RULES if fid not in KNOWN]

OCC_CATEGORY = [
    (r"midair", "MAC"), (r"loss of control in flight|stall|spin|uncontrolled descent|abrupt maneuver", "LOC-I"), (r"loss of control on ground", "LOC-G"),
    (r"controlled flight into terr|cfit", "CFIT"), (r"runway excursion|overrun|veer", "RE"), (r"runway incursion", "RI"),
    (r"fuel exhaustion|fuel starvation|fuel related", "FUEL"), (r"loss of engine power|powerplant|engine", "SCF-PP"), (r"birdstrike|bird|wildlife|animal", "BIRD"),
    (r"fire/smoke \(non-impact\)|fire/smoke|inflight fire", "F-NI"), (r"fire/smoke \(post-impact\)|post-impact fire", "F-POST"), (r"windshear|thunderstorm", "WSTRW"),
    (r"turbulence", "TURB"), (r"abnormal runway contact|hard landing|nose over|nose down|tailstrike|dragged wing", "ARC"), (r"undershoot|overshoot", "USOS"),
    (r"collision during takeoff/land|collision with terr/obj|collision with obj|ground collision|collision with (vehicle|aircraft|person)|struck", "GCOL"),
    (r"low altitude|maneuvering", "LALT"), (r"icing", "ICE"), (r"sys/comp malf/fail \(non-power\)|non-power", "SCF-NP"), (r"cabin|evacuation", "CABIN"),
    (r"medical|incapacitation", "MED"), (r"aerodrome|airport", "ADRM"), (r"external load", "EXTL"), (r"glider tow", "GTOW"), (r"navigation", "NAV"),
    (r"ditching|water", "OTHR"), (r"unknown|undetermined|missing", "UNK"), (r"security|intentional", "SEC"),
]
OCC_CATEGORY = [(re.compile(p, re.I), c) for p, c in OCC_CATEGORY]
OUTCOME_FACTOR = {"MAC": "midair_collision", "LOC-I": "loss_of_control_inflight", "CFIT": "cfit", "RE": "runway_overrun", "RI": "runway_incursion", "FUEL": "fuel_exhaustion", "SCF-PP": "engine_failure", "BIRD": "bird_strike", "F-NI": "inflight_fire", "F-POST": "post_impact_fire", "WSTRW": "windshear", "TURB": "convective_weather", "ARC": "hard_landing", "USOS": "landing_long", "GCOL": "ground_collision", "ICE": "airframe_icing", "SCF-NP": "flight_control_failure", "CABIN": "evacuation_deficiency", "MED": "pilot_incapacitation", "ADRM": "airport_infrastructure", "SEC": "deliberate_act"}

PHASE_MAP = [
    (r"standing|pushback|taxi", "taxi"), (r"takeoff|rejected takeoff", "takeoff"), (r"initial climb", "initial_climb"), (r"climb", "climb"), (r"cruise|enroute|en route", "cruise"),
    (r"descent", "descent"), (r"approach|final|maneuvering", "approach"), (r"landing|flare|roll", "landing"), (r"go-around|go around|missed", "go_around"), (r"hover|hovering", "cruise"),
]
PHASE_MAP = [(re.compile(p, re.I), ph) for p, ph in PHASE_MAP]

MAKE_NORMALIZE = {"CESSNA": "Cessna", "PIPER": "Piper", "BEECH": "Beechcraft", "BOEING": "Boeing", "AIRBUS": "Airbus", "MOONEY": "Mooney", "CIRRUS": "Cirrus", "BELL": "Bell", "ROBINSON": "Robinson", "EMBRAER": "Embraer", "BOMBARDIER": "Bombardier", "DE HAVILLAND": "de Havilland"}


def phase_of(text):
    for rx, ph in PHASE_MAP:
        if rx.search(text or ""):
            return ph
    return "unknown"


def first_sentences(text, n=3, cap=700):
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return ""
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    out = " ".join(sents[:n])
    return out[:cap]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="keep every event, not just fatal and air-carrier ones")
    ap.add_argument("--min-year", type=int, default=2008)
    args = ap.parse_args()

    aircraft = defaultdict(list)
    for r in csv.DictReader((CACHE / "aircraft.csv").open()):
        aircraft[r["ev_id"]].append(r)
    narratives = {}
    for r in csv.DictReader((CACHE / "narratives.csv").open()):
        if r.get("narr_accf") or r.get("narr_cause"):
            narratives.setdefault(r["ev_id"], r)
    findings = defaultdict(list)
    for r in csv.DictReader((CACHE / "Findings.csv").open()):
        findings[r["ev_id"]].append(r)
    sequence = defaultdict(list)
    for r in csv.DictReader((CACHE / "Events_Sequence.csv").open()):
        sequence[r["ev_id"]].append(r)

    kept = 0
    seen = 0
    with OUT.open("w") as out:
        for ev in csv.DictReader((CACHE / "events.csv").open()):
            seen += 1
            try:
                year = int(ev.get("ev_year") or 0)
            except ValueError:
                continue
            if year < args.min_year:
                continue
            acs = aircraft.get(ev["ev_id"], [])
            ac = acs[0] if acs else {}
            fatal = ev.get("ev_highest_injury") == "FATL"
            carrier = any((a.get("far_part") or "") in ("121", "129", "135") for a in acs)
            if not args.all and not (fatal or carrier):
                continue
            narr = narratives.get(ev["ev_id"], {})
            fins = sorted(findings.get(ev["ev_id"], []), key=lambda f: int(f.get("finding_no") or 0))
            seq = sorted(sequence.get(ev["ev_id"], []), key=lambda s: (int(s.get("Occurrence_No") or 0), int(s.get("eventsoe_no") or 0)))
            if not narr.get("narr_accf") and not fins and not seq:
                continue

            # Factors from findings (cause factors first), outcome from defining occurrence
            factor_roles = {}
            factor_evidence = {}
            for f in fins:
                desc = f.get("finding_description") or ""
                matched = [fid for rx, fid in FINDING_RULES if rx.search(desc)]
                role = "initiating" if (f.get("Cause_Factor") == "C" and not factor_roles) else "contributing" if f.get("Cause_Factor") == "C" else "latent"
                for fid in matched[:2]:
                    if fid not in factor_roles:
                        factor_roles[fid] = role
                        factor_evidence[fid] = desc
            category = "UNK"
            defining = next((s for s in seq if s.get("Defining_ev") == "1"), seq[0] if seq else None)
            occ_text = " | ".join(s.get("Occurrence_Description") or "" for s in seq)
            if defining:
                for rx, cat in OCC_CATEGORY:
                    if rx.search(defining.get("Occurrence_Description") or ""):
                        category = cat
                        break
            if category == "UNK":
                for rx, cat in OCC_CATEGORY:
                    if rx.search(occ_text):
                        category = cat
                        break
            outcome = OUTCOME_FACTOR.get(category)
            if outcome:
                factor_roles[outcome] = "outcome"
                factor_evidence.setdefault(outcome, (defining or {}).get("Occurrence_Description") or "")
            if fatal and "cfit" not in factor_roles and category in ("LOC-I", "UNK") and re.search(r"stall", occ_text, re.I):
                factor_roles.setdefault("aerodynamic_stall", "contributing")
            factors = [{"id": fid, "role": role, "evidence": factor_evidence.get(fid, "")[:200]} for fid, role in factor_roles.items()]
            if not factors:
                continue
            ordered = [f["id"] for f in factors if f["role"] != "outcome"] + [f["id"] for f in factors if f["role"] == "outcome"]
            chain = [[a, b] for a, b in zip(ordered, ordered[1:]) if a != b]

            phase = phase_of((defining or {}).get("Occurrence_Description") or "") if defining else phase_of(ac.get("phase_flt_spec") or "")
            events = []
            for i, s in enumerate(seq):
                events.append({"t": i * 30, "clock": None, "phase": phase_of(s.get("Occurrence_Description") or ""), "actor": "SYS", "kind": "outcome" if s.get("Defining_ev") == "1" else "system", "text": s.get("Occurrence_Description") or "occurrence", "factors": []})
            if not events:
                events.append({"t": 0, "clock": None, "phase": phase, "actor": "SYS", "kind": "outcome", "text": first_sentences(narr.get("narr_accf"), 1, 300) or "Accident", "factors": []})
            make = (ac.get("acft_make") or "unknown").strip()
            make_norm = MAKE_NORMALIZE.get(make.upper(), make.title() if make.isupper() else make)
            model = (ac.get("acft_model") or "").strip()
            operator = (ac.get("oper_name") or ac.get("oper_dba") or ("private" if ac.get("oper_individual_name") else "unknown")).strip() or "unknown"
            deaths = int(ev.get("inj_tot_f") or 0)
            occupants = int(ev.get("inj_tot_t") or 0) or None
            summary = first_sentences(narr.get("narr_accf")) or f"{make_norm} {model} {'fatal ' if fatal else ''}accident near {ev.get('ev_city') or 'an unknown location'}, {ev.get('ev_state') or ev.get('ev_country') or ''} on {to_iso(ev.get('ev_date'))}. The NTSB had not published a narrative when the database was exported; coded findings: {'; '.join((f.get('finding_description') or '')[:80] for f in fins[:3]) or 'none yet'}."
            if len(summary) < 40:
                summary = f"{summary} {make_norm} {model} {'fatal ' if fatal else ''}accident near {ev.get('ev_city') or 'an unknown location'}, {ev.get('ev_state') or ev.get('ev_country') or ''} on {to_iso(ev.get('ev_date'))}.".strip()
            rec = {
                "id": f"ntsb_{ev['ev_id'].lower()}",
                "tier": "ntsb",
                "depth": "summary",
                "ntsb_no": ev.get("ntsb_no"),
                "title": f"{make_norm} {model} · {ev.get('ev_city') or ''}, {ev.get('ev_state') or ev.get('ev_country') or ''} ({to_iso(ev.get('ev_date'))[:4]})".replace(" · ,", " ·"),
                "date": to_iso(ev.get("ev_date")),
                "agency": "NTSB",
                "agencies": [{"code": "NTSB", "name": "National Transportation Safety Board", "country": "USA", "role": "lead", "report_id": ev.get("ntsb_no"), "url": f"https://data.ntsb.gov/carol-repgen/api/Aviation/ReportMain/GenerateNewestReport/{ev.get('ntsb_no')}/pdf" if ev.get("ntsb_no") else None}],
                "aircraft": {"type": f"{make_norm} {model}".strip(), "manufacturer": make_norm, "registration": ac.get("regis_no") or None, "far_part": ac.get("far_part") or None},
                "operator": operator,
                "location": {"name": f"{ev.get('ev_city') or ''}, {ev.get('ev_state') or ''}".strip(", "), "country": ev.get("ev_country") or "USA", "lat": float(ev["dec_latitude"]) if ev.get("dec_latitude") else None, "lon": float(ev["dec_longitude"]) if ev.get("dec_longitude") else None},
                "phase": phase,
                "occupants": occupants,
                "fatalities": deaths,
                "damage": {"DEST": "destroyed", "SUBS": "substantial", "MINR": "minor"}.get(ac.get("damage") or "", "none"),
                "category": category,
                "summary": summary,
                "probable_cause": re.sub(r"\s+", " ", narr.get("narr_cause") or "").strip()[:1200] or "",
                "factors": factors,
                "chain": chain,
                "events": events,
                "cvr": [],
                "recommendations": [],
                "dissent": [],
                "report_links": [],
                "interest": round(2 * (deaths ** 0.5) + (3 if carrier else 0), 2),
                "extraction": {"method": "rules", "model": "ntsb-findings-map", "confidence": "medium" if fins else "low", "reviewed": False, "notes": ["Factors mapped from NTSB coded findings by keyword rules; chain follows finding order (heuristic).", "Event times are sequence order, not clock times."]},
            }
            out.write(json.dumps(rec, ensure_ascii=False) + "\n")
            kept += 1
    print(f"scanned {seen} events, wrote {kept} catalog records to {OUT}")


def to_iso(d):
    # mdb-export dates look like "01/01/08 00:00:00"
    m = re.match(r"(\d\d)/(\d\d)/(\d\d)", d or "")
    if not m:
        return "1900-01-01"
    mm, dd, yy = m.groups()
    year = int(yy)
    year += 2000 if year < 40 else 1900
    return f"{year:04d}-{mm}-{dd}"


if __name__ == "__main__":
    main()
