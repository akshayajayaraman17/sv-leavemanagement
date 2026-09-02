import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app has no offline capability (every screen needs Supabase), so the
      // service worker only ever added a stale-cache failure mode: after a
      // redeploy, clients kept serving an old index.html whose hashed chunks had
      // 404'd, breaking every lazy tab with no recovery. selfDestroying ships a
      // worker that unregisters any previously-installed SW and clears its
      // caches, putting all clients back on plain network.
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png'],
      manifest: {
        name: 'Leave Manager',
        short_name: 'Leave Mgr',
        description: 'Leave, attendance and timesheet management',
        theme_color: '#1D9E75',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
