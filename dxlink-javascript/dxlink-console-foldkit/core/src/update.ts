import { Array, Option, Record, Redacted, String, pipe } from 'effect'
import { Command, Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import { Dialog, Popover } from '@foldkit/ui'

import type { RegisteredChannelPlugin } from './channel/plugin'
import type { DxLinkClientService } from './client'
import {
  ReconnectClient,
  ScrollToChannel,
  SetAuthToken,
  StampAcquireFailure,
  channelElementId,
} from './command'
import type { ConsoleConfig } from './domain/config'
import { clearErrors, emptyErrorLog, prependError } from './domain/error'
import { Message } from './message'
import {
  ChannelCard,
  type ChannelEntry,
  type ClientParams,
  type ClientStatus,
  type ConnectionField,
  type ConnectionForm,
  type Model,
  Session,
} from './model'

export const REQUEST_DIALOG_ID = 'dxlink-channel-request'

export const CONNECTION_ERROR_POPOVER_ID = 'dxlink-connection-errors'

/** The id of one card's error list, unique on the page because the card's id is. */
export const channelErrorPopoverId = (channelId: string): string =>
  `${channelElementId(channelId)}-errors`

const DIGITS_ONLY = /[^0-9]/g

const toNumber = (draft: string): number => {
  const parsed = Number(draft)

  return Number.isFinite(parsed) ? parsed : 0
}

const toClientParams = (form: ConnectionForm): ClientParams => ({
  url: form.url.trim(),
  keepaliveInterval: toNumber(form.keepaliveInterval),
  keepaliveTimeout: toNumber(form.keepaliveTimeout),
  acceptKeepaliveTimeout: toNumber(form.acceptKeepalive),
})

/** The keepalive fields take seconds, so anything but a digit is dropped as it is typed. */
const updateForm = (
  form: ConnectionForm,
  field: ConnectionField,
  value: string
): ConnectionForm => {
  const digits = value.replace(DIGITS_ONLY, '')

  return modifyFields(form, {
    url: (url) => (field === 'Url' ? value : url),
    keepaliveInterval: (interval) => (field === 'KeepaliveInterval' ? digits : interval),
    keepaliveTimeout: (timeout) => (field === 'KeepaliveTimeout' ? digits : timeout),
    acceptKeepalive: (accept) => (field === 'AcceptKeepalive' ? digits : accept),
  })
}

const isAuthorized = (status: ClientStatus): boolean =>
  Option.contains(status.maybeAuth, DXLinkAuthState.AUTHORIZED)

const withStatus = (session: Session, status: ClientStatus): Session =>
  Session.match(session, {
    Idle: () => session,
    Opening: () => session,
    Open: (open) =>
      Session.Open({
        sessionId: open.sessionId,
        params: open.params,
        status,
        hasAuthorized: open.hasAuthorized || isAuthorized(status),
      }),
  })

const findPlugin = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>,
  kind: string
): Option.Option<RegisteredChannelPlugin<Services>> =>
  Array.findFirst(plugins, (plugin) => plugin.kind === kind)

const findChannel = (model: Model, channelId: string): Option.Option<ChannelEntry> =>
  Array.findFirst(model.channels, (channel) => channel.id === channelId)

const writeChannel = (model: Model, nextChannel: ChannelEntry): Model =>
  modifyFields(model, {
    channels: Array.map((channel) => (channel.id === nextChannel.id ? nextChannel : channel)),
  })

const foldErrorPopoverOutMessage = Popover.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model }),
})

const readConnectionErrorPopover = (model: Model) => Option.some(model.errorPopover)
const writeConnectionErrorPopover = (model: Model, nextErrorPopover: Popover.Model): Model =>
  modifyFields(model, { errorPopover: () => nextErrorPopover })
const toConnectionErrorPopoverMessage = (message: Popover.Message): Message =>
  Message.GotConnectionErrorPopoverMessage({ message })

const foldConnectionErrorPopover = Update.foldChild({
  update: Popover.update,
  read: readConnectionErrorPopover,
  write: writeConnectionErrorPopover,
  toParentMessage: toConnectionErrorPopoverMessage,
  foldOutMessage: foldErrorPopoverOutMessage,
})

const foldConnectionErrorPopoverClose = Update.foldChildStep({
  update: Popover.close,
  read: readConnectionErrorPopover,
  write: writeConnectionErrorPopover,
  toParentMessage: toConnectionErrorPopoverMessage,
  foldOutMessage: foldErrorPopoverOutMessage,
})

