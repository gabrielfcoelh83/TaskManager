import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em dev convivem DUAS APIs sob o mesmo prefixo /api, e elas não são a mesma
// coisa:
//
//   /api/gerar-questoes, /api/enriquecer-questao, /api/buscar-datajud
//       → rotas serverless do próprio app (na Vercel em produção; aqui pelo
//         `node server/dev-api.js`, que precisa subir com PORT=3100)
//
//   /api/auth/*, /api/tentativas
//       → gateway da plataforma de microserviços, na porta 3000
//
// Em produção não há ambiguidade: as primeiras são relativas à Vercel e as
// segundas usam a URL absoluta de VITE_API_URL. É só em dev, com tudo em
// localhost, que os prefixos se cruzam — daí a divisão explícita abaixo.
const GATEWAY = 'http://localhost:3000';
const DEV_API = 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // As mais específicas primeiro: o Vite casa na ordem de declaração.
      '/api/auth': GATEWAY,
      '/api/tentativas': GATEWAY,
      '/api': DEV_API,
    },
  },
});
