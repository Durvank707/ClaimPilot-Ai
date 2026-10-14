import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Development-only convenience proxy. The ClaimPilot backend does not
    // currently send CORS headers, so browser requests from the Vite origin
    // would be blocked. Set VITE_API_BASE_URL to an empty string to route
    // requests through this proxy (same-origin) during local development.
    // This is not a substitute for proper CORS configuration in production.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
