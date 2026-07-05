import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({ protocolImports: true }),
  ],
  server: {
    port: 5173,
    allowedHosts: ['alphachef.site', 'www.alphachef.site'],
    proxy: {
      '/api/wallet': 'http://localhost:3015',
      '/api': 'http://localhost:3011',
      '/socket.io': { target: 'http://localhost:3011', ws: true },
      '/ws': { target: 'ws://localhost:3011', ws: true },
    },
  },
  preview: {
    allowedHosts: ['alphachef.site', 'www.alphachef.site'],
  },
});
