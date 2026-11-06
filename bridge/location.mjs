/**
 * Works out which air-raid alert regions a pair of coordinates belongs to.
 *
 * The alert service has no lookup by coordinates, so this takes the address from
 * OpenStreetMap's Nominatim and finds the same oblast, district and community in
 * the service's own region tree. All three matter: an alert can be declared at
 * any one of those levels alone.
 */

const REGIONS_URL = 'https://siren.pp.ua/api/v3/regions'
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
const USER_AGENT = 'jarvis-local-assistant'

const key = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .trim()

/** The name a person would use: "м. Полтава та ..." reads as "Полтава". */
function placeName(community, address) {
  const named = address.city ?? address.town ?? address.village ?? address.hamlet
  if (named) return named
  const city = community?.regionName.match(/^м\.\s*(.+?)\s+та\s/)
  if (city) return city[1][0].toUpperCase() + city[1].slice(1)
  return address.municipality ?? address.state ?? ''
}

/**
 * Matches a Nominatim address against the region tree. Returns null when the
 * place is outside the tree, for example abroad, so that nobody gets alerts for
 * a guessed region.
 */
export function regionsFromAddress(address, states) {
  if (address?.country_code !== 'ua') return null

  if (!address.state || key(address.state) === 'київ') {
    if (key(address.city ?? address.state) !== 'київ') return null
    const kyiv = states.find((s) => key(s.regionName) === 'м. київ')
    return kyiv ? { regions: [kyiv.regionId], city: 'Київ' } : null
  }

  const oblast = states.find((s) => key(s.regionName) === key(address.state))
  if (!oblast) return null
  const districtName = key(address.county ?? address.district)
  const district = oblast.regionChildIds?.find((r) => key(r.regionName) === districtName)

  // "Полтавська міська громада" against "м. Полтава та Полтавська
  // територіальна громада". Two big cities sit at the top of the tree, not under
  // their districts. Without a district the name alone could be another
  // community of the same name elsewhere, so it is not guessed at.
  const word = key(address.municipality).split(/\s+/)[0]
  const pool = district
    ? [...(district.regionChildIds ?? []), ...states.filter((s) => key(s.regionName).includes('громада'))]
    : []
  const community = word
    ? pool.find((r) => key(r.regionName).split(/\s+/).includes(word))
    : undefined

  return {
    regions: [oblast, district, community].filter(Boolean).map((r) => r.regionId),
    city: placeName(community, address),
  }
}

export async function resolveAlertLocation(lat, lon) {
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    zoom: '14',
    addressdetails: '1',
  })
  const [reverse, tree] = await Promise.all([
    fetch(`${REVERSE_URL}?${query}`, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'uk' },
      signal: AbortSignal.timeout(10000),
    }),
    fetch(REGIONS_URL, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    }),
  ])
  if (!reverse.ok) throw new Error(`geocoder status ${reverse.status}`)
  if (!tree.ok) throw new Error(`regions status ${tree.status}`)
  const { address } = await reverse.json()
  const { states } = await tree.json()
  return regionsFromAddress(address, states)
}

/** Kilometres between two points. Plenty accurate at the distances that matter. */
export function distanceKm(a, b) {
  const rad = Math.PI / 180
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.hypot(x, y) * 6371
}
