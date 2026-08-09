/// <reference types="astro/client" />

interface ImportMetaGlob {
  <T = Record<string, any>>(
    glob: string,
    options?: { eager?: boolean; import?: string; as?: string }
  ): Record<string, T>
}

declare global {
  interface ImportMeta {
    glob: ImportMetaGlob
  }
}
