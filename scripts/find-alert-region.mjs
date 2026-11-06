#!/usr/bin/env node
// Finds your place in the alert service and prints the lines for
// .env.bridge.local. Usage: npm run alerts:find Полтава

const query = process.argv.slice(2).join(' ').trim().toLowerCase()
if (!query) {
  console.log('Вкажи назву: npm run alerts:find Полтава')
  process.exit(0)
}

const res = await fetch('https://siren.pp.ua/api/v3/regions', {
  headers: { 'user-agent': 'jarvis-local' },
  signal: AbortSignal.timeout(15000),
}).catch((err) => {
  console.error(`Не вдалося отримати список регіонів: ${err.message}`)
  process.exit(1)
})
if (!res.ok) {
  console.error(`Не вдалося отримати список регіонів: статус ${res.status}`)
  process.exit(1)
}
const { states } = await res.json()

// An alert can be declared at any level, so a match needs its parents' ids too.
const matches = []
function walk(regions, parents) {
  for (const region of regions ?? []) {
    const path = [...parents, region]
    if (region.regionName.toLowerCase().includes(query)) matches.push(path)
    walk(region.regionChildIds, path)
  }
}
walk(states, [])

if (!matches.length) {
  console.log(`Нічого не знайдено за запитом "${query}". Спробуй коротшу назву.`)
  process.exit(0)
}

for (const path of matches.slice(0, 15)) {
  console.log(path.map((r) => r.regionName).join(' > '))
  console.log(`JARVIS_ALERT_REGIONS=${path.map((r) => r.regionId).join(',')}\n`)
}
if (matches.length > 15) console.log(`...і ще ${matches.length - 15}. Уточни назву.\n`)
console.log('Обери один варіант і додай його рядок у .env.bridge.local, а також:')
console.log('JARVIS_ALERT_CITY=Твоє місто')
console.log('JARVIS_ALERT_CITY_IN=у твоєму місті')
