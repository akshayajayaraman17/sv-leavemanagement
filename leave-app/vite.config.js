import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No service worker / PWA plugin: every screen needs Supabase, so it never
// added offline capability — it only cached a stale app shell that 404'd its
// hashed chunks after each redeploy. index.html carries a one-time snippet
// that unregisters any service worker still installed on returning clients.
export default defineConfig({
  plugins: [react()],
})
