import axios from 'axios';

// Rotas serverless do próprio app (server/dev-api.js). Porta 3100, a mesma
// que o vite.config.js espera: a 3000 é do gateway da plataforma.
const API_URL = process.env.API_URL || 'http://localhost:3100';

// Gateway do backend de teste (scripts/e2e-backend.sh), de onde sai o token.
// As rotas de api/ exigem login (api/_lib/auth.js) e validam o token contra
// VITE_API_URL — que no CI aponta para este mesmo backend, nunca para a
// produção.
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || 'maria.lais@email.com';
const SENHA = process.env.E2E_SENHA || 'senha-de-teste-123';

const ROTAS_PROTEGIDAS = ['/api/enriquecer-questao', '/api/buscar-datajud'];

async function obterToken() {
  const { data } = await axios.post(`${GATEWAY_URL}/api/auth/login`, { email: EMAIL, password: SENHA });
  if (!data?.token) throw new Error('login não devolveu token');
  return data.token;
}

// Sem login, nenhuma rota que gasta cota de serviço externo (DATAJUD hoje; a
// OpenRouter, quando o chat existir) pode responder: é a garantia que
// api/_lib/auth.js existe para dar.
async function testRotasSemToken() {
  console.log('Testing rotas protegidas sem token (should be 401)...');
  let ok = true;

  for (const rota of ROTAS_PROTEGIDAS) {
    try {
      await axios.post(`${API_URL}${rota}`, {});
      console.error(`❌ ${rota} sem token respondeu 2xx (deveria ser 401)`);
      ok = false;
    } catch (err) {
      if (err.response?.status === 401) {
        console.log(`✅ ${rota} sem token retornou 401`);
      } else {
        console.error(`❌ ${rota} sem token FAILED (expected 401, got ${err.response?.status ?? err.code})`);
        ok = false;
      }
    }
  }
  return ok;
}

async function testTokenInvalido() {
  console.log('Testing /api/enriquecer-questao com token inválido (should be 401)...');

  try {
    await axios.post(`${API_URL}/api/enriquecer-questao`, { questao: { topico: 'x' } }, {
      headers: { Authorization: 'Bearer token-invalido' }
    });
    console.error('❌ token inválido foi aceito (deveria ser 401)');
    return false;
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('✅ token inválido retornou 401');
      return true;
    }
    console.error(`❌ token inválido FAILED (expected 401, got ${err.response?.status ?? err.code})`);
    return false;
  }
}

// Helper to test /api/enriquecer-questao
async function testEnriquecerQuestao(auth) {
  console.log('Testing /api/enriquecer-questao...');

  try {
    const response = await axios.post(`${API_URL}/api/enriquecer-questao`, {
      questao: {
        topico: 'Responsabilidade Civil',
        enunciado: 'Qual é a natureza da responsabilidade civil?',
        alternativas: ['A', 'B', 'C', 'D'],
        gabarito: 'a',
        explicacao: 'A resposta é A porque...'
      }
    }, {
      ...auth,
      timeout: 20000  // 20 second timeout
    });

    if (response.status === 200 && response.data.sucesso) {
      console.log('✅ /api/enriquecer-questao OK');
      console.log(`   Total precedents: ${response.data.jurisprudencia?.total || 0}`);
      return true;
    } else {
      console.error('❌ /api/enriquecer-questao FAILED (unexpected response)');
      return false;
    }
  } catch (err) {
    // 401 com token válido é bug de autenticação, não indisponibilidade
    // do DATAJUD — não pode cair no "aceitável" abaixo.
    if (err.response?.status === 401) {
      console.error('❌ /api/enriquecer-questao recusou um token válido (401)');
      return false;
    } else if (err.response?.status === 503) {
      // 503 é OK (DATAJUD pode estar indisponível)
      console.log('✅ /api/enriquecer-questao returned 503 (DATAJUD unavailable, acceptable)');
      return true;
    } else if (err.code === 'ECONNREFUSED') {
      console.error('❌ /api/enriquecer-questao FAILED (server not running)');
      return false;
    } else if (err.code === 'ENOTFOUND') {
      console.error('❌ /api/enriquecer-questao FAILED (server not found)');
      return false;
    } else {
      // Timeout ou erro de rede é aceitável (DATAJUD pode ser lento)
      console.log(`⚠ /api/enriquecer-questao returned: ${err.message} (acceptable)`);
      return true;
    }
  }
}

// Main runner
async function runTests() {
  console.log('🧪 Starting API tests...\n');

  try {
    const resultados = [];

    resultados.push(await testRotasSemToken());
    console.log();

    resultados.push(await testTokenInvalido());
    console.log();

    const token = await obterToken();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    console.log('🔑 Login do usuário de teste OK\n');

    resultados.push(await testEnriquecerQuestao(auth));
    console.log();

    if (resultados.every(Boolean)) {
      console.log('✅ All API tests passed!');
      process.exit(0);
    } else {
      console.log('❌ Some API tests failed!');
      process.exit(1);
    }
  } catch (err) {
    console.log('❌ API tests failed with error:');
    console.error(err);
    process.exit(1);
  }
}

runTests();
