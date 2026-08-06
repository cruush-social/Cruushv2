import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// One self-contained HTML file for the onboarding tutorial, so it can be opened
// straight from a chat message with no server, no session and no network.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist-preview',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'preview.html'),
      output: { inlineDynamicImports: true },
    },
  },
})
