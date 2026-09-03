/**
 * FlightGear integration.
 *
 * 1. Package export: the replay's trajectory as FlightGear's generic protocol
 *    (positions/attitude at 10 Hz anchored on the crash-site coordinates), the
 *    protocol definition, an fgfs command line and a README, zipped in the browser.
 * 2. Live bridge: drive a running FlightGear from the replay clock through its
 *    built-in property WebSocket (fgfs --httpd=8080 --fdm=null). Each frame the
 *    bridge sets position, attitude and a few surfaces so FlightGear shows the
 *    same instant over its real terrain while the browser plays instruments and audio.
 */
import { sampleAll, integrateTrack } from './fdr.js'

const FT_PER_DEG_LAT = 364000

export const PROTOCOL_XML = `<?xml version="1.0"?>
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
`

const FG_AIRCRAFT = [
  [/a318|a319|a320|a321/, 'A320-family'], [/a330/, 'A330-200'], [/a340/, 'A340-300'], [/a350/, 'A350-900'], [/a380/, 'A380'],
  [/737-?[89]|737 max|737-?[67]/, '737-800'], [/737/, '737-300'], [/747/, '747-400'], [/757/, '757-200'], [/767/, '767-300'], [/777/, '777-200ER'], [/787/, '787-8'],
  [/707/, '707'], [/727/, '727-230'], [/md-?11/, 'MD-11'], [/md-?8|dc-?9/, 'MD-80'], [/dc-?10/, 'DC-10-30'], [/dc-?8/, 'DC-8'], [/dc-?3/, 'DC-3'],
  [/crj/, 'CRJ700-family'], [/erj|embraer 1[79]|e-?1[79]/, 'E-jet-family'], [/atr/, 'ATR-72-500'], [/dash 8|dhc-?8|q400/, 'Q400'], [/dhc-?6|twin otter/, 'dhc6'],
  [/saab/, 'saab-340'], [/beech|king air|1900/, 'b1900d'], [/cessna|c172|c208|caravan/, 'c172p'], [/concorde/, 'Concorde'], [/l-?1011|tristar/, 'L-1011-500'],
  [/tu-?154/, 'tu154b'], [/tu-?134/, 'Tu-134'], [/il-?76/, 'IL-76'], [/an-?2\b/, 'an2'], [/an-?24|an-?26/, 'an24'], [/fokker 100|f100|f28/, 'fokker100'],
  [/fokker 50|f50/, 'fokker50'], [/bae 146|avro rj/, 'bae146'], [/learjet/, 'Lear60'], [/gulfstream/, 'G550'], [/helicopter|bell|sikorsky|as350|eurocopter|robinson|mi-?8|lynx/, 'ec130']
]

export function fgAircraft(rec) {
  const t = `${rec.aircraft?.type || ''} ${rec.aircraft?.manufacturer || ''}`.toLowerCase()
  for (const [re, name] of FG_AIRCRAFT) if (re.test(t)) return name
  return '777-200ER'
}

export function metarFor(rec) {
  const ids = (rec.factors || []).map((f) => f.id).join(' ') + ' ' + (rec.summary || '').toLowerCase()
  let wx = '9999 FEW040'
  if (/thunderstorm|convective|microburst|windshear/.test(ids)) wx = '3000 +TSRA BKN015CB OVC030'
  else if (/\brain\b|precipitation/.test(ids)) wx = '5000 RA BKN012 OVC025'
  else if (/icing|ice_crystal|snow/.test(ids)) wx = '4000 -SN BKN010 OVC020'
  if (/\bfog\b|low_visibility/.test(ids)) wx = '0400 FG VV002'
  return `XXXX 000000Z 00000KT ${wx} 15/10 Q1013`
}

