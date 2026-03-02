/// <reference types="vite/client" />

declare module '@dxscript/js-samples' {
  export interface Sample {
    name: string;
    title: string;
    docs: string;
    content?: string;
  }

  export default {
    list(): Sample[]
    , get(name: string): Sample | undefined;
  };
}
