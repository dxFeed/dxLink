import { Observable } from 'rxjs'
import { ErrorData } from './error'
import { Message } from './protocol'

export type ChannelState = 'OPENED' | 'CLOSED'

export interface ChannelMessage {
  type: string
  [key: string]: unknown
}

export interface Channel {
  id: number
  service: string
  send: (message: ChannelMessage) => void
  close: () => Promise<void>
  state: Observable<ChannelState>
  message: Observable<Message>
  error: Observable<ErrorData>
}

export type OpenChannel = (service: string, parameters: Record<string, unknown>) => Promise<Channel>