/** Geographic samples at dt seconds: [{t, lat, lon, alt, hdg, pitch, roll, ...}] anchored on the crash site. */
export function geoTrack(rec, fdr, dt = 0.1) {
  const loc = rec.location || {}
  const anchored = typeof loc.lat === 'number' && typeof loc.lon === 'number'
  const lat0 = anchored ? loc.lat : 0
  const lon0 = anchored ? loc.lon : 0
  const track = integrateTrack(fdr, dt) // x east, z south (north = -z), y alt
  const end = track[track.length - 1]
  const cos = Math.max(0.2, Math.cos((lat0 * Math.PI) / 180))
  return {
    anchored,
    rows: track.map((p) => {
      const s = sampleAll(fdr, p.t)
      const north = -(p.z - end.z)
      const east = p.x - end.x
      return { t: p.t, lat: lat0 + north / FT_PER_DEG_LAT, lon: lon0 + east / (FT_PER_DEG_LAT * cos), alt: s.alt_ft || 0, hdg: (((s.hdg_deg || 0) % 360) + 360) % 360, pitch: s.pitch_deg || 0, roll: s.roll_deg || 0, ias: s.ias_kt || 0, vs: (s.vs_fpm || 0) / 60, gear: s.gear === 1 ? 1 : 0, flaps: Math.min(1, (typeof s.flaps === 'number' ? s.flaps : 0) / 30), elevator: -(s.stick_pitch || 0), aileron: s.stick_roll || 0, throttle: typeof s.thrust_lever === 'number' ? Math.max(0, Math.min(1, s.thrust_lever)) : 0.6, n1: s.n1_pct || 0, stall: s.stall_warn ? 1 : 0 }
    })
  }
}

export function fgCommand(rec, fdr, geo) {
  const t0 = rec.t0 || `${rec.date}T12:00:00Z`
  const start = `${t0.slice(0, 10).replace(/-/g, ':')}:${t0.length >= 19 ? t0.slice(11, 19) : '12:00:00'}`
  const parts = [`--aircraft=${fgAircraft(rec)}`, '--fdm=null', '--generic=file,in,10,track.csv,blackbox-protocol', `--start-date-gmt=${start}`, `--metar='${metarFor(rec)}'`, '--disable-real-weather-fetch', '--httpd=8080']
  if (geo.anchored) parts.push(`--lat=${rec.location.lat.toFixed(5)}`, `--lon=${rec.location.lon.toFixed(5)}`)
  else if (rec.route?.to) parts.push(`--airport=${rec.route.to}`)
  return 'fgfs ' + parts.join(' ')
}

/** Build the package files for a record. Returns [{name, text}]. */
export function buildPackage(rec, fdr) {
  const geo = geoTrack(rec, fdr)
  const csv = geo.rows.map((r) => [r.t.toFixed(2), r.lat.toFixed(6), r.lon.toFixed(6), r.alt.toFixed(1), r.hdg.toFixed(2), r.pitch.toFixed(2), r.roll.toFixed(2), r.ias.toFixed(1), r.vs.toFixed(2), r.gear, r.flaps.toFixed(2), r.elevator.toFixed(2), r.aileron.toFixed(2), r.throttle.toFixed(2), r.n1.toFixed(1), r.stall].join(',')).join('\n') + '\n'
  const cmd = fgCommand(rec, fdr, geo)
  const readme = `${rec.title} · ${rec.date} · ${rec.aircraft?.type || ''}\n\nFlightGear replay package from Blackbox (fidelity ${fdr.fidelity}, confidence ${fdr.confidence || 'medium'}).\n\n1. Install FlightGear 2020.3 or newer: https://www.flightgear.org/\n2. Copy blackbox-protocol.xml into FlightGear's data folder under Protocol/ ($FG_ROOT/Protocol/).\n3. Run run.sh or run.bat from this folder, or paste the fgfs line into the launcher's additional settings.\n4. FlightGear starts at the crash-site coordinates on the recorded date and time, with weather from the record, and the aircraft\n   flies the recorded trajectory over FlightGear's real terrain. --httpd=8080 also lets the Blackbox web replay drive FlightGear live.\n\n${geo.anchored ? `Geography: the last point of the track sits on the crash-site coordinates ${rec.location.lat}, ${rec.location.lon}; earlier points are offset from there.` : 'No crash-site coordinates are known; add --lat/--lon or --airport to place the track.'}\nThis is a reconstruction from the published report, not recorder data, and must not be cited as evidence.\n`
  return [
    { name: 'track.csv', text: csv },
    { name: 'blackbox-protocol.xml', text: PROTOCOL_XML },
    { name: 'run.sh', text: `#!/bin/sh\ncd "$(dirname "$0")"\n${cmd}\n` },
    { name: 'run.bat', text: `@echo off\r\ncd /d %~dp0\r\n${cmd.replace("--metar='", '--metar="').replace("' --disable", '" --disable')}\r\n` },
    { name: 'README.txt', text: readme }
  ]
}

