// Ambient types for `@asyncapi/react-component/browser`. The package ships types for
// its main entry only; the `/browser` standalone bundle (the one we import, because it
// carries its own parser) has none. Same declaration as in dxlink-docs.
declare module '@asyncapi/react-component/browser' {
  import AsyncApi from '@asyncapi/react-component'
  import type { AsyncApiProps, ConfigInterface } from '@asyncapi/react-component'

  export type { AsyncApiProps, ConfigInterface }
  export default AsyncApi
}
