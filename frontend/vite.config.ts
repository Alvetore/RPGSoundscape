import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow access from Android phones/tablets on local Wi-Fi
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        headers: {
          // The backend requires a token even for localhost. start_dev.bat
          // generates one shared token for the backend and this proxy.
          'X-RPG-Token': process.env.RPG_API_TOKEN || '',
        },
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
        headers: {
          'X-RPG-Token': process.env.RPG_API_TOKEN || '',
        },
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
