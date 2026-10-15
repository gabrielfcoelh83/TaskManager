// Motivo do erro (Caderno de Erros): a lista de motivos, a contagem de erros
// sem anotação e a troca da tentativa no histórico depois do PATCH. O ponto
// sensível é a troca: acrescentar em vez de substituir mudaria qual é a
// "última tentativa", e a questão sairia ou entraria na revisão sem motivo.

import { MOTIVOS_DO_ERRO, NOTA_DO_MOTIVO_MAX, rotuloDoMotivo, classificarRevisao } from '../src/lib/revisao.js';
import { substituirTentativa } from '../src/lib/historico.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

// --- lista de motivos ---
{
  const valores = MOTIVOS_DO_ERRO.map((m) => m.valor);
  exigir(new Set(valores).size === valores.length, 'valor de motivo repetido');
  // O estudo-service recusa motivo acima de 40 caracteres.
  exigir(valores.every((v) => v.length > 0 && v.length <= 40), 'valor de motivo vazio ou acima de 40 caracteres');
  exigir(NOTA_DO_MOTIVO_MAX === 280, 'teto da nota diferente do servidor (280)');

  exigir(rotuloDoMotivo('li-errado') === 'Li errado o enunciado', 'rótulo de motivo conhecido');
  exigir(rotuloDoMotivo('motivo-antigo') === 'motivo-antigo', 'motivo fora da lista deveria aparecer como veio');
  exigir(rotuloDoMotivo(null) === null, 'motivo nulo deveria dar rótulo nulo');
}

// --- erros sem motivo ---
{
  const questoes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const tentativas = {
    1: { tentativas: [{ id: '10', correta: false, motivo: 'confundi' }] },
    2: { tentativas: [{ id: '20', correta: false, motivo: null }] },
    // Errou com motivo, depois errou de novo sem: o erro novo é que conta.
    3: { tentativas: [{ id: '30', correta: false, motivo: 'li-errado' }, { id: '31', correta: false, motivo: null }] },
    // Acertou na última: não é erro, com ou sem motivo antigo.
    4: { tentativas: [{ id: '40', correta: false, motivo: null }, { id: '41', correta: true }] },
  };

  const { resumo } = classificarRevisao(questoes, tentativas);
  exigir(resumo.erros === 3, `deveriam ser 3 erros, vieram ${resumo.erros}`);
  exigir(resumo.errosSemMotivo === 2, `deveriam ser 2 erros sem motivo, vieram ${resumo.errosSemMotivo}`);
}

// --- substituir tentativa ---
{
  const estado = {
    7: { desempenho: 'necessita', tentativas: [{ id: '70', correta: false }, { id: '71', correta: false, motivo: null }] },
  };

  const novo = substituirTentativa(estado, '7', { id: '71', correta: false, motivo: 'confundi' });
  exigir(novo[7].tentativas.length === 2, 'substituir não pode acrescentar tentativa');
  exigir(novo[7].tentativas[1].motivo === 'confundi', 'tentativa não foi trocada');
  exigir(novo[7].tentativas[0].id === '70', 'ordem do histórico mudou');
  exigir(novo[7].desempenho === 'necessita', 'campos do registro se perderam');
  exigir(estado[7].tentativas[1].motivo === null, 'estado original foi mutado');

  // id numérico de um lado e texto do outro ainda casam.
  const porNumero = substituirTentativa(estado, '7', { id: 71, motivo: 'li-errado' });
  exigir(porNumero[7].tentativas[1].motivo === 'li-errado', 'id número x texto não casou');

  exigir(substituirTentativa(estado, '7', { id: '99' }) === estado, 'tentativa desconhecida deveria deixar o estado igual');
  exigir(substituirTentativa(estado, '8', { id: '70' }) === estado, 'questão desconhecida deveria deixar o estado igual');
  exigir(substituirTentativa(estado, '7', null) === estado, 'tentativa nula deveria deixar o estado igual');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ motivo do erro: lista, contagem e troca no histórico íntegros');
