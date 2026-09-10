import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Split the rarely-changing vendor code (React + Supabase) into its
        // own chunk so app-code deploys don't invalidate it in the cache.
        // Function form — Vite 8 / rolldown does not accept the object form.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  },

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      // We register the service worker ourselves in src/main.jsx so we can
      // also re-check for updates when the app returns to the foreground.
      injectRegister: false,

      // The 512px maskable icon is fetched by the OS from the manifest at
      // install time; it does not need to sit in the offline precache.
      includeAssets: [],
      includeManifestIcons: false,

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
        // Precache the hashed build output (JS/CSS/woff2 all land in assets/)
        // plus the handful of images the shell actually renders. NOT the HTML
        // — that is fetched network-first below so a new deploy shows up on
        // the next launch whenever there is a connection. Deliberately omits
        // .woff (woff2 covers every modern mobile browser) and the unused
        // brand PNGs that used to bloat the precache.
        globPatterns: [
          'assets/**/*.{js,css,woff2}',
          'favicon.svg',
          'brand/the-pot-logo.png',
          'brand/pattern-sage-subtle.png'
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
