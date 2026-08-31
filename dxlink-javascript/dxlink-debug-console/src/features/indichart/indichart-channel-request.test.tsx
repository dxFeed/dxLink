import { ThemeProvider } from '@mui/material/styles'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { IndiChartChannelRequest } from './indichart-channel-request'
import type { IndiChartRequest } from './types'
import { theme } from '../../app/theme'

/**
 * Controlled harness mirroring how `channels-area` drives this form, so a removal is
 * exercised through a real state round-trip rather than a stubbed `onChange`.
 */
const Harness = ({
  initial,
  onState,
}: {
  initial: IndiChartRequest
  onState: (value: IndiChartRequest) => void
}) => {
  const [value, setValue] = useState(initial)
  return (
    <ThemeProvider theme={theme}>
      <IndiChartChannelRequest
        value={value}
        onChange={(next) => {
          setValue(next)
          onState(next)
        }}
      />
    </ThemeProvider>
  )
}

const entry = (id: string, code: string) => ({ id, code })

const editors = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.ace_editor')]

/**
 * Tag the mounted editor elements so they can be identified again after a re-render.
 * Ace draws its text through a virtual renderer driven by real layout measurements, which
 * jsdom does not provide — `.ace_content` is empty here — so the editors are told apart by
 * DOM node identity rather than by the script they display.
 */
const tagEditors = (names: string[]): void =>
  editors().forEach((el, index) => {
    el.dataset.probe = names[index]
  })

const editorTags = (): (string | undefined)[] => editors().map((el) => el.dataset.probe)

describe('IndiChartChannelRequest', () => {
  it('keeps each editor with its own entry when one is removed', () => {
    // Regression guard. Cards are keyed by `entry.id`. Under an index key React reuses the
    // mounted editor instances for the entries that shift down: removing the middle card
    // would unmount the *third* editor and hand the third entry to the second entry's
    // instance.
    //
    // Passing `script` makes the editor controlled, which repairs the common case on its
    // own — a reused instance is corrected by the prop. It cannot repair an entry whose
    // code is empty, since `script` is then `undefined` and the editor is left holding
    // whatever the previous entry put there. The id key is what makes that unreachable,
    // so it is worth pinning down directly.
    let latest: IndiChartRequest | null = null
    render(
      <Harness
        initial={{
          indicators: [entry('a', 'SCRIPT_A'), entry('b', 'SCRIPT_B'), entry('c', 'SCRIPT_C')],
        }}
        onState={(value) => {
          latest = value
        }}
      />
    )

    expect(editors()).toHaveLength(3)
    tagEditors(['a', 'b', 'c'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove indicator 2' }))

    // Half one: the state drops the right entry. This passes under either keying strategy.
    expect(latest).not.toBeNull()
    expect(latest!.indicators.map((i) => i.code)).toEqual(['SCRIPT_A', 'SCRIPT_C'])

    // Half two: the surviving editors are the ones belonging to entries a and c. This is
    // the half that catches an index key, which would leave a and b mounted instead.
    expect(editorTags()).toEqual(['a', 'c'])
  })

  it('hides the remove button when a single indicator is left', () => {
    render(<Harness initial={{ indicators: [entry('a', 'SCRIPT_A')] }} onState={() => undefined} />)

    expect(screen.queryByRole('button', { name: /remove indicator/i })).toBeNull()
  })
})
