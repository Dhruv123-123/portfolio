/**
 * Geography helpers for the atlas: Wikipedia links and approximate country
 * centroids used when a record has no precise coordinates.
 */

// Approximate centroids [lat, lon]; keyed by common English names and ISO-2 codes.
const C = {
  'United States': [39.8, -98.6], USA: [39.8, -98.6], US: [39.8, -98.6], 'United States of America': [39.8, -98.6],
  Canada: [56.1, -106.3], CA: [56.1, -106.3], Mexico: [23.6, -102.5], MX: [23.6, -102.5],
  Brazil: [-14.2, -51.9], BR: [-14.2, -51.9], Argentina: [-38.4, -63.6], AR: [-38.4, -63.6], Chile: [-35.7, -71.5], CL: [-35.7, -71.5],
  Colombia: [4.6, -74.3], CO: [4.6, -74.3], Venezuela: [6.4, -66.6], VE: [6.4, -66.6], Peru: [-9.2, -75.0], PE: [-9.2, -75.0],
  Ecuador: [-1.8, -78.2], EC: [-1.8, -78.2], Bolivia: [-16.3, -63.6], BO: [-16.3, -63.6], Paraguay: [-23.4, -58.4], PY: [-23.4, -58.4],
  Uruguay: [-32.5, -55.8], UY: [-32.5, -55.8], Guyana: [4.9, -58.9], GY: [4.9, -58.9], Suriname: [3.9, -56.0], SR: [3.9, -56.0],
  'French Guiana': [3.9, -53.1], GF: [3.9, -53.1], Cuba: [21.5, -77.8], CU: [21.5, -77.8], Jamaica: [18.1, -77.3], JM: [18.1, -77.3],
  Haiti: [19.0, -72.3], HT: [19.0, -72.3], 'Dominican Republic': [18.7, -70.2], DO: [18.7, -70.2], 'Puerto Rico': [18.2, -66.5], PR: [18.2, -66.5],
  Bahamas: [25.0, -77.4], 'The Bahamas': [25.0, -77.4], BS: [25.0, -77.4], Bermuda: [32.3, -64.8], BM: [32.3, -64.8],
  Guatemala: [15.8, -90.2], GT: [15.8, -90.2], Honduras: [15.2, -86.2], HN: [15.2, -86.2], 'El Salvador': [13.8, -88.9], SV: [13.8, -88.9],
  Nicaragua: [12.9, -85.2], NI: [12.9, -85.2], 'Costa Rica': [9.7, -83.8], CR: [9.7, -83.8], Panama: [8.5, -80.8], PA: [8.5, -80.8],
  Belize: [17.2, -88.5], BZ: [17.2, -88.5], 'Trinidad and Tobago': [10.7, -61.2], TT: [10.7, -61.2], Barbados: [13.2, -59.5], BB: [13.2, -59.5],
  'Antigua and Barbuda': [17.1, -61.8], AG: [17.1, -61.8], 'Saint Lucia': [13.9, -61.0], LC: [13.9, -61.0], Dominica: [15.4, -61.4], DM: [15.4, -61.4],
  Grenada: [12.1, -61.7], GD: [12.1, -61.7], 'Saint Vincent and the Grenadines': [12.98, -61.3], VC: [12.98, -61.3], Aruba: [12.5, -70.0], AW: [12.5, -70.0],
  'Cayman Islands': [19.3, -81.3], KY: [19.3, -81.3], 'Turks and Caicos Islands': [21.7, -71.8], TC: [21.7, -71.8], 'Virgin Islands': [18.3, -64.9], VI: [18.3, -64.9],
  'United Kingdom': [54.0, -2.5], GB: [54.0, -2.5], UK: [54.0, -2.5], England: [52.5, -1.5], Scotland: [56.5, -4.2], Wales: [52.3, -3.6], 'Northern Ireland': [54.6, -6.5],
  Ireland: [53.4, -8.2], IE: [53.4, -8.2], France: [46.6, 2.2], FR: [46.6, 2.2], Germany: [51.2, 10.4], DE: [51.2, 10.4], 'West Germany': [50.5, 9.0], 'East Germany': [52.0, 12.5],
  Spain: [40.4, -3.7], ES: [40.4, -3.7], Portugal: [39.4, -8.2], PT: [39.4, -8.2], Italy: [42.5, 12.5], IT: [42.5, 12.5], Switzerland: [46.8, 8.2], CH: [46.8, 8.2],
  Austria: [47.5, 14.5], AT: [47.5, 14.5], Belgium: [50.5, 4.5], BE: [50.5, 4.5], Netherlands: [52.1, 5.3], NL: [52.1, 5.3], Luxembourg: [49.8, 6.1], LU: [49.8, 6.1],
  Denmark: [56.0, 10.0], DK: [56.0, 10.0], Norway: [62.0, 9.0], NO: [62.0, 9.0], Sweden: [62.0, 15.0], SE: [62.0, 15.0], Finland: [64.0, 26.0], FI: [64.0, 26.0],
  Iceland: [65.0, -18.0], IS: [65.0, -18.0], Greenland: [72.0, -40.0], GL: [72.0, -40.0], 'Faroe Islands': [62.0, -6.8], FO: [62.0, -6.8],
  Poland: [52.0, 19.5], PL: [52.0, 19.5], 'Czech Republic': [49.8, 15.5], Czechia: [49.8, 15.5], CZ: [49.8, 15.5], Czechoslovakia: [49.5, 17.0], Slovakia: [48.7, 19.7], SK: [48.7, 19.7],
  Hungary: [47.2, 19.5], HU: [47.2, 19.5], Romania: [45.9, 25.0], RO: [45.9, 25.0], Bulgaria: [42.7, 25.5], BG: [42.7, 25.5], Greece: [39.0, 22.0], GR: [39.0, 22.0],
  Yugoslavia: [44.0, 19.0], Serbia: [44.0, 21.0], RS: [44.0, 21.0], Croatia: [45.1, 15.2], HR: [45.1, 15.2], Slovenia: [46.1, 14.8], SI: [46.1, 14.8],
  'Bosnia and Herzegovina': [43.9, 17.7], BA: [43.9, 17.7], Montenegro: [42.7, 19.4], ME: [42.7, 19.4], 'North Macedonia': [41.6, 21.7], Macedonia: [41.6, 21.7], MK: [41.6, 21.7],
  Albania: [41.2, 20.2], AL: [41.2, 20.2], Kosovo: [42.6, 20.9], XK: [42.6, 20.9], Ukraine: [49.0, 32.0], UA: [49.0, 32.0], Belarus: [53.7, 28.0], BY: [53.7, 28.0],
  Moldova: [47.0, 28.4], MD: [47.0, 28.4], Lithuania: [55.2, 23.9], LT: [55.2, 23.9], Latvia: [56.9, 24.6], LV: [56.9, 24.6], Estonia: [58.6, 25.0], EE: [58.6, 25.0],
  Russia: [60.0, 90.0], RU: [60.0, 90.0], 'Soviet Union': [58.0, 70.0], USSR: [58.0, 70.0], 'Russian Empire': [58.0, 60.0], Malta: [35.9, 14.4], MT: [35.9, 14.4], Cyprus: [35.1, 33.4], CY: [35.1, 33.4],
  Turkey: [39.0, 35.0], TR: [39.0, 35.0], Türkiye: [39.0, 35.0], Georgia: [42.3, 43.4], GE: [42.3, 43.4], Armenia: [40.1, 45.0], AM: [40.1, 45.0], Azerbaijan: [40.4, 47.6], AZ: [40.4, 47.6],
  Iran: [32.4, 53.7], IR: [32.4, 53.7], Iraq: [33.2, 43.7], IQ: [33.2, 43.7], Syria: [35.0, 38.5], SY: [35.0, 38.5], Lebanon: [33.9, 35.9], LB: [33.9, 35.9],
  Israel: [31.4, 35.0], IL: [31.4, 35.0], Palestine: [31.9, 35.2], PS: [31.9, 35.2], Jordan: [31.2, 36.5], JO: [31.2, 36.5], 'Saudi Arabia': [24.0, 45.0], SA: [24.0, 45.0],
  Yemen: [15.5, 48.0], YE: [15.5, 48.0], Oman: [21.0, 57.0], OM: [21.0, 57.0], 'United Arab Emirates': [24.0, 54.0], UAE: [24.0, 54.0], AE: [24.0, 54.0],
  Qatar: [25.3, 51.2], QA: [25.3, 51.2], Bahrain: [26.0, 50.5], BH: [26.0, 50.5], Kuwait: [29.3, 47.7], KW: [29.3, 47.7],
  Egypt: [26.8, 30.8], EG: [26.8, 30.8], Libya: [27.0, 17.0], LY: [27.0, 17.0], Tunisia: [34.0, 9.5], TN: [34.0, 9.5], Algeria: [28.0, 2.6], DZ: [28.0, 2.6], Morocco: [31.8, -7.1], MA: [31.8, -7.1],
  'Western Sahara': [24.5, -13.0], EH: [24.5, -13.0], Mauritania: [20.3, -10.3], MR: [20.3, -10.3], Mali: [17.6, -3.0], ML: [17.6, -3.0], Niger: [17.6, 8.1], NE: [17.6, 8.1],
  Chad: [15.5, 18.7], TD: [15.5, 18.7], Sudan: [15.5, 30.0], SD: [15.5, 30.0], 'South Sudan': [7.0, 30.0], SS: [7.0, 30.0], Ethiopia: [9.1, 40.5], ET: [9.1, 40.5],
  Eritrea: [15.2, 39.8], ER: [15.2, 39.8], Djibouti: [11.8, 42.6], DJ: [11.8, 42.6], Somalia: [5.2, 46.2], SO: [5.2, 46.2], Kenya: [0.0, 37.9], KE: [0.0, 37.9],
  Uganda: [1.4, 32.3], UG: [1.4, 32.3], Tanzania: [-6.4, 34.9], TZ: [-6.4, 34.9], Rwanda: [-1.9, 29.9], RW: [-1.9, 29.9], Burundi: [-3.4, 29.9], BI: [-3.4, 29.9],
  'Democratic Republic of the Congo': [-4.0, 21.8], 'DR Congo': [-4.0, 21.8], Zaire: [-4.0, 21.8], CD: [-4.0, 21.8], 'Republic of the Congo': [-0.2, 15.8], Congo: [-0.2, 15.8], CG: [-0.2, 15.8],
  Gabon: [-0.8, 11.6], GA: [-0.8, 11.6], Cameroon: [7.4, 12.4], CM: [7.4, 12.4], 'Central African Republic': [6.6, 20.9], CF: [6.6, 20.9], 'Equatorial Guinea': [1.6, 10.3], GQ: [1.6, 10.3],
  Nigeria: [9.1, 8.7], NG: [9.1, 8.7], Benin: [9.3, 2.3], BJ: [9.3, 2.3], Togo: [8.6, 0.8], TG: [8.6, 0.8], Ghana: [7.9, -1.0], GH: [7.9, -1.0], "Côte d'Ivoire": [7.5, -5.5], 'Ivory Coast': [7.5, -5.5], CI: [7.5, -5.5],
  Liberia: [6.4, -9.4], LR: [6.4, -9.4], 'Sierra Leone': [8.5, -11.8], SL: [8.5, -11.8], Guinea: [9.9, -11.3], GN: [9.9, -11.3], 'Guinea-Bissau': [11.8, -15.2], GW: [11.8, -15.2],
  Senegal: [14.5, -14.5], SN: [14.5, -14.5], Gambia: [13.4, -15.3], GM: [13.4, -15.3], 'Burkina Faso': [12.2, -1.6], BF: [12.2, -1.6], 'Cape Verde': [16.0, -24.0], CV: [16.0, -24.0],
  Angola: [-11.2, 17.9], AO: [-11.2, 17.9], Zambia: [-13.1, 27.8], ZM: [-13.1, 27.8], Zimbabwe: [-19.0, 29.2], ZW: [-19.0, 29.2], Rhodesia: [-19.0, 29.2], Mozambique: [-18.7, 35.5], MZ: [-18.7, 35.5],
  Malawi: [-13.3, 34.3], MW: [-13.3, 34.3], Namibia: [-22.9, 18.5], NA: [-22.9, 18.5], Botswana: [-22.3, 24.7], BW: [-22.3, 24.7], 'South Africa': [-29.0, 25.0], ZA: [-29.0, 25.0],
  Lesotho: [-29.6, 28.2], LS: [-29.6, 28.2], Eswatini: [-26.5, 31.5], Swaziland: [-26.5, 31.5], SZ: [-26.5, 31.5], Madagascar: [-19.0, 46.9], MG: [-19.0, 46.9], Mauritius: [-20.3, 57.6], MU: [-20.3, 57.6],
  Comoros: [-11.9, 43.9], KM: [-11.9, 43.9], Seychelles: [-4.7, 55.5], SC: [-4.7, 55.5], Réunion: [-21.1, 55.5], RE: [-21.1, 55.5], 'Sao Tome and Principe': [0.2, 6.6], ST: [0.2, 6.6],
  Afghanistan: [33.9, 67.7], AF: [33.9, 67.7], Pakistan: [30.4, 69.3], PK: [30.4, 69.3], India: [21.0, 78.0], IN: [21.0, 78.0], Nepal: [28.4, 84.1], NP: [28.4, 84.1],
  Bhutan: [27.5, 90.4], BT: [27.5, 90.4], Bangladesh: [23.7, 90.4], BD: [23.7, 90.4], 'Sri Lanka': [7.9, 80.8], LK: [7.9, 80.8], Maldives: [3.2, 73.2], MV: [3.2, 73.2],
  Myanmar: [19.8, 96.1], Burma: [19.8, 96.1], MM: [19.8, 96.1], Thailand: [15.9, 100.9], TH: [15.9, 100.9], Laos: [18.0, 104.0], LA: [18.0, 104.0], Cambodia: [12.6, 105.0], KH: [12.6, 105.0],
  Vietnam: [16.0, 107.0], 'South Vietnam': [11.0, 107.0], VN: [16.0, 107.0], Malaysia: [4.2, 102.0], MY: [4.2, 102.0], Singapore: [1.35, 103.8], SG: [1.35, 103.8],
  Indonesia: [-2.5, 118.0], ID: [-2.5, 118.0], 'East Timor': [-8.9, 125.7], 'Timor-Leste': [-8.9, 125.7], TL: [-8.9, 125.7], Brunei: [4.5, 114.7], BN: [4.5, 114.7],
  Philippines: [12.9, 121.8], PH: [12.9, 121.8], China: [35.0, 105.0], CN: [35.0, 105.0], "People's Republic of China": [35.0, 105.0], Taiwan: [23.7, 121.0], TW: [23.7, 121.0],
  'Hong Kong': [22.3, 114.2], HK: [22.3, 114.2], Macau: [22.2, 113.5], MO: [22.2, 113.5], Mongolia: [46.9, 103.8], MN: [46.9, 103.8], 'North Korea': [40.3, 127.0], KP: [40.3, 127.0],
  'South Korea': [36.5, 127.8], KR: [36.5, 127.8], Korea: [36.5, 127.8], Japan: [36.2, 138.3], JP: [36.2, 138.3], Kazakhstan: [48.0, 68.0], KZ: [48.0, 68.0],
  Uzbekistan: [41.4, 64.6], UZ: [41.4, 64.6], Turkmenistan: [38.97, 59.6], TM: [38.97, 59.6], Kyrgyzstan: [41.2, 74.8], KG: [41.2, 74.8], Tajikistan: [38.9, 71.3], TJ: [38.9, 71.3],
  Australia: [-25.3, 133.8], AU: [-25.3, 133.8], 'New Zealand': [-41.0, 174.0], NZ: [-41.0, 174.0], 'Papua New Guinea': [-6.3, 144.0], PG: [-6.3, 144.0], Fiji: [-17.7, 178.0], FJ: [-17.7, 178.0],
  'Solomon Islands': [-9.6, 160.2], SB: [-9.6, 160.2], Vanuatu: [-15.4, 166.9], VU: [-15.4, 166.9], 'New Caledonia': [-20.9, 165.6], NC: [-20.9, 165.6], Samoa: [-13.8, -172.1], WS: [-13.8, -172.1],
  Tonga: [-21.2, -175.2], TO: [-21.2, -175.2], 'French Polynesia': [-17.7, -149.4], PF: [-17.7, -149.4], Guam: [13.4, 144.8], GU: [13.4, 144.8], 'Marshall Islands': [7.1, 171.2], MH: [7.1, 171.2],
  Micronesia: [7.4, 150.5], FM: [7.4, 150.5], Palau: [7.5, 134.6], PW: [7.5, 134.6], Kiribati: [1.9, -157.4], KI: [1.9, -157.4], Nauru: [-0.5, 166.9], NR: [-0.5, 166.9], Tuvalu: [-7.1, 177.6], TV: [-7.1, 177.6],
  'Northern Mariana Islands': [15.2, 145.7], MP: [15.2, 145.7], 'American Samoa': [-14.3, -170.7], AS: [-14.3, -170.7], Antarctica: [-82.0, 0.0], AQ: [-82.0, 0.0],
  'Atlantic Ocean': [20.0, -40.0], 'Pacific Ocean': [0.0, -160.0], 'Indian Ocean': [-20.0, 80.0], 'International waters': [0.0, -30.0], 'Mediterranean Sea': [35.0, 18.0], 'Caribbean Sea': [15.0, -75.0],
  'North Sea': [56.0, 3.0], 'Gulf of Mexico': [25.0, -90.0], 'South China Sea': [12.0, 114.0], 'Java Sea': [-5.0, 110.0], 'Black Sea': [43.0, 34.0], 'Baltic Sea': [58.0, 20.0],
  'Persian Gulf': [26.0, 52.0], 'Red Sea': [20.0, 38.0], 'Bay of Bengal': [15.0, 88.0], 'Arabian Sea': [15.0, 65.0], 'Tasman Sea': [-40.0, 160.0], 'Sea of Japan': [40.0, 135.0],
  'Gulf of Guinea': [2.0, 2.0], 'English Channel': [50.0, -2.0], 'Irish Sea': [53.5, -5.0], 'Bering Sea': [58.0, -175.0], 'Arctic Ocean': [85.0, 0.0], 'Southern Ocean': [-65.0, 0.0]
}

