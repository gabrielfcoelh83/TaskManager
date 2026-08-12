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
// A porta do gateway é configurável só para dar saída quando a 3000 já está
// ocupada na máquina — o backend de e2e lê a mesma variável.
const GATEWAY = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
const DEV_API = `http://localhost:${process.env.DEV_API_PORT || 3100}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // As mais específicas primeiro: o Vite casa na ordem de declaração.
      // Sem a linha de /api/questoes aqui, o acervo cairia no DEV_API — o
      // servidorzinho do gerador por IA, que não tem essa rota — e a tela
      // mostraria "o acervo não carregou" com o backend inteiro no ar.
      '/api/auth': GATEWAY,
      '/api/tentativas': GATEWAY,
      '/api/questoes': GATEWAY,
      // `/api/users` entrou junto com o perfil real (nome, e-mail, meta, data
      // da prova). Esquecer esta linha não quebra nada visível: o pedido cai
      // no DEV_API, que responde ECONNREFUSED, e a tela só deixa de mostrar o
      // nome. Foi assim que apareceu na primeira execução do e2e.
      '/api/users': GATEWAY,
      '/api': DEV_API,
    },
  },
});
