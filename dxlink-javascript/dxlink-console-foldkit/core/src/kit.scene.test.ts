import { Option } from 'effect'
import {
  Command,
  Mount,
  all,
  click,
  expect,
  expectAll,
  given,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { expect as assert, describe, test } from 'vitest'

import { Combobox, Listbox } from '@foldkit/ui'

import * as Kit from './kit'
import { type Kind, SYMBOL_SUGGESTIONS, initialModel, update, view } from './kit.fixture'

/**
 * The fixture's Combobox renders its toggle button from the first frame, and that button
 * carries a Mount of its own, so every Scene over the fixture answers it before anything else.
 */
const acknowledgeToggleButton = Mount.resolve(
  Combobox.AttachComboboxPreventBlur,
  Combobox.Message.CompletedAttachComboboxPreventBlur()
)

describe('listboxField', () => {
  const trigger = role('button', { name: 'Kind' })

  test('the label names the button, which shows the placeholder until something is chosen', () => {
    scene(
      { update, view },
      given(initialModel),
      acknowledgeToggleButton,
      expect(trigger).toHaveText('Choose a kind'),
      expect(trigger).toHaveAttr('aria-expanded', 'false'),
      expect(trigger).toHaveAccessibleDescription('What the channel subscribes to.'),
      expect(role('listbox')).toBeAbsent()
    )
  })

  test('opens a list of the options and takes the one that is picked', () => {
    scene(
      { update, view },
      given(initialModel),
      acknowledgeToggleButton,
      click(trigger),
      Command.resolve(Listbox.FocusItems, Listbox.Message.CompletedFocusItems()),
      Mount.resolveAll(
        [Listbox.AnchorListbox, Listbox.Message.CompletedAnchorListbox()],
        [Listbox.PortalListboxBackdrop, Listbox.Message.CompletedPortalListboxBackdrop()]
      ),
      expectAll(all.role('option')).toHaveCount(3),
      expect(role('option', { name: 'Candle events' })).toHaveAttr('aria-disabled', 'true'),
      click(role('option', { name: 'Trade events' })),
      Command.resolve(Listbox.FocusButton, Listbox.Message.CompletedFocusButton()),
      Mount.expectEnded(Listbox.AnchorListbox, Listbox.PortalListboxBackdrop),
      expect(role('listbox')).toBeAbsent(),
      expect(trigger).toHaveText('Trade events')
    )
  })

  test('marks the chosen option when the list is opened again', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { maybeKind: () => Option.some<Kind>('Quote') })),
      acknowledgeToggleButton,
      click(trigger),
      Command.resolve(Listbox.FocusItems, Listbox.Message.CompletedFocusItems()),
      Mount.resolveAll(
        [Listbox.AnchorListbox, Listbox.Message.CompletedAnchorListbox()],
        [Listbox.PortalListboxBackdrop, Listbox.Message.CompletedPortalListboxBackdrop()]
      ),
      expect(role('option', { name: 'Quote events' })).toHaveAttr('data-selected'),
      expect(role('option', { name: 'Trade events' })).not.toHaveAttr('data-selected')
    )
  })
})

describe('comboboxField', () => {
  const input = label('Symbol')

  test('is a labelled input with its help line', () => {
    scene(
      { update, view },
      given(initialModel),
      acknowledgeToggleButton,
      expect(input).toHaveValue(''),
      expect(input).toHaveAttr('placeholder', 'AAPL'),
      expect(input).toHaveAccessibleDescription('Any symbol, see the symbol guide.'),
      expect(role('link', { name: 'the symbol guide' })).toExist(),
      expect(role('listbox')).toBeAbsent()
    )
  })

  test('typing narrows the suggestions, and picking one writes it into the input', () => {
    scene(
      { update, view },
      given(initialModel),
      acknowledgeToggleButton,
      type(input, 'a'),
      Mount.resolveAll(
        [Combobox.AnchorCombobox, Combobox.Message.CompletedAnchorCombobox()],
        [Combobox.PortalComboboxBackdrop, Combobox.Message.CompletedPortalComboboxBackdrop()]
      ),
      expectAll(all.role('option')).toHaveCount(3),
      expect(role('option', { name: 'MSFT' })).toBeAbsent(),
      click(role('option', { name: 'AMZN' })),
      Command.resolve(Combobox.FocusInput, Combobox.Message.CompletedFocusInput()),
      Mount.expectEnded(Combobox.AnchorCombobox, Combobox.PortalComboboxBackdrop),
      expect(role('listbox')).toBeAbsent(),
      expect(input).toHaveValue('AMZN')
    )
  })

  test('text that matches no suggestion stays as typed', () => {
    scene(
      { update, view },
      given(initialModel),
      acknowledgeToggleButton,
      type(input, 'EUR/USD'),
      expect(role('listbox')).toBeAbsent(),
      expect(input).toHaveValue('EUR/USD'),
      expect(text('Any symbol, see ', { exact: false })).toExist()
    )
  })
})

describe('filterSuggestions', () => {
  test('offers everything for an empty field', () => {
    assert(Kit.filterSuggestions(SYMBOL_SUGGESTIONS, '')).toEqual(SYMBOL_SUGGESTIONS)
  })

  test('puts what is typed first, so committing the first item never changes it', () => {
    assert(Kit.filterSuggestions(SYMBOL_SUGGESTIONS, 'ms')).toEqual(['ms', 'MSFT'])
    assert(Kit.filterSuggestions(SYMBOL_SUGGESTIONS, ' a ')).toEqual([' a ', 'AAPL', 'AMZN'])
  })

  test('offers nothing for text no suggestion contains', () => {
    assert(Kit.filterSuggestions(SYMBOL_SUGGESTIONS, 'zz')).toEqual([])
  })

  test('follows an exact pick with every other suggestion', () => {
    assert(Kit.filterSuggestions(SYMBOL_SUGGESTIONS, 'MSFT')).toEqual([
      'MSFT',
      ...SYMBOL_SUGGESTIONS.filter((symbol) => symbol !== 'MSFT'),
    ])
  })
})

describe('withComboboxText', () => {
  test('puts the text in the input of a closed Combobox', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          symbolCombobox: (combobox) => Kit.withComboboxText(combobox, 'IBM'),
        })
      ),
      acknowledgeToggleButton,
      expect(label('Symbol')).toHaveValue('IBM'),
      expect(role('listbox')).toBeAbsent()
    )
  })
})
