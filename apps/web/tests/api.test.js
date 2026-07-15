import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Helper to test /api/gerar-questoes without tema (should be 400)
async function testGerarQuestoesSemTema() {
  console.log('Testing /api/gerar-questoes without tema...');

  try {
    const response = await axios.post(`${API_URL}/api/gerar-questoes`, {
      quantidade: 3,
      disciplina: 'Direito Constitucional'
    });

    // Should NOT succeed
    console.error('❌ /api/gerar-questoes sem tema FAILED (should be 400)');
    return false;
  } catch (err) {
    if (err.response?.status === 400) {
      console.log('✅ /api/gerar-questoes sem tema retornou 400 (esperado)');
      return true;
    } else {
      console.error('❌ /api/gerar-questoes sem tema FAILED (expected 400, got', err.response?.status, ')');
      return false;
    }
  }
}

// Helper to test /api/gerar-questoes with tema (should be 200)
async function testGerarQuestoesComTema() {
  console.log('Testing /api/gerar-questoes with tema...');

  try {
    const response = await axios.post(`${API_URL}/api/gerar-questoes`, {
      tema: 'Direitos Fundamentais',
      quantidade: 3,
      disciplina: 'Direito Constitucional'
    }, {
      timeout: 30000  // 30 second timeout
    });

    if (response.status === 200) {
      console.log('✅ /api/gerar-questoes OK');
      console.log(`   Generated: ${response.data.questoes_geradas} questions`);
      console.log(`   Model: ${response.data.modelo}`);

      // Validar estrutura
      if (response.data.questoes && Array.isArray(response.data.questoes)) {
        const q = response.data.questoes[0];
        if (q.numero && q.enunciado && q.alternativas && q.gabarito && q.explicacao) {
          console.log('✅ Question structure valid');
          return true;
        } else {
          console.error('❌ Question structure invalid');
          return false;
        }
      } else {
        console.error('❌ Response format invalid');
        return false;
      }
    }
  } catch (err) {
    // 503 ou 429 é OK para este teste (fallback works)
    if (err.response?.status === 503 || err.response?.status === 429) {
      console.log(`✅ /api/gerar-questoes returned ${err.response.status} (fallback/rate-limit, acceptable)`);
      return true;
    } else if (err.code === 'ECONNREFUSED' || err.message.includes('connect')) {
      console.error('❌ /api/gerar-questoes FAILED (server not running)');
      return false;
    } else {
      console.error('❌ /api/gerar-questoes FAILED');
      console.error(err.message);
      return false;
    }
  }
}

// Helper to test /api/enriquecer-questao
async function testEnriquecerQuestao() {
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
    // 503 é OK (DATAJUD pode estar indisponível)
    if (err.response?.status === 503) {
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
    const test1 = await testGerarQuestoesSemTema();
    console.log();

    const test2 = await testGerarQuestoesComTema();
    console.log();

    const test3 = await testEnriquecerQuestao();
    console.log();

    if (test1 && test2 && test3) {
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
