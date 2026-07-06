import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'https://api.fileinnoutcloud.kro.kr'
  const yjsProxyTarget = env.VITE_YJS_PROXY_TARGET || 'https://api.fileinnoutcloud.kro.kr'

  return {
    base: '/',
    plugins: [vue(), process.env.VITE_DISABLE_DEVTOOLS === 'true' ? null : vueDevTools(), tailwindcss()].filter(Boolean),
    define: {
      global: 'globalThis',
    },
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/wss': {
          target: yjsProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/wss/, '') || '/',
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            if (normalizedId.includes('/src/views/workspace/composables/')) {
              return 'workspace-composables'
            }
            if (normalizedId.includes('/src/views/workspace/components/')) {
              return 'workspace-components'
            }
            if (normalizedId.includes('/src/views/workspace/services/')) {
              return 'workspace-services'
            }
            if (!id.includes('node_modules')) return undefined
            if (id.includes('/@editorjs/') || id.includes('\\@editorjs\\') || id.includes('/editorjs-') || id.includes('\\editorjs-')) {
              return 'editor-tools'
            }
            if (id.includes('/yjs/') || id.includes('\\yjs\\') || id.includes('/y-websocket/') || id.includes('\\y-websocket\\') || id.includes('/lib0/') || id.includes('\\lib0\\')) {
              return 'editor-realtime'
            }
            if (id.includes('/stompjs/') || id.includes('\\stompjs\\')) {
              return 'stomp-client'
            }
            return undefined
          },
        },
      },
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.test.{js,ts}'],
      restoreMocks: true,
    },
  }
})
