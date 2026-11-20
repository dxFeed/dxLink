import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { MAX_ERRORS, type TimestampedError } from '../error'
import * as Kit from '../kit'

/**
 * A button that discloses a list of protocol errors, newest first.
 *
 * Used at both scopes: the connection panel passes the connection's errors, and each channel
 * card passes its own. Renders nothing when there is nothing to report.
 *
 * The count is the label: "1 error" reads as a sentence where a bare badge needs the button
 * to explain it.
 */
export const errorCenter = <Message>(
  config: Readonly<{
    errors: ReadonlyArray<TimestampedError>
    onClear: Message
    /** The scope these errors belong to, named in the heading. */
    scope: string
    size: 'Small' | 'Medium'
  }>,
  h: HtmlBuilder<Message>
): Html =>
  Array.match(config.errors, {
    onEmpty: () => h.empty,
    onNonEmpty: (errors) =>
      h.details(
        [h.Class('group relative')],
        [
          h.summary(
            [
              h.Class(
                `${Kit.buttonClass('Danger', config.size)} cursor-pointer list-none [&::-webkit-details-marker]:hidden`
              ),
            ],
            [Kit.icon(Kit.ICON_ERROR, h), `${errors.length} error${errors.length === 1 ? '' : 's'}`]
          ),
          h.div(
            [
              h.Class(
                `absolute right-0 z-20 mt-2 w-[420px] max-w-[90vw] text-left ${Kit.CARD_CLASS} shadow-lg`
              ),
            ],
            [
              h.div(
                [h.Class('flex items-center justify-between gap-4 px-4 py-2')],
                [
                  h.span([h.Class('text-sm font-bold')], [`${config.scope} errors`]),
                  Kit.button(
                    {
                      label: 'Clear',
                      onClick: config.onClear,
                      variant: 'Ghost',
                      size: 'Small',
                    },
                    h
                  ),
                ]
              ),
              // NOTE: bounded in height because a rejected batch subscription can report
              // hundreds of errors at once, which would otherwise push Clear off screen.
              h.ul(
                [
                  h.Class(
                    `max-h-80 divide-y overflow-y-auto border-t ${Kit.DIVIDER_CLASS} divide-zinc-200 dark:divide-zinc-800`
                  ),
                ],
                Array.map(errors, (error) =>
                  h.keyed('li')(
                    globalThis.String(error.id),
                    [h.Class('flex gap-3 px-4 py-2.5')],
                    [
                      h.span(
                        [h.Class('mt-0.5 text-red-600 dark:text-red-400')],
                        [Kit.icon(Kit.ICON_ERROR, h, 'size-5')]
                      ),
                      h.div(
                        [h.Class('min-w-0')],
                        [
                          h.div(
                            [h.Class('flex flex-wrap items-baseline gap-2')],
                            [
                              h.span(
                                [
                                  h.Class(
                                    'font-mono text-xs font-bold text-red-600 dark:text-red-400'
                                  ),
                                ],
                                [error.type]
                              ),
                              h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], [error.time]),
                            ]
                          ),
                          h.p([h.Class('text-sm [overflow-wrap:anywhere]')], [error.message]),
                        ]
                      ),
                    ]
                  )
                )
              ),
              errors.length >= MAX_ERRORS
                ? h.p(
                    [h.Class(`border-t p-3 text-xs ${Kit.DIVIDER_CLASS} ${Kit.MUTED_TEXT_CLASS}`)],
                    [`Showing the most recent ${MAX_ERRORS}; older errors were dropped.`]
                  )
                : h.empty,
            ]
          ),
        ]
      ),
  })
