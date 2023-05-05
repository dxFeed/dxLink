import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  interval,
  map,
  merge,
  mergeWith,
  NEVER,
  Observable,
  partition,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  tap,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs'
import { Channel, ChannelMessage, OpenChannel } from './channel'
import { Connection, ConnectionStatus, newWebSocketConnection } from './connection'
import { ErrorData } from './error'
import { FeedChannelByContract, FeedContract, feedChannel } from './feed'
import {
  SetupMessage,
  AuthState,
  isConnectionMessage,
  AuthStateMessage,
  ChannelClosedMessage,
  ChannelOpenedMessage,
  ErrorMessage,
  Message,
  ErrorType,
} from './protocol'
import { VERSION } from './version'

export interface ConnectionState {
  status: ConnectionStatus
  clientKeepaliveTimeout: number
  serverKeepaliveTimeout?: number
  clientVersion: string
  serverVersion?: string
}

export interface Client {
  // Parameters
  url: string
  version: string

  // State
  connectionState: Observable<ConnectionState>
  getConnectionState(): Promise<ConnectionState>

  authState: Observable<AuthState>
  getAuthState(): Promise<AuthState>

  // Errors
  error: Observable<ErrorData>

  // Actions
  close(): void
  auth(token: string): Promise<void>

  // Channels
  openChannel: OpenChannel
  openFeedChannel<Contract extends FeedContract>(
    contract: Contract
  ): Promise<FeedChannelByContract<Contract>>
}

export interface ClientOptions {
  url: string
  keepaliveInterval?: number
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
  getAuthToken?: () => Promise<string>
}

export const DEFAULT_KEEPALIVE_TIMEOUT = 60