/** Country centroid [lat, lon] for a name or ISO-2 code, or null. */
export function countryCentroid(name) {
  if (!name) return null
  if (C[name]) return C[name]
  const k = Object.keys(C).find((key) => key.toLowerCase() === String(name).toLowerCase())
  return k ? C[k] : null
}

/** Best position for a record: exact coordinates, else country centroid (marked approx). */
export function recordPosition(rec) {
  const loc = rec.location || {}
  if (typeof loc.lat === 'number' && typeof loc.lon === 'number') return { lat: loc.lat, lon: loc.lon, approx: false }
  const c = countryCentroid(loc.country)
  if (c) {
    // spread country-level points a little so thousands of them do not stack on one pixel
    const seed = hash(rec.id)
    return { lat: c[0] + ((seed % 100) / 100 - 0.5) * 3, lon: c[1] + (((seed >> 7) % 100) / 100 - 0.5) * 3, approx: true }
  }
  return null
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h)
}

/** Wikipedia URL for a record: the linked article, else a search for its title. */
export function wikipediaUrl(rec) {
  if (rec.wikipedia) return rec.wikipedia.startsWith('http') ? rec.wikipedia : `https://en.wikipedia.org/wiki/${rec.wikipedia}`
  const q = rec.flight_number && rec.operator ? `${rec.operator} ${rec.flight_number}` : `${rec.title} ${rec.date ? rec.date.slice(0, 4) : ''} aviation accident`
  return `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q.trim())}`
}

export function hasWikipediaArticle(rec) {
  return !!rec.wikipedia
}