// ---------- minimal zip writer (store, no compression) ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export function zipFiles(files, folder = '') {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff
  const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
  const now = new Date()
  for (const f of files) {
    const name = enc.encode(folder + f.name)
    const data = typeof f.text === 'string' ? enc.encode(f.text) : f.data
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, dosTime(now), true); local.setUint16(12, dosDate(now), true); local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, data)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true)
    cd.setUint16(12, dosTime(now), true); cd.setUint16(14, dosDate(now), true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true)
    cd.setUint16(28, name.length, true); cd.setUint16(30, 0, true); cd.setUint16(32, 0, true); cd.setUint16(34, 0, true); cd.setUint16(36, 0, true); cd.setUint32(38, 0, true); cd.setUint32(42, offset, true)
    central.push(new Uint8Array(cd.buffer), name)
    offset += 30 + name.length + data.length
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true)
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' })
}

export function downloadPackage(rec, fdr) {
  const files = buildPackage(rec, fdr)
  const blob = zipFiles(files, `blackbox-${rec.id}/`)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `blackbox-${rec.id}-flightgear.zip`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 2000)
}

/**
 * Live bridge over FlightGear's property WebSocket (Phi): fgfs --httpd=8080.
 * Sends "set" commands for the position and attitude properties at up to 20 Hz.
 */
export class FlightGearBridge {
  constructor(url = 'ws://localhost:8080/PropertyListener') {
    this.url = url
    this.ws = null
    this.state = 'idle' // idle | connecting | connected | error
    this.onState = null
    this._last = 0
    this.sent = 0
  }

  connect() {
    if (this.ws) this.disconnect()
    this._set('connecting')
    try {
      this.ws = new WebSocket(this.url)
    } catch (e) {
      this._set('error', e.message)
      return
    }
    this.ws.onopen = () => this._set('connected')
    this.ws.onerror = () => this._set('error', 'FlightGear is not answering on ' + this.url + '. Start it with --httpd=8080 --fdm=null.')
    this.ws.onclose = () => { if (this.state !== 'error') this._set('idle') }
  }

  disconnect() {
    if (this.ws) { try { this.ws.close() } catch (e) { /* ignore */ } }
    this.ws = null
    this._set('idle')
  }

  _set(state, message = '') {
    this.state = state
    this.message = message
    this.onState && this.onState(state, message)
  }

  setProp(node, value) {
    if (!this.ws || this.ws.readyState !== 1) return
    this.ws.send(JSON.stringify({ command: 'set', node, value }))
  }

  /** Push one geo sample (from geoTrack rows or computed live). */
  push(row) {
    const now = performance.now()
    if (now - this._last < 50) return
    this._last = now
    const props = {
      '/position/latitude-deg': row.lat, '/position/longitude-deg': row.lon, '/position/altitude-ft': row.alt,
      '/orientation/heading-deg': row.hdg, '/orientation/pitch-deg': row.pitch, '/orientation/roll-deg': row.roll,
      '/velocities/airspeed-kt': row.ias, '/gear/gear[0]/position-norm': row.gear, '/surface-positions/flap-pos-norm': row.flaps,
      '/surface-positions/elevator-pos-norm': row.elevator, '/surface-positions/left-aileron-pos-norm': row.aileron,
      '/controls/engines/engine[0]/throttle': row.throttle, '/engines/engine[0]/n1': row.n1, '/blackbox/t-sec': row.t
    }
    for (const [k, v] of Object.entries(props)) this.setProp(k, v)
    this.sent++
  }
}

/** Geo sample at an arbitrary time from a geoTrack result. */
export function geoAt(geo, t) {
  const rows = geo.rows
  if (!rows.length) return null
  const dt = rows[1] ? rows[1].t - rows[0].t : 1
  const i = Math.max(0, Math.min(rows.length - 1, Math.round((t - rows[0].t) / dt)))
  return rows[i]
}
