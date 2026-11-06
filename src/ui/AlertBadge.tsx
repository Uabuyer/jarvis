import { alertPlace, useAlert } from '../lib/alerts'

const LABEL: Record<string, string> = {
  AIR: 'Повітряна тривога',
  ARTILLERY: 'Загроза артобстрілу',
  URBAN_FIGHTS: 'Вуличні бої',
}

function clock(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return ` · з ${d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
}

/** The city and whether there is an alert in it right now. */
export function AlertBadge() {
  const alert = useAlert()
  if (alert.status === 'off') return null
  const { city } = alertPlace()

  const text =
    alert.status === 'active'
      ? `${alert.types.map((t) => LABEL[t] ?? 'Тривога').join(', ') || 'Тривога'}${clock(alert.since)}`
      : alert.status === 'clear'
        ? 'Тривоги немає'
        : alert.status === 'nolocation'
          ? 'Дозволь геолокацію, щоб бачити тривоги'
          : 'Немає даних про тривогу'

  return (
    <div className="alert-badge" data-status={alert.status} role="status">
      <svg viewBox="0 0 24 24" className="alert-pin" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
      {city && <span className="alert-city">{city}</span>}
      <span className="alert-text">{text}</span>
    </div>
  )
}