/** Only an open card has an error list: a closed card, or no card at all, reads as `None`. */
const readChannelErrorPopover = (model: Model, channelId: string): Option.Option<Popover.Model> =>
  Option.flatMap(findChannel(model, channelId), (channel) =>
    ChannelCard.match(channel.card, {
      Open: ({ errorPopover }) => Option.some(errorPopover),
      Closed: () => Option.none(),
    })
  )

const writeChannelErrorPopover = (
  model: Model,
  channelId: string,
  nextErrorPopover: Popover.Model
): Model =>
  modifyFields(model, {
    channels: Array.map((channel) =>
      channel.id === channelId
        ? modifyFields(channel, {
            card: (card) =>
              ChannelCard.match(card, {
                Open: ({ isExpanded }) =>
                  ChannelCard.Open({ isExpanded, errorPopover: nextErrorPopover }),
                Closed: () => card,
              }),
          })
        : channel
    ),
  })

const toChannelErrorPopoverMessage = (channelId: string, message: Popover.Message): Message =>
  Message.GotChannelErrorPopoverMessage({ channelId, message })

const foldChannelErrorPopover = Update.foldChildAt({
  update: Popover.update,
  readAt: readChannelErrorPopover,
  writeAt: writeChannelErrorPopover,
  toParentMessage: toChannelErrorPopoverMessage,
  foldOutMessage: () => foldErrorPopoverOutMessage,
})

const foldChannelErrorPopoverClose = (channelId: string) =>
  Update.foldChildStep({
    update: Popover.close,
    read: (model: Model) => readChannelErrorPopover(model, channelId),
    write: (model: Model, nextErrorPopover: Popover.Model) =>
      writeChannelErrorPopover(model, channelId, nextErrorPopover),
    toParentMessage: (message: Popover.Message) => toChannelErrorPopoverMessage(channelId, message),
    foldOutMessage: foldErrorPopoverOutMessage,
  })

const toChannelMessage =
  (channelId: string) =>
  (message: unknown): Message =>
    Message.GotChannelMessage({ channelId, message })

const toRequestMessage =
  (pluginId: string) =>
  (message: unknown): Message =>
    Message.GotRequestMessage({ pluginId, message })

