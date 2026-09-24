// O histórico de tentativas na memória do front.
//
// A carga do histórico leva uma ida ao servidor por página, e a pessoa pode
// responder questão antes de ela terminar — o acervo costuma chegar primeiro.
// A resposta gravada nesse meio-tempo entra no topo da lista do servidor
// depois que as primeiras páginas já foram lidas, então não vem na carga.
// Substituir o estado pelo que a carga trouxe apagava essa resposta da tela
// (da meta, da sequência, da revisão) até a próxima abertura do app.

/**
 * Junta o histórico carregado do servidor com o que `registrar` gravou nesta
 * sessão enquanto a carga corria.
 *
 * Nos ids que aparecem nos dois, vence `recentes`: é a versão mais nova que o
 * front conhece — pode trazer um feedback ("foi chute") que o servidor ainda
 * não tinha quando a página foi lida. As que só existem em `recentes` vão para
 * o fim do array, que é cronológico: são as respostas mais novas.
 */
export function mesclarTentativas(carregadas = {}, recentes = {}) {
  const resultado = { ...carregadas };

  for (const [questaoId, registro] of Object.entries(recentes)) {
    const base = resultado[questaoId];
    if (!base) {
      resultado[questaoId] = registro;
      continue;
    }

    // Por texto: o id vem do Postgres como string, mas nada garante que o
    // registro local não tenha passado por um número no caminho.
    const locais = new Map(
      registro.tentativas.filter((t) => t.id != null).map((t) => [String(t.id), t])
    );
    const tentativas = base.tentativas.map((t) => locais.get(String(t.id)) || t);

    const conhecidas = new Set(base.tentativas.map((t) => String(t.id)));
    for (const t of registro.tentativas) {
      if (t.id == null || !conhecidas.has(String(t.id))) tentativas.push(t);
    }

    resultado[questaoId] = { ...base, tentativas };
  }

  return resultado;
}
