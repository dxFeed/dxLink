import { Array, Match } from 'effect'
import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Kit } from '@dxfeed/dxlink-console-foldkit-core'

import { Validation } from '../request'
import { Message } from './message'
import { type CallState, type MessageEntry, type Model, canDraft, canSend, isClosed } from './model'

const messageList = (
  title: string,
  entries: ReadonlyArray<MessageEntry>,
  emptyText: string,
  h: HtmlBuilder<Message>
): Html =>
  h.div(
    [h.Role('group'), h.AriaLabel(title), h.Class('flex flex-col gap-2')],
    [
      h.div(
        [h.Class('flex items-baseline gap-2')],
        [
          h.h4([h.Class('text-sm font-semibold')], [title]),
          h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], [globalThis.String(entries.length)]),
        ]
      ),
      Array.match(entries, {
        onEmpty: () => h.p([h.Class(`text-sm ${Kit.MUTED_TEXT_CLASS}`)], [emptyText]),
        onNonEmpty: (nonEmptyEntries) =>
          h.ul(
            [h.Class('flex flex-col gap-2')],
            Array.map(nonEmptyEntries, (entry) =>
              h.keyed('li')(
                globalThis.String(entry.id),
                [h.Class('flex flex-col gap-1')],
                [
                  h.span([h.Class(`text-xs ${Kit.MUTED_TEXT_CLASS}`)], [entry.time]),
                  Kit.jsonBlock(entry.json, h),
                ]
              )
            )
          ),
      }),
    ]
  )

/**
 * Send box of a bidirectional call — the only model where the client keeps talking after
 * the channel is open. Nothing can be sent once the call has completed or failed: the
 * channel is gone.
 */
const sendRequestView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('flex flex-col gap-2')],
    [
      Kit.textArea(
        {
          id: `dxlink-rpc-send-${model.channelId}`,
          label: 'Send another request',
          value: model.sendJson,
          rows: 4,
          onInput: (value) => Message.UpdatedSendJson({ value }),
          isDisabled: !canDraft(model),
        },
        h
      ),
      Validation.match(model.sendValidation, {
        Pending: () => h.empty,
        Valid: () => h.empty,
        Invalid: ({ error }) => Kit.notice(error, 'Danger', h),
      }),
      h.div(
        [],
        [
          Kit.button(
            {
              label: 'Send',
              onClick: Message.ClickedSend(),
              variant: 'Primary',
              isDisabled: !canSend(model),
            },
            h
          ),
        ]
      ),
    ]
  )

const noResponseText = (callState: CallState): string =>
  Match.value(callState).pipe(
    Match.when('Completed', () => 'The server closed the channel without a response.'),
    Match.when('Failed', () => 'The call failed without a response.'),
    Match.when('Closed', () => 'The channel was closed without a response.'),
    Match.whenOr('Opening', 'Active', () => 'Waiting for the first response…'),
    Match.exhaustive
  )

/** RPC channel — one method of a protobuf service, bound to the connection. */
export const view = Submodel.defineView<Model, Message>((model, h) =>
  h.div(
    [h.Class('flex flex-col gap-4')],
    [
      h.div(
        [h.Class('flex flex-wrap gap-1')],
        [
          Kit.chip(model.config.modelLabel, 'Neutral', h),
          Kit.chip(`in: ${model.config.inputTypeName}`, 'Neutral', h),
          Kit.chip(`out: ${model.config.outputTypeName}`, 'Neutral', h),
        ]
      ),
      isClosed(model) ? Kit.notice('The channel is closed.', 'Neutral', h) : h.empty,
      model.config.isBidirectional && !isClosed(model) ? sendRequestView(model, h) : h.empty,
      messageList('Sent', model.requests, 'Nothing sent yet.', h),
      messageList('Received', model.responses, noResponseText(model.callState), h),
    ]
  )
)
