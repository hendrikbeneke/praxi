import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Must run before the React plugin — it generates src/routeTree.gen.ts.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // In development the API lives in the separate Hono process on 3000.
    // The client always calls the relative path /api, in both modes.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    // `pnpm build` puts the SPA into the server's static directory, so that
    // `pnpm start` serves everything from a single process on port 3000.
    outDir: fileURLToPath(new URL('../server/public', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
})
