import { Array, Option, Record, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import type { ChannelSummary, RegisteredChannelPlugin } from '../channel/plugin'
import { channelElementId } from '../command'
import * as Kit from '../kit'
import { Message } from '../message'
import type { ChannelEntry } from '../model'
import { errorCenter } from './errorCenter'

const EMPTY_SUMMARY: ChannelSummary = {
  subtitle: '',
  maybeStatus: Option.none(),
  maybeChannelId: Option.none(),
  parameters: {},
  errors: [],
}

/**
 * The card every channel sits in: a header rendered from the plugin's summary, and the
 * plugin's own view as the body.
 *
 * Closing does not remove the card. It stays as a header-only record marked "closed", and it
 * cannot be reopened. A collapsed card keeps its body in the DOM, hidden, so anything a
 * channel draws imperatively — a chart — survives being collapsed.
 */
export const channelCard = <Services>(
  channel: ChannelEntry,
  plugin: RegisteredChannelPlugin<Services>,
  h: HtmlBuilder<Message>
): Html => {
  const summary = Option.getOrElse(plugin.summarize(channel.model), () => EMPTY_SUMMARY)
  const subheader = pipe(
    [
      Option.liftPredicate(summary.subtitle, (subtitle) => subtitle !== ''),
      Option.map(summary.maybeChannelId, (channelId) => `channel #${channelId}`),
    ],
    Array.getSomes,
    Array.join(' · ')
  )
  const parameters = Record.toEntries(summary.parameters)

  return h.section(
    [
      h.Id(channelElementId(channel.id)),
      h.Class(`scroll-mt-20 ${Kit.CARD_CLASS}`),
      h.AriaLabel(channel.title),
    ],
    [
      h.header(
        [h.Class('flex items-center gap-3 p-4')],
        [
          h.span(
            [
              h.Class(
                channel.isClosed
                  ? 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                  : 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100'
              ),
            ],
            [Kit.icon(plugin.iconPath, h, 'size-5')]
          ),
          h.div(
            [h.Class('min-w-0 grow')],
            [
              h.h3(
                [h.Class(channel.isClosed ? `font-bold ${Kit.MUTED_TEXT_CLASS}` : 'font-bold')],
                [channel.title]
              ),
              subheader === ''
                ? h.empty
                : h.p([h.Class(`truncate text-sm ${Kit.MUTED_TEXT_CLASS}`)], [subheader]),
            ]
          ),
          channel.isClosed
            ? Kit.chip('closed', 'Neutral', h)
            : h.div(
                [h.Class('flex items-center gap-1')],
                [
                  errorCenter(
                    {
                      errors: summary.errors,
                      onClear: Message.ClickedClearChannelErrors({
                        channelId: channel.id,
                      }),
                      scope: 'Channel',
                      size: 'Small',
                    },
                    h
                  ),
                  Option.match(summary.maybeStatus, {
                    onNone: () => h.empty,
                    onSome: (status) => Kit.chip(status.label, status.tone, h),
                  }),
                  Kit.iconButton(
                    {
                      label: channel.isExpanded ? 'Collapse' : 'Expand',
                      iconPath: Kit.ICON_CHEVRON_DOWN,
                      iconClass: channel.isExpanded
                        ? 'size-5 rotate-180 transition-transform'
                        : 'size-5 transition-transform',
                      onClick: Message.ClickedToggleChannel({
                        channelId: channel.id,
                      }),
                    },
                    h
                  ),
                  Kit.iconButton(
                    {
                      label: 'Close channel',
                      iconPath: Kit.ICON_CLOSE,
                      onClick: Message.ClickedCloseChannel({
                        channelId: channel.id,
                      }),
                    },
                    h
                  ),
                ]
              ),
        ]
      ),
      channel.isClosed
        ? h.empty
        : h.div(
            [h.Class(channel.isExpanded ? 'px-4 pb-4' : 'hidden px-4 pb-4')],
            [
              Array.match(parameters, {
                onEmpty: () => h.empty,
                onNonEmpty: (entries) =>
                  h.ul(
                    [h.Class('mb-4 flex flex-wrap gap-1')],
                    Array.map(entries, ([key, text]) =>
                      h.keyed('li')(
                        key,
                        [h.Class('max-w-full')],
                        [Kit.chip(`${key}: ${text}`, 'Neutral', h)]
                      )
                    )
                  ),
              }),
              h.submodel({
                slotId: `channel-${channel.id}`,
                model: channel.model,
                view: plugin.channelView,
                toParentMessage: (message) =>
                  Message.GotChannelMessage({ channelId: channel.id, message }),
              }),
            ]
          ),
    ]
  )
}
