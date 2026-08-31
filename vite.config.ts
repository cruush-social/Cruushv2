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

// The About, Help and Blog pages are static documents in public/, served by
// nginx in production so that crawlers which run no JavaScript can read them.
// Vite serves public/ at the root, so without this /about would fall through to
// the SPA and render a different page in development than in production, and
// /help and /blog would not resolve at all. This makes both match nginx.conf.
const STATIC_PAGES: Record<string, string> = {
  '/about': 'about.html',
  '/help': 'help.html',
  '/blog': 'blog/index.html',
}

function staticPageRoutes() {
  const serve = (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      const pathname = (req.url ?? '').split('?')[0].replace(/\/$/, '') || '/'
      const file = STATIC_PAGES[pathname]
      if (!file) return next()
      const full = path.resolve(__dirname, 'public', file)
      if (!fs.existsSync(full)) return next()
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(fs.readFileSync(full))
    })
  }

  return {
    name: 'cruush-static-page-routes',
    configureServer: serve,
    configurePreviewServer: serve,
  }
}

const devCertDirectory = path.resolve(__dirname, '.dev/certs')
const devKeyPath = path.join(devCertDirectory, 'localhost-key.pem')
const devCertPath = path.join(devCertDirectory, 'localhost-cert.pem')
const useHttps = process.env.VITE_DEV_HTTPS !== '0' && process.env.VITE_DEV_HTTPS !== 'false'
const configuredDevPort = Number(process.env.VITE_DEV_PORT ?? 5173)
const configuredDevHost = process.env.VITE_DEV_HOST || undefined

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
    staticPageRoutes(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  server: {
    https: httpsConfig,
    host: configuredDevHost,
    port: configuredDevPort,
    strictPort: Boolean(process.env.VITE_DEV_PORT),
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
