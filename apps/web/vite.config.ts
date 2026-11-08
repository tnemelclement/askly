import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Les ports viennent du `.env` de la racine, le même que lit l'API.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch {
  // Pas de `.env` (CI) : les défauts suffisent.
}

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5190),
    strictPort: true,
    // Même origine en dev : le cookie admin suit sans CORS.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 3400}` },
  },
})
