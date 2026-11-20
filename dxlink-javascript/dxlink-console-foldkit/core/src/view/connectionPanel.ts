import { Array, Match, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { DXLinkConnectionState } from '@dxfeed/dxlink-api'

import type { ChannelStatus } from '../channel/plugin'
import * as Kit from '../kit'
import { Message } from '../message'
import { type ClientStatus, type Model, Session } from '../model'
import { errorCenter } from './errorCenter'

/** The connection as the panel shows it: no session reads the same as a closed socket. */
const connectionOf = (session: Session): DXLinkConnectionState =>
  Session.match(session, {
    Idle: () => DXLinkConnectionState.NOT_CONNECTED,
    Opening: () => DXLinkConnectionState.CONNECTING,
    Open: ({ status }) => status.connection,
  })

const maybeStatusOf = (session: Session): Option.Option<ClientStatus> =>
  session._tag === 'Open' ? Option.some(session.status) : Option.none()

const statusChip = (connection: DXLinkConnectionState): ChannelStatus =>
  Match.value(connection).pipe(
    Match.withReturnType<ChannelStatus>(),
    Match.when(DXLinkConnectionState.NOT_CONNECTED, () => ({
      label: 'Not connected',
      tone: 'Neutral',
    })),
    Match.when(DXLinkConnectionState.CONNECTING, () => ({
      label: 'Connecting…',
      tone: 'Warning',
    })),
    Match.when(DXLinkConnectionState.CONNECTED, () => ({
      label: 'Connected',
      tone: 'Success',
    })),
    Match.exhaustive
  )

const infoLine = (label: string, value: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(`text-xs leading-snug ${Kit.MUTED_TEXT_CLASS}`)],
    [h.span([h.Class('font-semibold text-zinc-900 dark:text-zinc-100')], [label]), `: ${value}`]
  )

/**
 * Connection panel. The URL and keepalive fields are drafts seeded from the configuration
 * profile, which can also pin a field: a pinned field renders read-only rather than hidden,
 * since which endpoint you are talking to is worth seeing even when the deployment fixed it.
 */
export const connectionPanel = (model: Model, h: HtmlBuilder<Message>): Html => {
  const connection = connectionOf(model.session)
  const maybeDetails = Option.flatMap(maybeStatusOf(model.session), (status) => status.maybeDetails)
  const isConnected = connection === DXLinkConnectionState.CONNECTED
  const isConnecting = connection === DXLinkConnectionState.CONNECTING
  const isFrozen = isConnected || isConnecting
  const isUrlPinned = Array.contains(model.config.locked, 'wsUrl')
  const isKeepalivePinned = Array.contains(model.config.locked, 'keepalive')
  const status = statusChip(connection)

  return h.section(
    [h.Class(Kit.CARD_CLASS), h.AriaLabel('Connection')],
    [
      h.div(
        [h.Class('flex flex-col gap-4 p-4')],
        [
          h.div(
            [h.Class('flex items-center justify-between gap-2')],
            [h.h2([h.Class('font-bold')], ['Connection']), Kit.chip(status.label, status.tone, h)]
          ),
          Kit.textField(
            {
              id: 'dxlink-ws-url',
              label: 'WebSocket URL',
              value: model.form.url,
              onInput: (value) => Message.UpdatedConnectionField({ field: 'Url', value }),
              isDisabled: isFrozen || isUrlPinned,
              ...(isUrlPinned ? { helperText: 'Fixed by this deployment.' } : {}),
            },
            h
          ),
          h.div(
            [h.Class('grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4')],
            [
              Kit.textField(
                {
                  id: 'dxlink-keepalive-interval',
                  label: 'Keepalive interval, s',
                  value: model.form.keepaliveInterval,
                  onInput: (value) =>
                    Message.UpdatedConnectionField({
                      field: 'KeepaliveInterval',
                      value,
                    }),
                  isDisabled: isFrozen || isKeepalivePinned,
                },
                h
              ),
              Kit.textField(
                {
                  id: 'dxlink-keepalive-timeout',
                  label: 'Keepalive timeout, s',
                  value: model.form.keepaliveTimeout,
                  onInput: (value) =>
                    Message.UpdatedConnectionField({
                      field: 'KeepaliveTimeout',
                      value,
                    }),
                  isDisabled: isFrozen || isKeepalivePinned,
                },
                h
              ),
              Kit.textField(
                {
                  id: 'dxlink-accept-keepalive',
                  label: 'Accept keepalive, s',
                  value: model.form.acceptKeepalive,
                  onInput: (value) =>
                    Message.UpdatedConnectionField({
                      field: 'AcceptKeepalive',
                      value,
                    }),
                  isDisabled: isFrozen || isKeepalivePinned,
                },
                h
              ),
              Kit.textField(
                {
                  id: 'dxlink-server-keepalive',
                  label: 'Server keepalive, s',
                  value: Option.match(
                    Option.flatMap(maybeDetails, (details) => details.maybeServerKeepaliveTimeout),
                    { onNone: () => '', onSome: globalThis.String }
                  ),
                  isDisabled: true,
                },
                h
              ),
            ]
          ),
        ]
      ),
      h.div(
        [h.Class(`flex flex-wrap items-center gap-x-4 gap-y-3 border-t p-4 ${Kit.DIVIDER_CLASS}`)],
        [
          h.div(
            [h.Class('min-w-[200px] grow')],
            isConnected
              ? [
                  infoLine(
                    'Client version',
                    Option.match(maybeDetails, {
                      onNone: () => '—',
                      onSome: (details) => details.clientVersion,
                    }),
                    h
                  ),
                  infoLine(
                    'Server version',
                    Option.getOrElse(
                      Option.flatMap(maybeDetails, (details) => details.maybeServerVersion),
                      () => '—'
                    ),
                    h
                  ),
                ]
              : []
          ),
          h.div(
            [h.Class('flex items-center gap-2')],
            [
              errorCenter(
                {
                  errors: model.errorLog.errors,
                  onClear: Message.ClickedClearConnectionErrors(),
                  scope: 'Connection',
                  size: 'Medium',
                },
                h
              ),
              Kit.button(
                {
                  label: Match.value(connection).pipe(
                    Match.when(DXLinkConnectionState.NOT_CONNECTED, () => 'Connect'),
                    Match.when(DXLinkConnectionState.CONNECTING, () => 'Connecting…'),
                    Match.when(DXLinkConnectionState.CONNECTED, () => 'Reconnect'),
                    Match.exhaustive
                  ),
                  onClick: isConnected ? Message.ClickedReconnect() : Message.ClickedConnect(),
                  variant: 'Primary',
                  isDisabled: isConnecting,
                },
                h
              ),
              Kit.button(
                {
                  label: 'Disconnect',
                  onClick: Message.ClickedDisconnect(),
                  isDisabled: model.session._tag === 'Idle',
                },
                h
              ),
            ]
          ),
        ]
      ),
    ]
  )
}
