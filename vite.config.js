import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 30 * 60 * 1000, // 30 mins
        timeout: 30 * 60 * 1000,
      },
    },
  },
});
