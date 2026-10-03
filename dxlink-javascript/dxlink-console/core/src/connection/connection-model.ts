import {
  DXLinkAuthState,
  DXLinkConnectionState,
  DXLinkLogLevel,
  DXLinkWebSocketClient,
} from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkConnectionDetails, DXLinkError } from '@dxfeed/dxlink-api'
import { Effect, Predicate } from 'effect'
import * as AsyncResult from 'effect/reactivity/AsyncResult'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { command, on, session } from '../lib/model'
import type { Session } from '../lib/model'
import { prependError } from '../lib/timestamped-error'
import type { TimestampedError } from '../lib/timestamped-error'

/** Connection parameters entered in the form and passed to the client config. */
export interface ConnectionParams {
  keepaliveInterval: number
  keepaliveTimeout: number
  acceptKeepaliveTimeout: number
}

/** What Connect asks for. */
export interface ConnectRequest {
  url: string
  params: ConnectionParams
}

/**
 * The page's connection, as atoms: one {@link DXLinkWebSocketClient} at a time, its state, and
 * the commands that drive it.
 *
 * Debug-console client opts are preserved from the legacy console: `logLevel: DEBUG` and
 * `maxReconnectAttempts: 1` (a debug console deliberately limits reconnect).
 */
export interface ConnectionModel {
  /** Holds the client. `ConsolePage` keeps it open for the page's lifetime. */
  readonly session: Session<DXLinkWebSocketClient | null>
  /** The live client, for channel models to open channels on. Null while disconnected. */
  readonly client: Atom.Atom<DXLinkClient | null>
  readonly connection: Atom.Atom<DXLinkConnectionState>
  /**
   * Tri-state auth gating: `undefined` until we know (not connected / connecting), then the
   * server-reported `DXLinkAuthState`. Never seeded to UNAUTHORIZED so a no-auth server doesn't
   * flash a token form.
   */
  readonly auth: Atom.Atom<DXLinkAuthState | undefined>
  readonly details: Atom.Atom<DXLinkConnectionDetails | null>
  readonly errors: Atom.Atom<readonly TimestampedError[]>
  /**
   * Identifies the current client. Bumped on each {@link ConnectionModel.connect} (a new client)
   * but NOT on {@link ConnectionModel.reconnect} (the same client). The channels area uses it as
   * a React remount key, so a brand-new connection starts with no channels while a reconnect
   * preserves the open ones.
   */
  readonly sessionId: Atom.Atom<number>
  /**
   * `true` once the current client has reached AUTHORIZED. Stays `true` through a reconnect (the
   * same client re-opens its channels itself), so the channels area survives the connection /
   * auth flicker. Reset on disconnect / fresh connect.
   */
  readonly everAuthorized: Atom.Atom<boolean>

  /** Open a new client, replacing (and closing) the current one. */
  readonly connect: Atom.Writable<void, ConnectRequest>
  readonly reconnect: Atom.Writable<void>
  readonly disconnect: Atom.Writable<void>
  readonly setAuthToken: Atom.Writable<void, string>
  readonly clearErrors: Atom.Writable<void>
}

export const makeConnectionModel = (): ConnectionModel => {
  // The request is what the session reads: replacing it closes the current client and opens
  // the next, and clearing it closes the client for good.
  const request = Atom.make<ConnectRequest | null>(null)

  const connection = Atom.make<DXLinkConnectionState>(DXLinkConnectionState.NOT_CONNECTED)
  const auth = Atom.make<DXLinkAuthState | undefined>(undefined)
  const details = Atom.make<DXLinkConnectionDetails | null>(null)
  const errors = Atom.make<readonly TimestampedError[]>([])
  const sessionId = Atom.make(0)
  const everAuthorized = Atom.make(false)

  const clientSession = session({
    state: [connection, auth, details, errors, everAuthorized],
    open: (get) => {
      const current = get(request)
      if (current === null) {
        return Effect.succeed(null)
      }

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry
        const client = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new DXLinkWebSocketClient({
                keepaliveInterval: current.params.keepaliveInterval,
                keepaliveTimeout: current.params.keepaliveTimeout,
                acceptKeepaliveTimeout: current.params.acceptKeepaliveTimeout,
                logLevel: DXLinkLogLevel.DEBUG,
                maxReconnectAttempts: 1,
              })
          ),
          (client) => Effect.sync(() => client.close())
        )

        // Read the server-reported auth state once connected; clear it otherwise.
        const syncConnection = (state: DXLinkConnectionState) => {
          const authState =
            state === DXLinkConnectionState.CONNECTED ? client.getAuthState() : undefined
          registry.set(connection, state)
          registry.set(
            details,
            state === DXLinkConnectionState.NOT_CONNECTED ? null : client.getConnectionDetails()
          )
          registry.set(auth, authState)
          if (authState === DXLinkAuthState.AUTHORIZED) {
            registry.set(everAuthorized, true)
          }
        }

        yield* on(client, 'ConnectionStateChange', syncConnection)
        yield* on(client, 'AuthStateChange', (state) => {
          registry.set(auth, state)
          if (state === DXLinkAuthState.AUTHORIZED) {
            registry.set(everAuthorized, true)
          }
        })
        yield* on(client, 'Error', (error) =>
          registry.update(errors, (current) => prependError(current, error))
        )

        yield* Effect.try({
          try: () => client.connect(current.url),
          catch: (error): DXLinkError => ({
            type: 'UNKNOWN',
            message: Predicate.isError(error) ? error.message : String(error),
          }),
        }).pipe(
          // `new WebSocket` throws on a URL it cannot parse — `localhost:8080`, a host with no
          // scheme. That is a typo in the form, so it goes with the connection's errors rather
          // than failing the session, which `useSession` would rethrow over the whole page.
          Effect.catch((error) =>
            Effect.sync(() => {
              registry.update(errors, (list) => prependError(list, error))
              client.close()
            })
          )
        )
        // Pull the state straight off the client: connect() can change it before any listener
        // would have reported it.
        syncConnection(client.getConnectionState())

        return client
      })
    },
  })

  return {
    session: clientSession,
    client: Atom.make((get) => AsyncResult.getOrElse(get(clientSession.atom), () => null)),
    connection,
    auth,
    details,
    errors,
    sessionId,
    everAuthorized,

    connect: command((ctx, next: ConnectRequest) => {
      // A fresh client starts a new session: reset errors, bump the session id (so the
      // channels area remounts with no channels) and clear the authorized flag.
      ctx.set(errors, [])
      ctx.set(sessionId, ctx.get(sessionId) + 1)
      ctx.set(everAuthorized, false)
      ctx.set(request, { ...next })
    }),
    reconnect: command(() => clientSession.current()?.reconnect()),
    disconnect: command((ctx) => {
      ctx.set(request, null)
      ctx.set(connection, DXLinkConnectionState.NOT_CONNECTED)
      ctx.set(auth, undefined)
      ctx.set(details, null)
      ctx.set(everAuthorized, false)
    }),
    setAuthToken: command((_ctx, token: string) => clientSession.current()?.setAuthToken(token)),
    clearErrors: command((ctx) => ctx.set(errors, [])),
  }
}
