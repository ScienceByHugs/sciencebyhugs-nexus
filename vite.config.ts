import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand-mark.svg'],
      manifest: {
        name: 'Science By HUGs Nexus',
        short_name: 'Nexus',
        description: 'Customer-facing ordering and account PWA for the Science By HUGs ecosystem.',
        theme_color: '#050816',
        background_color: '#050816',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: `${base}brand-mark.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
