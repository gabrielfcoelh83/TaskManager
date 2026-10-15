// A fila das gravações de `profile_data`.
//
// O user-service MESCLA o `profile_data` no primeiro nível (`profile_data ||
// $3`; chave com null grava null, e o total mesclado tem teto de 20000
// bytes). Então cada gravação manda só as chaves que
// mudaram — `{ meta, dataProva }` juntas, ou `{ ficha }` — e nunca o objeto
// inteiro reconstruído a partir do que esta aba conhecia: uma aba
// desatualizada, mandando o objeto inteiro, desfaria a edição feita em outra
// aba (a ficha concluída lá, por exemplo).
//
// Uma de cada vez: dois PUT soltos podem chegar fora de ordem e o mais velho
// sobrescrever o mais novo na mesma chave. A resposta do servidor traz o
// `profile_data` inteiro já mesclado, e é ela que atualiza a cópia da tela.

/**
 * `salvar(parcial, extra)` faz o PUT e devolve o que o servidor respondeu,
 * com `preferencias` (o `profile_data` inteiro, já mesclado). `extra` passa
 * direto (o id e, na ficha, o nome, que vai no mesmo PUT).
 *
 * Uma fila por sessão: a da sessão anterior pode ainda ter um PUT no ar.
 */
export function criarFilaDePreferencias(salvar) {
  let cauda = Promise.resolve();

  return {
    /**
     * Entra na fila. Resolve com a resposta do servidor, ou com `null` se
     * `continuar()` disser que a sessão acabou antes da vez (o PUT não sai).
     * Rejeita com o erro do PUT.
     */
    gravar(parcial, { continuar = () => true, extra } = {}) {
      const vez = cauda.then(async () => {
        if (!continuar()) return null;
        return salvar({ ...(parcial || {}) }, extra);
      });
      // A falha de um PUT não trava os seguintes.
      cauda = vez.catch(() => {});
      return vez;
    },
  };
}

/**
 * Meta e data da prova vindas do servidor, para `state.configuracoes`.
 *
 * O servidor manda quando tem a chave: `dataProva: null` gravado é "sem
 * data" e vale. Chave ausente é preferência que esta conta nunca gravou, e aí
 * fica o valor local.
 */
export function configuracoesDoPerfil(preferencias, locais = {}) {
  const p = preferencias || {};
  return {
    meta: p.meta != null ? p.meta : locais.meta,
    dataProva: 'dataProva' in p ? (p.dataProva ?? null) : (locais.dataProva ?? null),
  };
}
