import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      // We register the service worker ourselves in src/main.jsx so we can
      // also re-check for updates when the app returns to the foreground.
      injectRegister: false,

      includeAssets: [
        'brand/the-pot-app-icon.png'
      ],

      manifest: {
        name: 'THE POT',
        short_name: 'THE POT',
        description: 'Golf side games for the Saturday group.',

        theme_color: '#102A23',
        background_color: '#102A23',

        display: 'standalone',
        start_url: '/',
        scope: '/',

        icons: [
          {
            src: '/brand/the-pot-app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/brand/the-pot-app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },

      workbox: {
        // Precache the hashed build assets, but NOT the HTML — the app shell
        // is fetched network-first below so a new deploy shows up on the next
        // launch whenever there is a connection.
        globPatterns: [
          '**/*.{js,css,ico,png,svg,woff,woff2}'
        ],

        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        // Disable the default precache navigation fallback (it points at a
        // precached index.html we no longer precache) so navigations are
        // handled by the NetworkFirst rule below instead.
        navigateFallback: null,

        runtimeCaching: [
          {
            // Every page navigation (i.e. launching the home-screen app).
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
