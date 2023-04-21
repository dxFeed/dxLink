# @dxFeed/dxLink-WebSocket-Client

This package provides access to receive market data from [dxFeed](https://www.dxfeed.com/) services.


## Install

```bash
npm install @dxfeed/dxlink-websocket-client
```

## Usage

Import library

```typescript
import { DXLinkWebSocket } from '@dxfeed/dxlink-websocket-client'
```

### Create client

Create instance of the client

```typescript
const client = await DXLinkWebSocket.newClient({
  url: 'wss://demo.dxfeed.com/dxlink-ws',
})
```

Provide auth token if required

```typescript 
client.auth(token)
```

### Channels

Create Feed channel with delivery contract

```typescript
const channel = await client.openFeedChannel('AUTO')
```

Configure channel

```typescript
channel.setup({
  acceptAggregationPeriod: 10,
  acceptDataFormat: 'COMPACT',
  acceptEventFields: {
    Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
    Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
  },
})
```

Add subscription

```typescript
const sub1 = {
  type: 'Quote',
  symbol: 'AAPL'
}

channel.subscription({
  add: [sub1]
})
```

Remove subscription

```typescript
channel.subscription({
  remove: [sub1]
})
```

Receive data

```typescript
channel.data.subscribe((events) => {
  // do something with events
})
```
