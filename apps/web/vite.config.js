import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev, o Vite não serve api/. Redireciona /api/* para o dev-api (node server/dev-api.js).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
