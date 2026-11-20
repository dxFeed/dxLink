import { Array, Option, Record, String, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Dialog } from '@foldkit/ui'

import type { RegisteredChannelPlugin } from '../channel/plugin'
import * as Kit from '../kit'
import { Message } from '../message'
import type { Model } from '../model'
import { channelCard } from './channelCard'

/**
 * Letters whose *name* starts with a vowel sound, so an acronym beginning with one takes
 * "an": an RPC, an FX, an SLA. U is absent — "a U-turn", because its name is "yoo".
 */
const VOWEL_SOUND_LETTERS = 'AEFHILMNORSX'

/**
 * "a" or "an" for a channel label.
 *
 * Pronunciation decides this, not spelling, and the two disagree for exactly the labels this
 * console has: RPC is read "ar-pee-see" and takes "an", while DOM is read as a word and takes
 * "a". So an all-caps label is judged by its first letter's name and anything else by its
 * first letter's sound.
 */
const indefiniteArticle = (label: string): string => {
  const first = String.toUpperCase(label.slice(0, 1))
  const hasVowelSound =
    label === String.toUpperCase(label)
      ? VOWEL_SOUND_LETTERS.includes(first)
      : 'AEIOU'.includes(first)

  return first !== '' && hasVowelSound ? 'an' : 'a'
}

/** "a Feed channel", "an RPC channel", "a Feed, DOM or RPC channel". */
export const formatKindList = (labels: Array.NonEmptyReadonlyArray<string>): string => {
  const last = Array.lastNonEmpty(labels)
  const list = pipe(
    Array.initNonEmpty(labels),
    Array.match({
      onEmpty: () => last,
      onNonEmpty: (leading) => `${Array.join(leading, ', ')} or ${last}`,
    })
  )

  return `${indefiniteArticle(Array.headNonEmpty(labels))} ${list} channel`
}

const requestDialog = <Services>(
  model: Model,
  maybePlugin: Option.Option<RegisteredChannelPlugin<Services>>,
  h: HtmlBuilder<Message>
): Html =>
  h.submodel({
    slotId: model.requestDialog.id,
    model: model.requestDialog,
    view: Dialog.view,
    viewInputs: {
      toView: ({ dialog, backdrop, panel, title, closeButton, isVisible }) =>
        h.dialog(
          [
            ...dialog,
            h.Class(
              'm-0 h-full max-h-none w-full max-w-none bg-transparent p-4 text-zinc-900 backdrop:bg-transparent dark:text-zinc-100'
            ),
          ],
          isVisible
            ? [
                h.div([...backdrop, h.Class('fixed inset-0 bg-black/50')]),
                h.div(
                  [h.Class('flex min-h-full items-center justify-center')],
                  [
                    h.div(
                      [
                        ...panel,
                        h.Class(
                          `relative flex max-h-[calc(100vh-2rem)] w-full flex-col ${Kit.CARD_CLASS} shadow-xl ${Option.match(
                            maybePlugin,
                            {
                              onNone: () => 'max-w-xl',
                              onSome: (plugin) =>
                                plugin.dialogWidth === 'Wide' ? 'max-w-4xl' : 'max-w-xl',
                            }
                          )}`
                        ),
                      ],
                      [
                        h.h2(
                          [...title, h.Class('px-6 py-4 text-lg font-bold')],
                          [
                            Option.match(maybePlugin, {
                              onNone: () => '',
                              onSome: (plugin) => plugin.dialogTitle,
                            }),
                          ]
                        ),
                        h.div(
                          [h.Class(`grow overflow-y-auto border-y px-6 py-4 ${Kit.DIVIDER_CLASS}`)],
                          [
                            Option.match(maybePlugin, {
                              onNone: () => h.empty,
                              onSome: (plugin) =>
                                h.submodel({
                                  slotId: `request-${plugin.kind}`,
                                  model: Record.get(model.requests, plugin.kind).pipe(
                                    Option.getOrUndefined
                                  ),
                                  view: plugin.requestView,
                                  toParentMessage: (message) =>
                                    Message.GotRequestMessage({
                                      pluginId: plugin.kind,
                                      message,
                                    }),
                                }),
                            }),
                          ]
                        ),
                        h.div(
                          [h.Class('flex justify-end gap-2 px-6 py-4')],
                          [
                            h.button(
                              [...closeButton, h.Type('button'), h.Class(Kit.buttonClass('Ghost'))],
                              ['Cancel']
                            ),
                            Kit.button(
                              {
                                label: 'Open channel',
                                onClick: Message.ClickedOpenChannel(),
                                variant: 'Primary',
                                isDisabled: !Option.exists(maybePlugin, (plugin) =>
                                  plugin.canOpen(
                                    Record.get(model.requests, plugin.kind).pipe(
                                      Option.getOrUndefined
                                    )
                                  )
                                ),
                              },
                              h
                            ),
                          ]
                        ),
                      ]
                    ),
                  ]
                ),
              ]
            : []
        ),
    },
    toParentMessage: (message) => Message.GotRequestDialogMessage({ message }),
  })

