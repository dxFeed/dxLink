# @dxfeed/dxlink-api

This package provides access to market data from [dxFeed](https://www.dxfeed.com/) services via dxLink API.

## Install

```bash
npm install @dxfeed/dxlink-api
```

## Usage

Import client and feed into your project.

```typescript
import { DXLinkWebSocket, DXLinkFeed } from '@dxfeed/dxlink-api'
```

### Client

Create instance of the client.

```typescript
const client = new DXLinkWebSocketClient()
```

Connect to the server.

```typescript
client.connect('wss://demo.dxfeed.com/dxlink-ws')
```

Provide auth token if required by the server.

```typescript
client.setAuthToken(token)
```

### Feed API

Create market data feed API with delivery contract `AUTO`.

```typescript
const feed = new DXLinkFeed(client, 'AUTO')
```

Configure created feed.

```typescript
feed.configure({
  acceptAggregationPeriod: 10,
  acceptDataFormat: FeedDataFormat.COMPACT,
  acceptEventFields: {
    Quote: ['eventSymbol', 'askPrice', 'bidPrice'],
    Candle: ['eventSymbol', 'open', 'close', 'high', 'low', 'volume'],
  },
})
```

Add subscription to the feed.

```typescript
const sub1 = {
  type: 'Quote',
  symbol: 'AAPL',
}

feed.addSubscriptions(sub1)
```

Remove subscription from the feed.

```typescript
feed.removeSubscriptions(sub1)
```

Receive data from the channel.

```typescript
feed.addEventListener(events) => {
  // do something with events
})
```

### Depth Of Market API

Create Depth Of Market API with desired symbol and sources.

```typescript
const dom = new DXLinkDepthOfMarket(client, { symbol: 'AAPL', sources: ['ntv'] })
```

Configure created `dom`.

```typescript
dom.configure({
  acceptAggregationPeriod: 10,
  acceptDepthLimit: 5,
})
```

Receive data from the channel.

```typescript
dom.addSnapshotListener((time, bids, asks) => {
  // do something with snapshot
})
```
