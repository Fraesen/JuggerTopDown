import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/ws/pvp': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
})
