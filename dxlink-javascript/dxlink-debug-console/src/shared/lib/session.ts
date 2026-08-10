/**
 * dxScript SESSION parameter format.
 *
 * A session is a trading window, optionally restricted to weekdays:
 *   `0930-1600`        — 09:30 to 16:00, every day
 *   `0930-1600:12345`  — the same window, Monday to Friday
 *
 * Ported from the legacy dxlink-docs `debug-console/parameter-field.tsx`, which held
 * this logic inline. Extracted here so the wire format is unit-tested: it round-trips
 * through a dialog, and a silent parse failure would quietly send the wrong window.
 */

export const SESSION_DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '7', label: 'Sun' },
] as const

/** Every weekday, in order — what an unrestricted session means. */
export const ALL_SESSION_DAYS: string[] = SESSION_DAYS.map((day) => day.value)

export interface SessionParts {
  /** `HH:MM`, as an `<input type="time">` expects. */
  start: string
  /** `HH:MM`, as an `<input type="time">` expects. */
  end: string
  /** Day numbers, `'1'` (Monday) to `'7'` (Sunday). */
  days: string[]
}

/** The window used when opening the editor on a value that does not parse. */
export const DEFAULT_SESSION_PARTS: SessionParts = {
  start: '09:30',
  end: '16:00',
  days: ALL_SESSION_DAYS,
}

const SESSION_PATTERN = /^(\d{2}:?\d{2})-(\d{2}:?\d{2})(?::([1-7]+))?$/

/** Normalize `HHMM` or `HH:MM` to `HH:MM`. */
export const normalizeSessionTime = (value: string | undefined): string => {
  if (value === undefined || value === '') {
    return '00:00'
  }
  const compact = value.replace(':', '')

  return `${compact.slice(0, 2)}:${compact.slice(2, 4)}`
}

const isValidSessionTime = (value: string): boolean => {
  const [hour, minute] = value.split(':').map(Number)
  if (hour === undefined || minute === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    return false
  }

  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

/**
 * Parse a session string into editable parts, or `undefined` when it is not a session
 * (in which case the editor falls back to raw text so the value is never mangled).
 *
 * An omitted day list means every day.
 */
export const parseSession = (value: string): SessionParts | undefined => {
  const match = SESSION_PATTERN.exec(value.trim())
  if (match === null) {
    return undefined
  }

  const [, start, end, days] = match
  const normalizedStart = normalizeSessionTime(start)
  const normalizedEnd = normalizeSessionTime(end)
  if (!isValidSessionTime(normalizedStart) || !isValidSessionTime(normalizedEnd)) {
    return undefined
  }

  return {
    start: normalizedStart,
    end: normalizedEnd,
    days: days !== undefined ? [...new Set(days.split(''))] : ALL_SESSION_DAYS,
  }
}

/**
 * Render parts back to the wire format. The day suffix is omitted when every day is
 * selected — and also when none is, since an empty restriction is not expressible.
 */
export const formatSession = ({ start, end, days }: SessionParts): string => {
  const base = `${start.replace(':', '')}-${end.replace(':', '')}`
  // Filter through SESSION_DAYS so the result is always ordered and deduplicated.
  const selected = ALL_SESSION_DAYS.filter((day) => days.includes(day))

  if (selected.length === 0 || selected.length === SESSION_DAYS.length) {
    return base
  }

  return `${base}:${selected.join('')}`
}
