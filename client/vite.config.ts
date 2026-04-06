import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// Use the explicit IPv4 loopback address to avoid intermittent `localhost`
// resolution issues on Windows/Node that can surface as Vite proxy ECONNREFUSED logs.
const apiProxyTarget = 'http://127.0.0.1:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    mkcert(),
    react(),
  ],
  server: {
    https: {},
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/hubs': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
