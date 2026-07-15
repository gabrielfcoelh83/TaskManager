// server/dev-api.js
//
// Servidor de desenvolvimento para as rotas de api/ (Vite não serve api/).
// Node puro (módulo http), sem express. Porta 3000.
//
// - Carrega variáveis de .env.local (parse manual simples).
// - Roteia POST /api/gerar-questoes, /api/enriquecer-questao e /api/buscar-datajud
//   para os MESMOS handlers de api/ (mesmo código que roda na Vercel).
// - Adapta req/res com um shim: req.body (JSON parseado) e res.status().json().
//
// Rodar: node server/dev-api.js
// O frontend em dev alcança estas rotas via server.proxy no vite.config.js.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

// ---- Carregar .env.local (parse manual simples) ---------------------------
function carregarEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn('[dev-api] .env.local não encontrado, seguindo sem ele.');
    return;
  }
  const conteudo = fs.readFileSync(envPath, 'utf8');
  for (const linhaRaw of conteudo.split('\n')) {
    const linha = linhaRaw.trim();
    if (!linha || linha.startsWith('#')) continue;
    const idx = linha.indexOf('=');
    if (idx === -1) continue;
    const chave = linha.slice(0, idx).trim();
    let valor = linha.slice(idx + 1).trim();
    // Remove aspas simples/duplas envolventes.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(chave in process.env)) process.env[chave] = valor;
  }
  console.log('[dev-api] Variáveis de .env.local carregadas.');
}

carregarEnvLocal();

// ---- Carregar handlers de api/ (após env, para lerem process.env) ---------
async function importHandler(arquivo) {
  const url = pathToFileURL(path.join(ROOT, 'api', arquivo)).href;
  const mod = await import(url);
  return mod.default;
}

const rotas = {
  '/api/gerar-questoes': await importHandler('gerar-questoes.js'),
  '/api/enriquecer-questao': await importHandler('enriquecer-questao.js'),
  '/api/buscar-datajud': await importHandler('buscar-datajud.js'),
};

// ---- Shim de resposta estilo Vercel/Next --------------------------------
function criarRes(httpRes) {
  const res = {
    _status: 200,
    status(code) {
      this._status = code;
      return this;
    },
    json(payload) {
      const corpo = JSON.stringify(payload);
      httpRes.writeHead(this._status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      httpRes.end(corpo);
      return this;
    },
    setHeader(k, v) {
      httpRes.setHeader(k, v);
      return this;
    },
  };
  return res;
}

function lerBody(httpReq) {
  return new Promise((resolve) => {
    let dados = '';
    httpReq.on('data', (chunk) => {
      dados += chunk;
    });
    httpReq.on('end', () => {
      if (!dados) return resolve({});
      try {
        resolve(JSON.parse(dados));
      } catch {
        resolve(null); // body inválido sinalizado como null
      }
    });
    httpReq.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (httpReq, httpRes) => {
  const url = new URL(httpReq.url, `http://localhost:${PORT}`);
  const handler = rotas[url.pathname];
  const res = criarRes(httpRes);

  if (!handler) {
    return res.status(404).json({ error: 'Rota não encontrada' });
  }

  const body = await lerBody(httpReq);
  if (body === null) {
    return res.status(400).json({ error: 'JSON inválido no corpo da requisição' });
  }

  const req = { method: httpReq.method, body, headers: httpReq.headers };

  try {
    await handler(req, res);
  } catch (erro) {
    // Rede de segurança: nenhum handler deveria lançar, mas se lançar não crasha.
    console.error('[dev-api] Erro não tratado no handler:', erro);
    if (!httpRes.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api] API de desenvolvimento em http://localhost:${PORT}`);
  console.log('[dev-api] Rotas:', Object.keys(rotas).join(', '));
});
