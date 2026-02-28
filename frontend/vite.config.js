import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/hotels': 'http://localhost:3000',
      '/hotel': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