export const makeUpdate = <Services>(plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>) => {
  type UpdateReturn = Update.Return<Model, Message, Services | DxLinkClientService>

  const foldRequestDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
    Opened: () => (model) => ({ model }),
    Closed: () => (model) => ({
      model: modifyFields(model, { maybeRequestKind: () => Option.none() }),
    }),
  })

  const readRequestDialog = (model: Model) => Option.some(model.requestDialog)
  const writeRequestDialog = (model: Model, nextRequestDialog: Dialog.Model): Model =>
    modifyFields(model, { requestDialog: () => nextRequestDialog })
  const toRequestDialogMessage = (message: Dialog.Message): Message =>
    Message.GotRequestDialogMessage({ message })

  const foldRequestDialog = Update.foldChild({
    update: Dialog.update,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  const foldRequestDialogOpen = Update.foldChildStep({
    update: Dialog.open,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  const foldRequestDialogClose = Update.foldChildStep({
    update: Dialog.close,
    read: readRequestDialog,
    write: writeRequestDialog,
    toParentMessage: toRequestDialogMessage,
    foldOutMessage: foldRequestDialogOutMessage,
  })

  /**
   * Close one channel's card. The card stays, marked closed, and its plugin says how a closed
   * channel reads; the live channel behind it is released by the Subscription that runs open
   * cards. A card that is already closed, or whose plugin is not registered, is left as it is.
   */
  const closeChannel = (channel: ChannelEntry): ChannelEntry =>
    pipe(
      findPlugin(plugins, channel.kind),
      Option.filter(() => channel.card._tag === 'Open'),
      Option.match({
        onNone: () => channel,
        onSome: (plugin) =>
          modifyFields(channel, {
            card: () => ChannelCard.Closed(),
            model: plugin.close,
          }),
      })
    )

  const init = (config: ConsoleConfig): UpdateReturn => {
    const requestInits = Array.map(plugins, (plugin) => ({
      kind: plugin.kind,
      requestInit: plugin.initRequest(),
    }))

    return {
      model: {
        config,
        form: {
          url: config.wsUrl,
          keepaliveInterval: globalThis.String(config.keepalive.interval),
          keepaliveTimeout: globalThis.String(config.keepalive.timeout),
          acceptKeepalive: globalThis.String(config.keepalive.acceptTimeout),
        },
        session: Session.Idle(),
        lastSessionId: 0,
        errorLog: emptyErrorLog(),
        errorPopover: Popover.init({ id: CONNECTION_ERROR_POPOVER_ID }),
        authToken: Redacted.make(''),
        channels: [],
        nextChannelId: 1,
        requests: Record.fromEntries(
          Array.map(requestInits, ({ kind, requestInit }) => [kind, requestInit.model])
        ),
        maybeRequestKind: Option.none(),
        requestDialog: Dialog.init({ id: REQUEST_DIALOG_ID }),
      },
      commands: Array.flatMap(requestInits, ({ kind, requestInit }) =>
        Command.mapMessages(requestInit.commands ?? [], toRequestMessage(kind))
      ),
    }
  }

  const update = (model: Model, message: Message) =>
    Message.match<UpdateReturn>(message, {
      UpdatedConnectionField: ({ field, value }) => ({
        model: modifyFields(model, {
          form: (form) => updateForm(form, field, value),
        }),
      }),

      // NOTE: a session takes its cards with it. Dropping them is also what releases the live
      // channels, which exist only for open cards of the open session.
      ClickedConnect: () => {
        const sessionId = model.lastSessionId + 1

        return foldConnectionErrorPopoverClose(
          modifyFields(model, {
            session: () => Session.Opening({ sessionId, params: toClientParams(model.form) }),
            lastSessionId: () => sessionId,
            errorLog: () => emptyErrorLog(),
            channels: () => [],
          })
        )
      },

      ClickedReconnect: () => ({ model, commands: [ReconnectClient()] }),

      ClickedDisconnect: () => ({
        model: modifyFields(model, {
          session: () => Session.Idle(),
          channels: () => [],
        }),
      }),

      // NOTE: a client built for an earlier session can report in after the Model has moved
      // on, so only the acquisition of the session being opened is acted on.
      AcquiredClient: ({ sessionId: acquiredSessionId }) => ({
        model: modifyFields(model, {
          session: (session) =>
            Session.match(session, {
              Idle: () => session,
              Open: () => session,
              Opening: ({ sessionId, params }) =>
                sessionId === acquiredSessionId
                  ? Session.Open({
                      sessionId,
                      params,
                      status: {
                        connection: DXLinkConnectionState.CONNECTING,
                        maybeAuth: Option.none(),
                        maybeDetails: Option.none(),
                      },
                      hasAuthorized: false,
                    })
                  : session,
            }),
        }),
      }),

      ReleasedClient: () => ({ model }),

      // NOTE: only a session still waiting for its client can have failed to get one.
      FailedAcquireClient: ({ reason }) => ({
        model: modifyFields(model, {
          session: (session) => (session._tag === 'Opening' ? Session.Idle() : session),
        }),
        commands: [StampAcquireFailure({ reason })],
      }),

      CompletedStampAcquireFailure: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      ChangedClientStatus: ({ status }) => ({
        model: modifyFields(model, {
          session: (session) => withStatus(session, status),
        }),
      }),

      ChangedAuthState: ({ auth }) => ({
        model: modifyFields(model, {
          session: (session) =>
            Session.match(session, {
              Idle: () => session,
              Opening: () => session,
              Open: ({ status }) =>
                withStatus(
                  session,
                  modifyFields(status, {
                    maybeAuth: () => Option.some(auth),
                  })
                ),
            }),
        }),
      }),

      ReportedConnectionError: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      ClickedClearConnectionErrors: () =>
        foldConnectionErrorPopoverClose(modifyFields(model, { errorLog: clearErrors })),

      GotConnectionErrorPopoverMessage: ({ message: popoverMessage }) =>
        foldConnectionErrorPopover(model, popoverMessage),

      SucceededReconnectClient: () => ({ model }),

      FailedReconnectClient: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      UpdatedAuthToken: ({ value }) => ({
        model: modifyFields(model, { authToken: () => value }),
      }),

      SubmittedAuthToken: () => {
        const token = Redacted.value(model.authToken).trim()

        return String.isEmpty(token)
          ? { model }
          : { model, commands: [SetAuthToken({ token: Redacted.make(token) })] }
      },

      SucceededSetAuthToken: () => ({ model }),

      FailedSetAuthToken: ({ error }) => ({
        model: modifyFields(model, {
          errorLog: (errorLog) => prependError(errorLog, error),
        }),
      }),

      ClickedAddChannel: ({ kind }) =>
        foldRequestDialogOpen(modifyFields(model, { maybeRequestKind: () => Option.some(kind) })),

      GotRequestDialogMessage: ({ message: dialogMessage }) =>
        foldRequestDialog(model, dialogMessage),

      GotRequestMessage: ({ pluginId: kind, message: requestMessage }) =>
        pipe(
          findPlugin(plugins, kind),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: (plugin) => {
              const requestUpdate = plugin.updateRequest(
                Record.get(model.requests, kind).pipe(Option.getOrUndefined),
                requestMessage
              )

              return {
                model: modifyFields(model, {
                  requests: Record.set(kind, requestUpdate.model),
                }),
                commands: Command.mapMessages(requestUpdate.commands ?? [], toRequestMessage(kind)),
              }
            },
          })
        ),

      ClickedOpenChannel: () =>
        pipe(
          model.maybeRequestKind,
          Option.flatMap((kind) => findPlugin(plugins, kind)),
          Option.flatMap((plugin) => {
            const channelId = globalThis.String(model.nextChannelId)

            return Option.map(
              plugin.open(
                Record.get(model.requests, plugin.kind).pipe(Option.getOrUndefined),
                channelId
              ),
              (channelInit) => ({ plugin, channelId, channelInit })
            )
          }),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: ({ plugin, channelId, channelInit }) => {
              const dialogClose = foldRequestDialogClose(
                modifyFields(model, {
                  channels: Array.append({
                    id: channelId,
                    kind: plugin.kind,
                    card: ChannelCard.Open({
                      isExpanded: true,
                      errorPopover: Popover.init({ id: channelErrorPopoverId(channelId) }),
                    }),
                    model: channelInit.model,
                  }),
                  nextChannelId: (nextChannelId) => nextChannelId + 1,
                })
              )

              return {
                model: dialogClose.model,
                commands: [
                  ...(dialogClose.commands ?? []),
                  ...Command.mapMessages(channelInit.commands ?? [], toChannelMessage(channelId)),
                  ScrollToChannel({ channelId }),
                ],
              }
            },
          })
        ),

      GotChannelMessage: ({ channelId, message: channelMessage }) =>
        pipe(
          findChannel(model, channelId),
          Option.flatMap((channel) =>
            Option.map(findPlugin(plugins, channel.kind), (plugin) => ({
              channel,
              plugin,
            }))
          ),
          Option.match({
            onNone: (): UpdateReturn => ({ model }),
            onSome: ({ channel, plugin }) => {
              const channelUpdate = plugin.updateChannel(channel.model, channelMessage)

              return {
                model: writeChannel(
                  model,
                  modifyFields(channel, { model: () => channelUpdate.model })
                ),
                commands: Command.mapMessages(
                  channelUpdate.commands ?? [],
                  toChannelMessage(channelId)
                ),
              }
            },
          })
        ),

      ClickedToggleChannel: ({ channelId }) => ({
        model: modifyFields(model, {
          channels: Array.map((channel) =>
            channel.id === channelId
              ? modifyFields(channel, {
                  card: (card) =>
                    ChannelCard.match(card, {
                      Open: ({ isExpanded, errorPopover }) =>
                        ChannelCard.Open({ isExpanded: !isExpanded, errorPopover }),
                      Closed: () => card,
                    }),
                })
              : channel
          ),
        }),
      }),

      ClickedCloseChannel: ({ channelId }) => ({
        model: modifyFields(model, {
          channels: Array.map((channel) =>
            channel.id === channelId ? closeChannel(channel) : channel
          ),
        }),
      }),

      GotChannelErrorPopoverMessage: ({ channelId, message: popoverMessage }) =>
        foldChannelErrorPopover(model, channelId, popoverMessage),

      ClickedClearChannelErrors: ({ channelId }) =>
        foldChannelErrorPopoverClose(channelId)(
          modifyFields(model, {
            channels: Array.map((channel) =>
              channel.id === channelId
                ? modifyFields(channel, {
                    model: (channelModel) =>
                      Option.match(findPlugin(plugins, channel.kind), {
                        onNone: () => channelModel,
                        onSome: (plugin) => plugin.clearErrors(channelModel),
                      }),
                  })
                : channel
            ),
          })
        ),

      CompletedScrollToChannel: () => ({ model }),
    })

  return { init, update }
}
