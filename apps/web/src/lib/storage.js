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

    return mesclarComPadrao(defaults, parsed);
  } catch {
    return defaults;
  }
}

function mesclarComPadrao(defaults, salvo) {
  const resultado = { ...defaults };

  for (const [chave, valor] of Object.entries(salvo)) {
    const padrao = defaults[chave];
    resultado[chave] = ehObjetoSimples(padrao) && ehObjetoSimples(valor)
      ? { ...padrao, ...valor }
      : valor;
  }

  return resultado;
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // modo privado ou quota estourada: o app continua, só não lembra depois
  }
}

/**
 * Apaga o estado da interface — não os dados da conta, que têm chave própria
 * (ver abaixo).
 *
 * Sem isto, sair de uma conta e entrar em outra no mesmo computador mantinha
 * as telas da pessoa anterior — filtros, quiz em andamento — e o app mostrava
 * o estado de alguém sem nunca ter mentido explicitamente sobre isso.
 */
export function limparEstado() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // idem: nada a fazer, e não vale derrubar a tela
  }
}

// ---------------------------------------------------------------------------
// Dados da conta
// ---------------------------------------------------------------------------
//
// Favoritos, anotações e o histórico de simulado não têm rota na API: moram
// neste navegador. Enquanto moravam só no estado da interface, o logout tinha
// de escolher entre apagá-los — e a pessoa perdia o que tinha escrito e as
// notas das provas que fez ao clicar em "Sair" — e mantê-los, mostrando-os a
// quem entrasse depois no mesmo computador. Com uma chave por conta, nenhuma
// das duas coisas acontece.
//
// O histórico de simulado não é só a lista da tela de Simulados: `metaDiaria`
// e `sequenciaAtual` também o leem. Apagá-lo no logout mudava a meta do dia e
// podia encurtar a sequência de quem só tinha saído e entrado de novo.
//
// Não é sigilo: a chave de outra conta continua legível nas ferramentas do
// navegador. O que ela garante é que a tela de uma conta não mostra o que é de
// outra. Sigilo de verdade, e dado que acompanha a pessoa entre aparelhos, só
// com rota na API.

const PREFIXO_CONTA = 'ma-questoes-conta-v1:';
export const FATIAS_DA_CONTA = ['favoritos', 'anotacoes', 'resultados_historico'];

// Campos dessas fatias que são da tela, e não da conta: a pasta aberta e a
// nota selecionada mudam só de clicar. Se fossem para a chave da conta, uma
// aba desatualizada sobrescreveria a nota nova da outra só porque alguém
// abriu outra nota nela.
const CAMPOS_DA_TELA = { anotacoes: ['folder', 'activeId'] };

const chaveDaConta = (id) => `${PREFIXO_CONTA}${id}`;

function recorteDaConta(estado) {
  return Object.fromEntries(
    FATIAS_DA_CONTA.filter((fatia) => estado[fatia] !== undefined).map((fatia) => {
      const valor = estado[fatia];
      const daTela = CAMPOS_DA_TELA[fatia];
      if (!daTela || !ehObjetoSimples(valor)) return [fatia, valor];
      return [fatia, Object.fromEntries(Object.entries(valor).filter(([campo]) => !daTela.includes(campo)))];
    })
  );
}

export function carregarDadosDaConta(id) {
  if (id == null) return {};
  try {
    return lerDadosDaConta(localStorage.getItem(chaveDaConta(id)));
  } catch {
    return {};
  }
}

/**
 * Os dados da conta a partir do texto gravado na chave — o que
 * `carregarDadosDaConta` lê do localStorage, e o que chega no `newValue` do
 * evento `storage` quando outra aba grava.
 */
export function lerDadosDaConta(texto) {
  try {
    const parsed = JSON.parse(texto || '{}');
    if (!ehObjetoSimples(parsed)) return {};

    // Só as fatias da conta, e sem os campos da tela: uma chave adulterada (ou
    // gravada antes de `CAMPOS_DA_TELA` existir) não pode trocar tema, tela,
    // `__usuario`, pasta aberta ou nota selecionada de quem entrar.
    return recorteDaConta(parsed);
  } catch {
    return {};
  }
}

/** O id da conta dona de uma chave do localStorage, ou `null` se não for chave de conta. */
export function contaDaChave(chave) {
  if (typeof chave !== 'string' || !chave.startsWith(PREFIXO_CONTA)) return null;
  return chave.slice(PREFIXO_CONTA.length) || null;
}

