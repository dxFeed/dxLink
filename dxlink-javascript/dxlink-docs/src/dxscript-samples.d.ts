declare module '@dxscript/js-samples' {
  export interface Sample {
    name: string
    title: string
    docs: string
    content?: string
  }

  export interface SamplesModule {
    list(): Sample[]
    get(name: string): Sample | undefined
  }

  const samples: SamplesModule
  export default samples
}
