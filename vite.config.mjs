import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('/node_modules/')) return;

          if (normalizedId.includes('/firebase/') || normalizedId.includes('/@firebase/')) {
            return 'vendor-firebase';
          }
          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (normalizedId.includes('/lucide-react/')) {
            return 'vendor-icons';
          }

          const modulePath = normalizedId.split('/node_modules/')[1];
          if (!modulePath) return 'vendor';

          const pathParts = modulePath.split('/');
          const packageName = pathParts[0]?.startsWith('@')
            ? `${pathParts[0]}-${pathParts[1] || 'pkg'}`
            : pathParts[0];

          return `vendor-${packageName?.replace(/[^a-zA-Z0-9_-]/g, '-') || 'misc'}`;
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  }
});
