/// <reference types="vite/client" />

declare module '*.yml?url' {
  const src: string
  export default src
}

declare module '*.yaml?url' {
  const src: string
  export default src
}
