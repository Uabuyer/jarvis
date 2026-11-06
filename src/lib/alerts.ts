import { useSyncExternalStore } from 'react'
import { BRIDGE_HTTP_URL } from '../config'

/**
 * Air-raid alert state for where this computer is, as reported by the bridge.
 *
 * `unknown` is its own state on purpose. A failed request must never read as
 * "no alert": the badge says it has no data rather than showing all clear.
 */
export type AlertState =
  | { status: 'off' }
  | { status: 'nolocation' }
  | { status: 'unknown' }
  | { status: 'clear' }
  | { status: 'active'; types: string[]; since: string | null }

/** Fast enough to warn promptly, slow enough to be polite to a free service. */
const POLL_MS = 20000

/**
 * A desktop on a cable can be placed from its IP address alone, sometimes in the
 * wrong oblast. Better to say the place is unknown than to watch the wrong one.
 */
const MAX_ACCURACY_M = 50000

// Starts hidden. Most people never configure alerts, and they should not see a
// warning badge flash up while the first reading is on its way.
let state: AlertState = { status: 'off' }
let configured = false
let timer: ReturnType<typeof setInterval> | undefined
let place = { city: '', cityIn: '' }
const listeners = new Set<() => void>()

function publish(next: AlertState) {
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  listeners.forEach((l) => l())
}

async function poll() {
  try {
    const res = await fetch(`${BRIDGE_HTTP_URL}/alerts`, {
      signal: AbortSignal.timeout(12000),
    })
    const a = (await res.json()) as {
      enabled?: boolean
      city?: string
      cityIn?: string
      active?: boolean
      types?: string[]
      since?: string | null
    }
    if (a.enabled === false) {
      clearInterval(timer)
      if (state.status !== 'nolocation') publish({ status: 'off' })
      return
    }
    // Set before anything is published, so the first reader sees the place.
    configured = true
    place = { city: a.city ?? '', cityIn: a.cityIn ?? '' }
    if (!res.ok) throw new Error(`status ${res.status}`)
    publish(
      a.active
        ? { status: 'active', types: a.types ?? [], since: a.since ?? null }
        : { status: 'clear' },
    )
  } catch (err) {
    console.warn('[jarvis] alert status unavailable:', err)
    // A bridge that has never answered says nothing about whether alerts are on.
    if (configured) publish({ status: 'unknown' })
  }
}

/**
 * Asks the browser where this computer is and points the alerts there. A failure
 * keeps the place already saved, because that is still the best answer there is.
 * Called from the INITIALISE click, so the permission prompt has a reason.
 */
export function locateForAlerts() {
  const failed = () => {
    if (!configured) publish({ status: 'nolocation' })
  }
  if (!navigator.geolocation) return failed()
  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      if (coords.accuracy > MAX_ACCURACY_M) return failed()
      try {
        const res = await fetch(`${BRIDGE_HTTP_URL}/alerts/location`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ lat: coords.latitude, lon: coords.longitude }),
          signal: AbortSignal.timeout(25000),
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const { found } = (await res.json()) as { found?: boolean }
        if (!found) configured = false
        if (found && state.status === 'nolocation') publish({ status: 'off' })
        clearInterval(timer)
        timer = setInterval(() => void poll(), POLL_MS)
        void poll()
      } catch (err) {
        console.warn('[jarvis] could not place the alerts:', err)
        failed()
      }
    },
    failed,
    { timeout: 20000, maximumAge: 600000 },
  )
}

/** Starts polling. Returns the function that stops it. */
export function startAlerts(): () => void {
  void poll()
  timer = setInterval(() => void poll(), POLL_MS)
  return () => clearInterval(timer)
}

/** Where the alerts are for: the name, and "у Полтаві" for his sentences. */
export function alertPlace() {
  return place
}

export function alertState(): AlertState {
  return state
}

export function subscribeAlerts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAlert(): AlertState {
  return useSyncExternalStore(subscribeAlerts, alertState)
}
