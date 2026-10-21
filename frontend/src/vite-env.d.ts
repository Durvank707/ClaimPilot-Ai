/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the ClaimPilot backend. Empty string = same-origin (dev proxy). */
  readonly VITE_API_BASE_URL?: string
  /** Optional shared bearer token sent as `Authorization: Bearer <token>`. */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
