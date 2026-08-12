// O que precisa de revisão — de verdade.
//
// A tela de Revisões tinha cinco abas e nenhuma delas filtrava nada: o código
// era `let filtered = all` e só duas abas chegavam a mexer nisso. Clicar em
// "Errei" listava o acervo inteiro, com a etiqueta vermelha "Errei" colada em
// questão que a pessoa tinha acertado. E os números do topo (212 erradas, 36
// marcadas) eram constantes escritas no arquivo.
//
// Aqui a pergunta é respondida com o histórico: o que decide se uma questão
// entra em "Errei" é a ÚLTIMA tentativa dela, não a primeira nem a média —
// quem errou e depois acertou já corrigiu o problema.

function historico(tentativas, id) {
  const registro = tentativas?.[String(id)] || tentativas?.[id];
  return registro?.tentativas || [];
}

/**
 * A tentativa mais recente. O array chega em ordem cronológica (a API devolve
 * do mais novo para o mais velho e `agruparPorQuestao` inverte), então a
 * última posição é a mais recente.
 */
export function ultimaTentativa(tentativas, id) {
  const hist = historico(tentativas, id);
  return hist.length > 0 ? hist[hist.length - 1] : null;
}

export function situacaoDaQuestao(tentativas, id) {
  const hist = historico(tentativas, id);
  if (hist.length === 0) return { situacao: 'em-aberto', tentativas: 0, acertos: 0, pct: null, ultima: null };

  const acertos = hist.filter((t) => t.correta === true).length;
  const ultima = hist[hist.length - 1];

  return {
    situacao: ultima.correta === true ? 'acertou' : 'errou',
    tentativas: hist.length,
    acertos,
    pct: Math.round((acertos / hist.length) * 100),
    ultima,
  };
}

/**
 * Separa o acervo nas listas que a tela oferece.
 *
 * `favoritos` é uma lista de ids marcados à mão; ela vive só neste navegador
 * porque não existe rota de favorito na API — a tela diz isso em vez de fingir
 * que sincroniza.
 */
export function classificarRevisao(questoes = [], tentativas = {}, favoritos = []) {
  const marcados = new Set((favoritos || []).map(String));

  const comSituacao = questoes.map((q) => ({ questao: q, ...situacaoDaQuestao(tentativas, q.id) }));

  const errei = comSituacao
    .filter((x) => x.situacao === 'errou')
    // A que foi errada há mais tempo é a que corre mais risco de ter sido
    // esquecida: ela vem primeiro.
    .sort((a, b) => String(a.ultima?.data || '').localeCompare(String(b.ultima?.data || '')));

  const favoritas = comSituacao.filter((x) => marcados.has(String(x.questao.id)));

  const emAberto = comSituacao.filter((x) => x.situacao === 'em-aberto');

  // "Menor desempenho" só faz sentido para quem já tem histórico na questão:
  // taxa de acerto de zero tentativas não é zero, é ausência de dado.
  const menorDesempenho = comSituacao
    .filter((x) => x.tentativas > 0)
    .sort((a, b) => a.pct - b.pct || b.tentativas - a.tentativas);

  const respondidas = comSituacao.filter((x) => x.tentativas > 0);
  const acertos = comSituacao.filter((x) => x.situacao === 'acertou').length;

  return {
    errei,
    favoritas,
    emAberto,
    menorDesempenho,
    // "Todas para revisar" = o que se errou mais o que se marcou, sem repetir.
    todas: [...errei, ...favoritas.filter((f) => f.situacao !== 'errou')],
    resumo: {
      acervo: questoes.length,
      respondidas: respondidas.length,
      acertos,
      erros: errei.length,
      emAberto: emAberto.length,
      favoritas: favoritas.length,
      pct: respondidas.length > 0 ? Math.round((acertos / respondidas.length) * 100) : null,
    },
  };
}
