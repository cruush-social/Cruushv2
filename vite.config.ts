import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

const devCertDirectory = path.resolve(__dirname, '.dev/certs')
const devKeyPath = path.join(devCertDirectory, 'localhost-key.pem')
const devCertPath = path.join(devCertDirectory, 'localhost-cert.pem')
const useHttps = process.env.VITE_DEV_HTTPS !== '0' && process.env.VITE_DEV_HTTPS !== 'false'

const httpsConfig =
  useHttps && fs.existsSync(devKeyPath) && fs.existsSync(devCertPath)
    ? {
        key: fs.readFileSync(devKeyPath),
        cert: fs.readFileSync(devCertPath),
      }
    : undefined

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  server: {
    https: httpsConfig,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/maplibre-gl/') || id.includes('/node_modules/@maplibre/')) {
            return 'vendor-maplibre'
          }

          return undefined
        },
      },
    },
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