// O que esta aba gravou por último em cada conta.
//
// O App grava a cada mudança de estado — trocar de tela inclusive. Com duas
// abas da mesma conta abertas, a desatualizada sobrescrevia a nota que a outra
// acabou de criar só porque alguém clicou no menu dela. Pular a gravação
// quando os dados da conta não mudaram desde a última vez DESTA aba resolve
// isso — junto com `CAMPOS_DA_TELA`, com a chave valendo na abertura (ver
// `estadoDaConta`) e com as abas se atualizando pelo evento `storage` (ver
// `registrarRecebido`). Duas abas editando quase no mesmo instante, antes de
// uma receber o evento da outra, ainda terminam com a gravação da última.
const ultimaGravacao = new Map();

export function salvarDadosDaConta(id, estado) {
  if (id == null) return;
  try {
    const chave = chaveDaConta(id);
    const dados = JSON.stringify(recorteDaConta(estado));
    if (ultimaGravacao.get(chave) === dados) return;

    localStorage.setItem(chave, dados);
    ultimaGravacao.set(chave, dados);
  } catch {
    // modo privado ou quota: o que está na tela continua valendo nesta aba
  }
}

/**
 * Marca como já gravado o que chegou de outra aba pelo evento `storage`.
 *
 * Sem isto, a aba que recebe aplicava os dados, e o efeito de gravação —
 * que compara com a última gravação DESTA aba, não com o que está na chave —
 * regravava a mesma versão. Com a pessoa digitando na outra aba, esse eco
 * chegava atrasado e sobrescrevia o que ela já tinha digitado depois: o
 * texto voltava atrás. Chamar antes de aplicar os dados faz o efeito pular.
 */
export function registrarRecebido(id, texto) {
  if (id == null) return;
  ultimaGravacao.set(chaveDaConta(id), JSON.stringify(lerDadosDaConta(texto)));
}

/**
 * Os dados com que a conta do token abre o app.
 *
 * Normalmente, os da chave dela. A exceção é o estado salvo SEM dono por uma
 * versão anterior do app, que só marcava o dono quando o perfil carregava — e,
 * para conta sem perfil no servidor, nunca marcava. Tratar esse estado como
 * alheio apagava os favoritos e as anotações dessa pessoa no primeiro acesso
 * depois da atualização, porque a chave dela ainda não existia.
 *
 * Só na abertura, com o token já presente: quem escreveu esse estado foi a
 * sessão deste token. No login não vale — lá, um estado sem dono pode ser de
 * quem saiu antes.
 */
export function dadosNaAbertura(salvo, dadosDaConta) {
  if (salvo.__usuario != null || Object.keys(dadosDaConta).length > 0) return dadosDaConta;
  return recorteDaConta(salvo);
}

/**
 * O estado com que uma conta começa ao entrar.
 *
 * Outra conta, ou nenhuma (depois de um logout): recomeça do padrão, mantendo
 * o tema — que é do aparelho, não da conta — e recupera os favoritos, as
 * anotações e o histórico de simulado guardados para ela.
 *
 * Mesma conta: a tela segue como está, mas os dados da conta vêm da chave
 * dela. O estado da interface é regravado por qualquer aba a cada troca de
 * tela; com duas abas abertas, a desatualizada deixava nele uma versão velha
 * das notas, e recarregar a página a trazia de volta por cima da nova. A
 * chave só é gravada quando os dados da conta mudam, então é ela que tem a
 * versão mais recente.
 *
 * Pura de propósito: roda dentro de um updater do `setState`, então quem
 * chama lê `carregarDadosDaConta` antes e passa o resultado.
 */
export function estadoDaConta(atual, id, defaults, dadosDaConta = {}) {
  // `mesclarComPadrao` desce um nível: da chave vêm só os campos que ela
  // tem, e a pasta aberta e a nota selecionada desta aba ficam como estão.
  if (atual.__usuario != null && String(atual.__usuario) === String(id)) {
    return Object.keys(dadosDaConta).length === 0 ? atual : mesclarComPadrao(atual, dadosDaConta);
  }

  return {
    ...mesclarComPadrao(defaults, dadosDaConta),
    theme: atual.theme,
    __usuario: id,
  };
}
