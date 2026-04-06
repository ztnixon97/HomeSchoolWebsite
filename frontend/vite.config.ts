import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['chicken-logo.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Western Loudoun Preschool Co-op',
        short_name: 'WLPC',
        description: 'Western Loudoun Preschool Co-op — schedule, RSVPs, and community',
        theme_color: '#1f4b7a',
        background_color: '#f7f9fc',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/api\/auth\/me$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'auth-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/(session-types|class-groups|features)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'reference-data',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /\/api\/sessions/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sessions-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/my-rsvps/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rsvps-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/my-children/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'children-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: /\/api\/announcements/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'announcements-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 4 },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
