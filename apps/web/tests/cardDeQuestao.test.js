// Regras do card de questão (src/lib/cardDeQuestao.js): cabeçalho de
// procedência, trilha, risco de alternativa e o histórico de uma questão.
//
// Os pontos sensíveis são dois. O cabeçalho de questão sem procedência (mock,
// acervo incompleto) é onde "undefinedº Exame" vaza para a tela. E a data do
// "Respondida em" é onde uma resposta dada às 23h em São Paulo vira o dia
// seguinte — este arquivo roda em UTC e em America/Sao_Paulo
// (scripts/testes-lib.js), e a data tem de sair igual nos dois.

import {
  formatarDataBR,
  cabecalhoDaQuestao,
  trilhaDaQuestao,
  alternarRisco,
  historicoDaQuestao,
} from '../src/lib/cardDeQuestao.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

// --- data ---
{
  // 02:00 UTC do dia 1º ainda é 23:00 do dia 28 em São Paulo: é o caso que
  // separa "fuso do Brasil" de "fuso da máquina".
  const madrugadaUtc = formatarDataBR('2026-03-01T02:00:00.000Z');
  exigir(madrugadaUtc === '28/02/2026', `resposta das 23h em SP caiu no dia errado: ${madrugadaUtc}`);
  exigir(formatarDataBR('2026-03-01T15:00:00.000Z') === '01/03/2026', 'meio da tarde');
  exigir(formatarDataBR(new Date('2026-12-31T12:00:00Z')) === '31/12/2026', 'objeto Date');
  // Data sem hora é dia do calendário, não instante: não pode voltar um dia.
  exigir(formatarDataBR('2026-03-01') === '01/03/2026', 'data sem hora mudou de dia');
  exigir(formatarDataBR(null) === null, 'nulo deveria dar null');
  exigir(formatarDataBR('') === null, 'vazio deveria dar null');
  exigir(formatarDataBR('não é data') === null, 'texto inválido deveria dar null');
}

// --- cabeçalho ---
{
  const completo = cabecalhoDaQuestao({ exame: 45, ano: 2025, banca: 'FGV', numero: 12 });
  exigir(completo === '45º Exame · 2025 · FGV · Questão 12', `cabeçalho completo: "${completo}"`);

  exigir(cabecalhoDaQuestao({ exame: 45, ano: null, banca: 'FGV', numero: 3 }) === '45º Exame · FGV · Questão 3', 'sem ano');
  exigir(cabecalhoDaQuestao({}) === 'Exame de Ordem', 'questão sem procedência');
  exigir(cabecalhoDaQuestao(null) === 'Exame de Ordem', 'questão nula');
  exigir(cabecalhoDaQuestao({ ano: 2024, banca: 'FGV' }) === 'Exame de Ordem · 2024 · FGV', 'sem exame nem número');

  // Mock antigo e acervo pela metade: nada de undefined/null/NaN na tela.
  for (const q of [{}, { exame: undefined }, { exame: 'x' }, { exame: null, numero: null, ano: null, banca: null }]) {
    const texto = cabecalhoDaQuestao(q);
    exigir(!/undefined|null|NaN/.test(texto), `cabeçalho vazou lixo: "${texto}" para ${JSON.stringify(q)}`);
  }
}

// --- trilha ---
{
  const t = trilhaDaQuestao({ disciplina: 'Direito Penal', topico: 'Crimes contra a pessoa' });
  exigir(t?.disciplina === 'Direito Penal' && t?.tema === 'Crimes contra a pessoa', 'trilha completa');

  const semTema = trilhaDaQuestao({ disciplina: 'Direito Civil', topico: null });
  exigir(semTema?.disciplina === 'Direito Civil' && semTema?.tema === null, 'tema ausente não pode virar texto');

  exigir(trilhaDaQuestao({ disciplina: null, topico: null }) === null, 'sem classificação não tem trilha');
  exigir(trilhaDaQuestao(null) === null, 'questão nula');
  // Quem ainda fala o nome da coluna do acervo também funciona.
  exigir(trilhaDaQuestao({ disciplina: 'Ética', tema: 'Sigilo' })?.tema === 'Sigilo', 'campo `tema` cru');
}

// --- risco ---
{
  const um = alternarRisco([], 2);
  exigir(um.join() === '2', 'riscar uma');
  const dois = alternarRisco(um, 0);
  exigir(dois.join() === '0,2', 'riscar a segunda, em ordem');
  exigir(alternarRisco(dois, 2).join() === '0', 'desfazer o risco');
  // Alternativa A é o índice 0 — um `if (!i)` a trataria como "nenhuma".
  exigir(alternarRisco([0], 0).length === 0, 'desfazer o risco da A');
  exigir(um.join() === '2', 'alternarRisco alterou a lista original');
}

// --- histórico ---
{
  // Como o App guarda: chave = id do acervo em texto, tentativas cronológicas
  // (`agruparPorQuestao`), e a resposta desta sessão empurrada no fim.
  const usuarioTentativas = {
    101: {
      desempenho: 'necessita',
      tentativas: [
        { id: '1', data: '2026-01-10T13:00:00.000Z', resposta: 1, correta: false },
        { id: '2', data: '2026-03-01T02:00:00.000Z', resposta: 0, correta: true },
        { id: '3', data: null, resposta: null, correta: false },
      ],
    },
  };

  // O id chega da tela como número; a chave do objeto é texto.
  const h = historicoDaQuestao(usuarioTentativas, 101);
  exigir(h.total === 3, `total: ${h.total}`);
  exigir(h.ultima?.id === '2', 'a última tem de ser a mais recente, não a do fim do array');
  exigir(h.ultima?.dataFormatada === '28/02/2026', `última no fuso do Brasil: ${h.ultima?.dataFormatada}`);
  exigir(h.tentativas.map((t) => t.id).join() === '2,1,3', `ordem: ${h.tentativas.map((t) => t.id).join()}`);
  exigir(h.tentativas[0].letra === 'A' && h.tentativas[0].correta === true, 'alternativa A (índice 0) e acerto');
  exigir(h.tentativas[1].letra === 'B' && h.tentativas[1].correta === false, 'alternativa B e erro');
  exigir(h.tentativas[2].letra === null && h.tentativas[2].dataFormatada === null, 'tentativa sem alternativa nem data');
  exigir(!('instante' in h.tentativas[0]), 'campo interno de ordenação vazou');

  exigir(historicoDaQuestao(usuarioTentativas, '101').total === 3, 'id em texto');

  const vazio = historicoDaQuestao(usuarioTentativas, 999);
  exigir(vazio.total === 0 && vazio.ultima === null && vazio.tentativas.length === 0, 'questão nunca respondida');
  exigir(historicoDaQuestao(undefined, 101).total === 0, 'histórico ainda não carregado');
  exigir(historicoDaQuestao({}, null).total === 0, 'questão sem id');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ cabeçalho, trilha, risco e histórico do card de questão íntegros');
