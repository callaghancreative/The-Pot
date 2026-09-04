import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

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
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff,woff2}'
        ]
      }
    })
  ]
})