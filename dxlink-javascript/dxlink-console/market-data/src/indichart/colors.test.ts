import { describe, expect, it } from 'vitest'

import { DXSCRIPT_COLORS, toHexColor } from './colors'

describe('toHexColor', () => {
  it('resolves dxScript color names, which a color input cannot take directly', () => {
    expect(toHexColor('RED')).toBe('#FF0000')
    expect(toHexColor('DODGER_BLUE')).toBe('#1E90FF')
  })

  it('resolves names case-insensitively', () => {
    expect(toHexColor('red')).toBe('#FF0000')
    expect(toHexColor('Sky_Blue')).toBe('#87CEEB')
  })

  it('passes hex through', () => {
    expect(toHexColor('#1e90ff')).toBe('#1e90ff')
  })

  it('drops an alpha channel a color input would reject', () => {
    expect(toHexColor('#1e90ff80')).toBe('#1e90ff')
  })

  it('unwraps the { value } form the server also sends', () => {
    expect(toHexColor({ value: 'CRIMSON' })).toBe('#DC143C')
    expect(toHexColor({ value: '#abcdef' })).toBe('#abcdef')
  })

  it('falls back to black for anything unusable', () => {
    for (const value of [undefined, null, 42, {}, { value: 7 }, 'NOT_A_COLOR', '']) {
      expect(toHexColor(value)).toBe('#000000')
    }
  })

  it('covers the full dxScript palette', () => {
    expect(Object.keys(DXSCRIPT_COLORS)).toHaveLength(26)
    for (const [name, hex] of Object.entries(DXSCRIPT_COLORS)) {
      expect(hex, name).toMatch(/^#[0-9A-F]{6}$/)
      expect(toHexColor(name)).toBe(hex)
    }
  })
})
