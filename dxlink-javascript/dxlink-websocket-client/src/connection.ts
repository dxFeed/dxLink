import { BehaviorSubject, distinctUntilChanged, Observable, Subject } from 'rxjs'
import { ErrorData } from './error'
import { Message } from './protocol'

export type ConnectionStatus = 'PENDED' | 'OPENED' | 'CLOSED'

export interface Connection {
  send: (message: Message) => void
  close: () => void

  message: Observable<Message>
  status: Observable<ConnectionStatus>
  error: Observable<ErrorData>
}

export interface WebSocketConnectionOptions {
  url: string
}

export const newWebSocketConnection = (options: WebSocketConnectionOptions): Connection => {
  const websocket = new WebSocket(options.url)

  const statusSubject = new BehaviorSubject<ConnectionStatus>('PENDED')
  const messageSubject = new Subject<Message>()
  const errorSubject = new Subject<ErrorData>()

  const openListener = () => {
    websocket.removeEventListener('open', openListener)

    statusSubject.next('OPENED')
  }

  const errorListener = (ev: Event) => {
    console.error('WebSocket error', ev)

    errorSubject.next({
      type: 'UNKNOWN',
      message: `WebSocket error: ${ev instanceof ErrorEvent ? ev.message : String(ev)}`,
    })

    close()
  }

  const send = (message: Message) => {
    websocket.send(JSON.stringify(message))
  }

  const messageListener = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      if (typeof data.type !== 'string') {
        throw new Error('Message type is not a string')
      }
      if (typeof data.channel !== 'number') {
        throw new Error('Message channel is not a number')
      }

      messageSubject.next(data)
    } catch (error) {
      console.log("Can't decode message", event.data, error)

      if (error instanceof Error) {
        errorSubject.next({
          type: 'INVALID_MESSAGE',
          message: error.message,
        })
      } else {
        errorSubject.next({
          type: 'INVALID_MESSAGE',
          message: `Can't decode message: ${String(error)}`,
        })
      }
    }
  }

  const closeListener = () => {
    websocket.removeEventListener('open', openListener)
    websocket.removeEventListener('message', messageListener)
    websocket.removeEventListener('error', errorListener)
    websocket.removeEventListener('close', closeListener)

    messageSubject.complete()
    errorSubject.complete()
    statusSubject.next('CLOSED')
  }

  websocket.addEventListener('open', openListener)
  websocket.addEventListener('message', messageListener)
  websocket.addEventListener('error', errorListener)
  websocket.addEventListener('close', closeListener)

  const close = () => {
    websocket.close()
    closeListener()
  }

  return {
    send,
    close,
    message: messageSubject,
    status: statusSubject.pipe(distinctUntilChanged()),
    error: errorSubject,
  }
}
