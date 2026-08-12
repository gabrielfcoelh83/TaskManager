// O estado da interface que sobrevive ao recarregar a página.
//
// Aqui ficam preferências e coisas que ainda não têm rota na API (favoritos,
// anotações, histórico de simulado). O que É do servidor — tentativas, acervo,
// perfil — não passa por aqui de propósito: duas fontes de verdade divergem em
// silêncio na primeira gravação que falha.

const KEY = 'ma-questoes-state-v1';

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Lê o estado salvo e completa o que faltar com os padrões.
 *
 * O merge desce um nível, e isso não é detalhe: `{...defaults, ...parsed}`
 * puro substitui a fatia inteira, então um campo NOVO dentro de
 * `configuracoes` nunca chegava a quem já tinha usado o app — a fatia salva
 * (sem o campo) vencia o padrão (com o campo), e a tela quebrava só para
 * usuário antigo, que é o pior lugar para um bug aparecer.
 */
export function loadState(defaults) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    if (!ehObjetoSimples(parsed)) return defaults;

    const resultado = { ...defaults };

    for (const [chave, valor] of Object.entries(parsed)) {
      const padrao = defaults[chave];
      resultado[chave] = ehObjetoSimples(padrao) && ehObjetoSimples(valor)
        ? { ...padrao, ...valor }
        : valor;
    }

    return resultado;
  } catch {
    return defaults;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // modo privado ou quota estourada: o app continua, só não lembra depois
  }
}

/**
 * De quem é o estado que está salvo neste navegador.
 *
 * Sem isto, sair de uma conta e entrar em outra no mesmo computador mantinha
 * favoritos, anotações e histórico de simulado da pessoa anterior — o app
 * mostrava dados de alguém sem nunca ter mentido explicitamente sobre isso.
 */
export function limparEstado() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // idem: nada a fazer, e não vale derrubar a tela
  }
}
