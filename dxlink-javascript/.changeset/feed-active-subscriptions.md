---
'@dxfeed/dxlink-feed': minor
'@dxfeed/dxlink-api': minor
---

Expose the active subscriptions of a feed channel. `DXLinkFeedRequester` gains
`getSubscriptions()`, which returns the subscriptions the channel currently holds — the ones it
also replays after a channel re-open — and the union type behind them is now public as
`DXLinkFeedSubscription`. Adding the method to `DXLinkFeedRequester` is a breaking change only
for code that implements the interface itself; consumers of `DXLinkFeed` are unaffected.
