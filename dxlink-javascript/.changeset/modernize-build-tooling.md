---
'@dxfeed/dxlink-core': minor
'@dxfeed/dxlink-websocket-client': minor
'@dxfeed/dxlink-feed': minor
'@dxfeed/dxlink-dom': minor
'@dxfeed/dxlink-indichart': minor
'@dxfeed/dxlink-rpc': minor
'@dxfeed/dxlink-api': minor
---

Modernize build tooling and packaging. Packages are now bundled with tsup (replacing microbundle) and ship dual ESM/CJS builds exposed through a conditional `exports` map (`import`/`require` with matching type declarations). This packaging change carries no API change of its own, and the standard entry points (`main`, `module`, `types`, `exports`) resolve as before.
