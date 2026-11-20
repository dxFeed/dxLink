import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { Combobox, Listbox } from '@foldkit/ui'

import * as Kit from './kit'

/**
 * The smallest app that owns one `Kit.listboxField` and one `Kit.comboboxField` the way a
 * channel package does: a Submodel each, a `Got…Message` each, and a fold each. It stands in
 * for a real form wherever the two Kit fields themselves are under test.
 */
export const Kind = Schema.Literals(['Quote', 'Trade', 'Candle'])
export type Kind = typeof Kind.Type

export const KIND_OPTIONS: ReadonlyArray<Kit.ListboxOption<Kind>> = [
  { value: 'Quote', label: 'Quote events' },
  { value: 'Trade', label: 'Trade events' },
  { value: 'Candle', label: 'Candle events', isDisabled: true },
]

export const SYMBOL_SUGGESTIONS: ReadonlyArray<string> = ['AAPL', 'AMZN', 'MSFT']

const KindListbox = Listbox.create<Kit.ListboxOption<Kind>, Kind>()
const SymbolCombobox = Combobox.create<string>()

export const Model = Schema.Struct({
  maybeKind: Schema.Option(Kind),
  kindListbox: Listbox.Model,
  symbolCombobox: Combobox.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotKindListboxMessage: { message: Listbox.Message },
  GotSymbolComboboxMessage: { message: Combobox.Message },
})
export type Message = typeof Message.Type

export const initialModel: Model = {
  maybeKind: Option.none(),
  kindListbox: Listbox.init({ id: 'fixture-kind' }),
  symbolCombobox: Combobox.init({ id: 'fixture-symbol' }),
}

const foldKindListbox = Update.foldChild({
  update: KindListbox.update,
  read: (model: Model) => Option.some(model.kindListbox),
  write: (model, nextKindListbox) => modifyFields(model, { kindListbox: () => nextKindListbox }),
  toParentMessage: (message) => Message.GotKindListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<Update.Step<Model, Message>, Listbox.OutMessage<Kind>>({
    Selected:
      ({ value }) =>
      (model) => ({ model: modifyFields(model, { maybeKind: () => Option.some(value) }) }),
  }),
})

const foldSymbolCombobox = Update.foldChild({
  update: SymbolCombobox.update,
  read: (model: Model) => Option.some(model.symbolCombobox),
  write: (model, nextSymbolCombobox) =>
    modifyFields(model, { symbolCombobox: () => nextSymbolCombobox }),
  toParentMessage: (message) => Message.GotSymbolComboboxMessage({ message }),
  foldOutMessage: Combobox.OutMessage.match<Update.Step<Model, Message>>({
    Selected: () => (model) => ({ model }),
    ClearedSelection: () => (model) => ({ model }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotKindListboxMessage: ({ message: listboxMessage }) => foldKindListbox(model, listboxMessage),
    GotSymbolComboboxMessage: ({ message: comboboxMessage }) =>
      foldSymbolCombobox(model, comboboxMessage),
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      Kit.listboxField(
        {
          id: model.kindListbox.id,
          label: 'Kind',
          options: KIND_OPTIONS,
          maybeValue: model.maybeKind,
          placeholder: 'Choose a kind',
          helperText: 'What the channel subscribes to.',
          toSubmodel: (viewInputs) =>
            h.submodel({
              slotId: model.kindListbox.id,
              model: model.kindListbox,
              view: KindListbox.view,
              viewInputs,
              toParentMessage: (message) => Message.GotKindListboxMessage({ message }),
            }),
        },
        h
      ),
      Kit.comboboxField(
        {
          id: model.symbolCombobox.id,
          label: 'Symbol',
          inputValue: model.symbolCombobox.inputValue,
          suggestions: SYMBOL_SUGGESTIONS,
          placeholder: 'AAPL',
          helper: [
            'Any symbol, see ',
            h.a([h.Href('https://example.test/symbols')], ['the symbol guide']),
            '.',
          ],
          toSubmodel: (viewInputs) =>
            h.submodel({
              slotId: model.symbolCombobox.id,
              model: model.symbolCombobox,
              view: SymbolCombobox.view,
              viewInputs,
              toParentMessage: (message) => Message.GotSymbolComboboxMessage({ message }),
            }),
        },
        h
      ),
    ]
  )