export const newClient = async ({
  url,
  keepaliveTimeout = DEFAULT_KEEPALIVE_TIMEOUT,
  acceptKeepaliveTimeout = DEFAULT_KEEPALIVE_TIMEOUT,
  keepaliveInterval = keepaliveTimeout / 2,
}: ClientOptions): Promise<Client> => {
  // Constants
  const actionTimeout = (keepaliveTimeout / 2) * 1000
  const version = `0.1-${VERSION}`

  // Create connection
  const connection: Connection = newWebSocketConnection({ url })

  // Inbound messages for connection level
  const connectionInbound = connection.message.pipe(filter(isConnectionMessage))

  // Connection establishment
  const serverSetup = connectionInbound.pipe(
    filter((message): message is SetupMessage => message.type === 'SETUP'),
    shareReplay(1)
  )

  // Connection establishment
  try {
    // Wait for connection to open
    await firstValueFrom(
      connection.status.pipe(
        filter((status) => status === 'OPENED'),
        timeout({
          each: actionTimeout,
          meta: `Connection open timeout exceeded: ${actionTimeout} milliseconds`,
        })
      )
    )

    // Send setup to server
    connection.send({
      type: 'SETUP',
      channel: 0,
      version,
      keepaliveTimeout,
      acceptKeepaliveTimeout,
    })

    // Wait for server setup
    await firstValueFrom(
      serverSetup.pipe(
        timeout({
          each: actionTimeout,
          meta: `Server setup timeout exceeded: ${actionTimeout} milliseconds`,
        })
      )
    )
  } catch (error) {
    // Close connection on failed establishment
    connection.close()

    if (error instanceof TimeoutError) {
      throw new Error(error.info?.meta ?? error.message)
    }
    if (error instanceof Error) {
      throw error
    }

    throw new Error(String(error))
  }

  // Error handling
  // Internal error
  const outboundError = new Subject<ErrorData>()
  const errorSend = outboundError.pipe(
    tap((error) => {
      // Send internal error to server
      connection.send({
        type: 'ERROR',
        channel: 0,
        error: error.type,
        message: error.message,
      })
    })
  )
  // Public error notification
  const error = connectionInbound.pipe(
    filter((message): message is ErrorMessage => message.type === 'ERROR'),
    map((message): ErrorData => ({ type: message.error, message: message.message })),
    mergeWith(connection.error),
    mergeWith(outboundError)
  )

  // Clean up connection on close
  const cleanup = connection.status.pipe(
    filter((status) => status === 'CLOSED'),
    tap(() => close())
  )

  // Collect connection state
  const connectionState = combineLatest([serverSetup, connection.status]).pipe(
    map(
      ([setupMessage, status]): ConnectionState => ({
        status,
        clientKeepaliveTimeout: keepaliveTimeout,
        serverKeepaliveTimeout: setupMessage.keepaliveTimeout,
        clientVersion: version,
        serverVersion: setupMessage.version,
      })
    )
  )

  // Connection maintenance
  // Server keepalive validation
  const serverMaintance = serverSetup.pipe(
    switchMap((setupMessage) => {
      const keepaliveTimeout = setupMessage.keepaliveTimeout ?? DEFAULT_KEEPALIVE_TIMEOUT

      return connection.message.pipe(
        timeout({
          each: keepaliveTimeout * 1000,
          meta: `Server keepalive timeout exceeded: ${keepaliveTimeout} seconds`,
        })
      )
    }),
    catchError((error) => {
      if (error instanceof TimeoutError) {
        logError('TIMEOUT', error.info?.meta ?? error.message)
      } else {
        logError('UNKNOWN', error instanceof Error ? error.message : String(error))
      }

      close()

      return NEVER
    })
  )

  // Client keepalive sending
  const keepaliveAction = new Subject()
  const clientMaintance = keepaliveAction.pipe(
    startWith(1),
    switchMap(
      () =>
        new Observable(() => {
          const intervalId = setInterval(
            () => connection.send({ type: 'KEEPALIVE', channel: 0 }),
            keepaliveInterval * 1000
          )

          return () => clearInterval(intervalId)
        })
    )
  )
  const send = (message: Message) => {
    connection.send(message)
    keepaliveAction.next(1)
  }

  // Authentication
  const authStateMesage = connectionInbound.pipe(
    filter((message): message is AuthStateMessage => message.type === 'AUTH_STATE')
  )
  const authState = authStateMesage.pipe(
    map((message) => message.state),
    distinctUntilChanged(),
    shareReplay(1)
  )

  const auth = async (token: string) => {
    send({
      type: 'AUTH',
      channel: 0,
      token,
    })

    await firstValueFrom(authState.pipe(filter((state) => state === 'AUTHORIZED')))
  }

  // Run all effects
  const effect = merge(cleanup, serverMaintance, clientMaintance, authState, errorSend).subscribe()

  // Close client
  const close = () => {
    connection.close()
    effect.unsubscribe()
  }

  // Channels
  let channelGlobalId = 0
  const openChannel = async (
    service: string,
    parameters: Record<string, unknown>
  ): Promise<Channel> => {
    const state = await firstValueFrom(authState)
    if (state === 'UNAUTHORIZED') {
      throw new Error(`Cannot open channel, auth state is ${state}`)
    }

    // Odd channel ids are for client
    const channelId = channelGlobalId++ * 2 + 1

    // Request channel
    send({
      type: 'CHANNEL_REQUEST',
      channel: channelId,
      service,
      parameters,
    })

    const channelInbound = connection.message.pipe(
      filter((message) => message.channel === channelId)
    )

    const [channelMessage, systemMessage] = partition(channelInbound, (message) =>
      message.type.startsWith(service)
    )

    const channelState = systemMessage.pipe(
      filter(
        (message): message is ChannelOpenedMessage | ChannelClosedMessage =>
          message.type === 'CHANNEL_OPENED' || message.type === 'CHANNEL_CLOSED'
      ),
      map((message) => (message.type === 'CHANNEL_OPENED' ? 'OPENED' : 'CLOSED')),
      distinctUntilChanged(),
      shareReplay(1)
    )

    const channelError = systemMessage.pipe(
      filter((message): message is ErrorMessage => message.type === 'ERROR'),
      map((message): ErrorData => ({ type: message.error, message: message.message }))
    )

    // Wait for channel response
    await firstValueFrom(
      merge(
        channelState.pipe(
          tap((state) => {
            if (state === 'CLOSED') {
              throw new Error('Channel closed')
            }
          }),
          timeout({
            first: actionTimeout,
            meta: 'Channel open timeout',
          })
        ),
        channelError.pipe(switchMap((error) => throwError(() => error)))
      )
    )

    const channelSend = (message: ChannelMessage) =>
      send({
        channel: channelId,
        ...message,
      })

    const channelClose = async () => {
      send({
        type: 'CHANNEL_CANCEL',
        channel: channelId,
      })

      // Wait for channel response
      await firstValueFrom(
        channelState.pipe(
          filter((state) => state === 'CLOSED'),
          timeout({
            first: actionTimeout,
            meta: 'Channel cancel timeout',
          })
        )
      )
    }

    return {
      id: channelId,
      service,
      state: channelState,
      send: channelSend,
      message: channelMessage,
      error: channelError,
      close: channelClose,
    }
  }

  const logError = (type: ErrorType, message: string) => {
    outboundError.next({ type, message })
  }

  // Channels for services
  const openFeedChannel = <Contract extends FeedContract = 'AUTO'>(contract?: Contract) =>
    feedChannel(openChannel, contract)

  return {
    url,
    version,

    connectionState,
    getConnectionState: () => firstValueFrom(connectionState),

    authState,
    getAuthState: () => firstValueFrom(authState),

    error,

    close,
    auth,

    openChannel,
    openFeedChannel,
  }
}
