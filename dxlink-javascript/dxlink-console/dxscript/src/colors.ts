/**
 * dxScript named colors.
 *
 * A COLOR indicator parameter may arrive as a hex string, as a `{ value }` wrapper, or
 * as one of these names. `<input type="color">` accepts only `#rrggbb`, so a name has
 * to be resolved before it reaches the control — otherwise the swatch silently falls
 * back to black and the real value is lost on the next apply.
 *
 * Ported from the legacy dxlink-docs `debug-console/parameter-field-container.tsx`.
 */
export const DXSCRIPT_COLORS: Readonly<Record<string, string>> = {
  BLACK: '#000000',
  SILVER: '#C0C0C0',
  GRAY: '#808080',
  WHITE: '#FFFFFF',
  MAROON: '#800000',
  RED: '#FF0000',
  PURPLE: '#800080',
  FUCHSIA: '#FF00FF',
  MAGENTA: '#FF00FF',
  GREEN: '#008000',
  LIME: '#00FF00',
  OLIVE: '#808000',
  YELLOW: '#FFFF00',
  ORANGE: '#FFA500',
  NAVY: '#000080',
  BLUE: '#0000FF',
  TEAL: '#008080',
  AQUA: '#00FFFF',
  CYAN: '#00FFFF',
  CRIMSON: '#DC143C',
  CORAL: '#FF7F50',
  GOLD: '#FFD700',
  DODGER_BLUE: '#1E90FF',
  SKY_BLUE: '#87CEEB',
  VIOLET: '#EE82EE',
  PINK: '#FFC0CB',
}

const FALLBACK_COLOR = '#000000'

const fromString = (value: string): string => {
  // Hex may carry an alpha channel; `<input type="color">` takes #rrggbb only.
  if (value.startsWith('#')) {
    return value.slice(0, 7)
  }

  return DXSCRIPT_COLORS[value.toUpperCase()] ?? FALLBACK_COLOR
}

/**
 * Resolve any COLOR parameter representation to `#rrggbb`.
 *
 * Accepts a hex string (with or without alpha), a dxScript color name, or a
 * `{ value }` wrapper around either. Anything else resolves to black.
 */
export const toHexColor = (value: unknown): string => {
  if (typeof value === 'string') {
    return fromString(value)
  }

  if (value !== null && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value

    return typeof inner === 'string' ? fromString(inner) : FALLBACK_COLOR
  }

  return FALLBACK_COLOR
}
