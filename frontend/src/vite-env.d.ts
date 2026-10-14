/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ClaimPilot backend. Empty string = same-origin (dev proxy). */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