/**
 * Channels area: the add-channel row, the open channels, and the request dialog.
 *
 * Knows nothing about any particular service. Add-buttons, dialog titles, request forms and
 * channel bodies all come from the registered plugins, so adding or removing a service
 * touches only the composition site.
 *
 * Two filters, doing different jobs: the registered plugins say which services exist in this
 * build, and the profile's channel kinds say which of those this deployment offers. The
 * second filters buttons only — an already-open channel keeps rendering, so a profile that
 * disagrees with what is on screen degrades instead of breaking.
 */
export const channelsArea = <Services>(
  model: Model,
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>,
  h: HtmlBuilder<Message>
): Html => {
  const offered = Option.match(model.config.maybeChannelKinds, {
    onNone: () => plugins,
    onSome: (kinds) => Array.filter(plugins, (plugin) => Array.contains(kinds, plugin.kind)),
  })
  const findPlugin = (kind: string) => Array.findFirst(plugins, (plugin) => plugin.kind === kind)

  return h.section(
    [h.Class('flex flex-col gap-4'), h.AriaLabel('Channels')],
    [
      h.div(
        [h.Class('flex flex-wrap items-center gap-2')],
        [
          h.h2([h.Class('mr-2 text-xl font-bold')], ['Channels']),
          ...Array.map(offered, (plugin) =>
            h.keyed('span')(
              plugin.kind,
              [],
              [
                Kit.button(
                  {
                    label: plugin.label,
                    iconPath: plugin.iconPath,
                    size: 'Small',
                    onClick: Message.ClickedAddChannel({ kind: plugin.kind }),
                  },
                  h
                ),
              ]
            )
          ),
        ]
      ),
      Array.match(model.channels, {
        onEmpty: () =>
          h.div(
            [
              h.Class(
                `flex min-h-40 items-center justify-center rounded-xl border border-dashed p-6 text-center ${Kit.DIVIDER_CLASS} ${Kit.MUTED_TEXT_CLASS}`
              ),
            ],
            [
              Array.match(
                Array.map(offered, (plugin) => plugin.label),
                {
                  onEmpty: () => 'This console is configured with no channel services.',
                  onNonEmpty: (labels) =>
                    `No channels open. Use the buttons above to open ${formatKindList(labels)}.`,
                }
              ),
            ]
          ),
        onNonEmpty: (channels) =>
          h.div(
            [h.Class('flex flex-col gap-4')],
            Array.getSomes(
              Array.map(channels, (channel) =>
                Option.map(findPlugin(channel.kind), (plugin) =>
                  h.keyed('div')(channel.id, [], [channelCard(channel, plugin, h)])
                )
              )
            )
          ),
      }),
      requestDialog(model, Option.flatMap(model.maybeRequestKind, findPlugin), h),
    ]
  )
}
