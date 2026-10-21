export function formatPercent(value: unknown, options: { decimals?: number } = {}): string | null {
  const decimals = options.decimals ?? 1
  if (value === null || value === undefined || Array.isArray(value)) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num) || !Number.isFinite(num)) return null
  // Treat values in [0,1] as fractions; treat values > 1 as percentage points.
  const pct = num <= 1 ? num * 100 : num
  return `${pct.toFixed(decimals)}%`
}

export function formatCurrency(value: unknown): string | null {
  if (value === null || value === undefined || Array.isArray(value)) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num) || !Number.isFinite(num)) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(num)
}

/** ISO calendar date with no time component, e.g. "2024-05-01". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Format a backend date or datetime string for display.
 *
 * The backend stores naive UTC timestamps (`datetime.utcnow()`) and plain date
 * strings. A datetime without a timezone designator is treated as UTC so the
 * displayed wall-clock matches what was stored, regardless of the viewer's
 * timezone. A calendar date is shown without a time component. Values that
 * cannot be parsed are returned verbatim rather than replaced with an invented
 * date.
 */
export function formatDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null

  if (DATE_ONLY.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return trimmed
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(date)
  }

  const hasTimeZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)
  const date = new Date(hasTimeZone ? trimmed : `${trimmed}Z`)
  if (Number.isNaN(date.getTime())) return trimmed
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
}

export function formatNumber(value: unknown, decimals = 2): string | null {
  if (value === null || value === undefined || Array.isArray(value)) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num) || !Number.isFinite(num)) return null
  return num.toFixed(decimals)
}

/**
 * Human-friendly elapsed time since a stored analysis timestamp.
 *
 * Naive timestamps are treated as UTC, matching ``formatDate``. Returns null
 * when the value is absent or unparseable so callers can render an honest
 * placeholder. This describes how long an item has been waiting; it is not an
 * SLA or a deadline.
 */
export function formatWaitingAge(
  value: unknown,
  now: Date = new Date(),
): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const hasTimeZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed)
  const then = new Date(hasTimeZone ? trimmed : `${trimmed}Z`)
  const thenMs = then.getTime()
  if (Number.isNaN(thenMs)) return null

  const diffMs = now.getTime() - thenMs
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Less than an hour'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return 'Less than an hour'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'}`
  const weeks = Math.floor(days / 7)
  if (days < 60) return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  const months = Math.floor(days / 30)
  return `${months} ${months === 1 ? 'month' : 'months'}`
}

/**
 * Interpret the value as a score in [0,100] when possible. Returns null if the
 * value is not a finite number or is obviously out of a reasonable range.
 */
export function to0to100(value: unknown): number | null {
  if (value === null || value === undefined || Array.isArray(value)) return null
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(num) || !Number.isFinite(num)) return null
  // If it's in [0,1], treat as fraction.
  const scaled = num <= 1 ? num * 100 : num
  if (scaled < 0 || scaled > 100) return null
  return scaled
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getString(value: Record<string, unknown>, key: string): string | null {
  const v = value[key]
  if (typeof v === 'string' && v.trim().length > 0) return v
  return null
}

export function getNumber(value: Record<string, unknown>, key: string): number | null {
  const v = value[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}