// A ficha de boas-vindas: o perfil de estudo que toda conta preenche antes de
// usar o app.
//
// Quem entrava caía num Dashboard vazio, com meta 20 e sem data de prova, sem
// ninguém ter perguntado nada. As respostas daqui viram a meta e a data da
// prova de sempre (`profile_data.meta` / `dataProva`, sem cópia) e a fatia
// `profile_data.ficha`, que diz que a ficha foi concluída e guarda o resto.
//
// Tudo aqui é puro: a tela (`FichaDeBoasVindas.jsx`) só desenha e chama.

import { FASES, FASE_PADRAO, ICONE_POR_DISCIPLINA } from './navegacao.js';

export const FICHA_VERSAO = 1;

/** A ficha só conta como feita com `concluidaEm`: é o que libera o app. */
export function fichaConcluida(preferencias) {
  return Boolean(preferencias?.ficha?.concluidaEm);
}

// Da segunda à domingo, na ordem em que a semana de estudo é pensada. A chave
// é o `getDay()` do JavaScript (0 = domingo), para quem for usar não precisar
// de tabela de tradução.
export const DIAS_DA_SEMANA = [
  { dia: 1, curto: 'Seg', nome: 'segunda' },
  { dia: 2, curto: 'Ter', nome: 'terça' },
  { dia: 3, curto: 'Qua', nome: 'quarta' },
  { dia: 4, curto: 'Qui', nome: 'quinta' },
  { dia: 5, curto: 'Sex', nome: 'sexta' },
  { dia: 6, curto: 'Sáb', nome: 'sábado' },
  { dia: 0, curto: 'Dom', nome: 'domingo' },
];

export const TEMPOS_POR_DIA = [
  { minutos: 30, rotulo: '30 min' },
  { minutos: 60, rotulo: '1 h' },
  { minutos: 120, rotulo: '2 h' },
  { minutos: 180, rotulo: '3 h ou mais' },
];

export const JA_FEZ = [
  { chave: 'nao', rotulo: 'Não, vai ser a primeira vez' },
  { chave: 'uma-vez', rotulo: 'Sim, 1 vez' },
  { chave: 'mais-de-uma', rotulo: 'Sim, mais de uma vez' },
];

// Ler o enunciado, responder e conferir o comentário. É a conta mostrada na
// tela, e por isso é um número redondo e explicável — não uma média medida.
export const MINUTOS_POR_QUESTAO = 3;
export const META_MAXIMA = 500;

/** A meta sugerida para quem estuda `minutos` por dia. */
export function metaSugerida(minutos) {
  const m = Number(minutos);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.min(META_MAXIMA, Math.max(1, Math.floor(m / MINUTOS_POR_QUESTAO)));
}

/** Meta digitada → inteiro entre 1 e 500, ou null se não é número. */
export function metaValida(valor) {
  if (valor === '' || valor == null) return null;
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(META_MAXIMA, n);
}

// As 18 disciplinas da 1ª fase que o app já conhece (os ícones de
// `navegacao.js`). Servem de lista quando o acervo ainda não carregou ou
// falhou: sem ela, o passo "pontos fracos" ficaria vazio e a pessoa não teria
// o que marcar.
export const DISCIPLINAS_OAB = Object.keys(ICONE_POR_DISCIPLINA);

/**
 * As matérias que dá para marcar como difíceis: as do acervo carregado, em
 * ordem alfabética. Questão sem disciplina não é matéria. Acervo vazio cai na
 * lista conhecida. Uma dificuldade já marcada que não está mais no acervo
 * continua na lista — senão sumiria da tela e seria apagada ao salvar.
 */
export function opcoesDeDificuldade(questoes = [], marcadas = []) {
  const doAcervo = new Set((questoes || []).map((q) => q?.disciplina).filter(Boolean));
  const base = doAcervo.size > 0 ? [...doAcervo] : [...DISCIPLINAS_OAB];
  for (const m of marcadas || []) if (!base.includes(m)) base.push(m);
  return base.sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O que a ficha mostra ao abrir. Conta antiga já tem nome, meta e data da
 * prova: vêm preenchidos, e a pessoa só confirma. Ficha já salva (a tela de
 * Configurações reabre os mesmos passos) volta com as respostas dela.
 */
export function respostasIniciais({ nome, configuracoes, fase, preferencias } = {}) {
  const ficha = preferencias?.ficha || {};
  const meta = metaValida(configuracoes?.meta ?? preferencias?.meta);
  const dataProva = configuracoes?.dataProva ?? preferencias?.dataProva ?? null;
  const faseSalva = FASES.some((f) => f.chave === ficha.fase) ? ficha.fase : null;

  return {
    nome: (nome || '').trim(),
    fase: faseSalva || (FASES.some((f) => f.chave === fase) ? fase : FASE_PADRAO),
    dataProva: typeof dataProva === 'string' && DATA_ISO.test(dataProva) ? dataProva : '',
    // "Ainda não sei" só vem marcado se a ficha já foi feita e a pessoa
    // respondeu assim. Conta antiga sem data começa com a pergunta em aberto.
    dataIndefinida: Boolean(ficha.concluidaEm) && !dataProva,
    jaFez: JA_FEZ.some((j) => j.chave === ficha.jaFez) ? ficha.jaFez : null,
    diasDaSemana: Array.isArray(ficha.diasDaSemana) ? ficha.diasDaSemana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    minutosPorDia: TEMPOS_POR_DIA.some((t) => t.minutos === ficha.minutosPorDia) ? ficha.minutosPorDia : null,
    // A meta que já existe vem preenchida; escolher o tempo por dia a troca
    // pela sugestão (ver `escolherTempo`), e a pessoa pode editar de novo.
    meta: meta ?? '',
    dificuldades: Array.isArray(ficha.dificuldades) ? ficha.dificuldades.filter((d) => typeof d === 'string') : [],
    dificuldadesIndefinidas: Boolean(ficha.concluidaEm) && Array.isArray(ficha.dificuldades) && ficha.dificuldades.length === 0,
  };
}

/** Trocar o tempo por dia reescreve a meta com a sugestão nova. */
export function escolherTempo(respostas, minutos) {
  return { ...respostas, minutosPorDia: minutos, meta: metaSugerida(minutos) ?? respostas.meta };
}

export const PASSOS = [
  { chave: 'voce', titulo: 'Você' },
  { chave: 'prova', titulo: 'A prova' },
  { chave: 'rotina', titulo: 'Sua rotina' },
  { chave: 'dificuldades', titulo: 'Pontos fracos' },
];

/**
 * O que falta responder no passo, em texto para a tela — ou null se dá para
 * continuar. `hoje` é injetável para o teste não depender do relógio.
 */
export function erroDoPasso(passo, r, hoje = new Date()) {
  if (passo === 0) {
    if (!r.nome?.trim()) return 'Diga como você quer ser chamado(a).';
    if (!FASES.some((f) => f.chave === r.fase)) return 'Escolha a fase que você vai fazer.';
  }
  if (passo === 1) {
    if (!r.dataIndefinida) {
      if (!r.dataProva || !DATA_ISO.test(r.dataProva)) return 'Informe a data da prova ou marque "Ainda não sei".';
      const d = new Date(`${r.dataProva}T12:00:00`);
      if (Number.isNaN(d.getTime())) return 'Essa data não existe.';
      const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      if (r.dataProva < hojeIso) return 'Essa data já passou. Se ainda não sabe a próxima, marque "Ainda não sei".';
    }
    if (!JA_FEZ.some((j) => j.chave === r.jaFez)) return 'Diga se você já fez o Exame de Ordem antes.';
  }
  if (passo === 2) {
    if (!r.diasDaSemana?.length) return 'Marque pelo menos um dia da semana.';
    if (!TEMPOS_POR_DIA.some((t) => t.minutos === r.minutosPorDia)) return 'Escolha quanto tempo você estuda por dia.';
    if (metaValida(r.meta) == null) return 'A meta diária tem de ser um número de 1 a 500.';
  }
  if (passo === 3) {
    if (!r.dificuldadesIndefinidas && !r.dificuldades?.length) {
      return 'Marque as matérias em que tem mais dificuldade, ou "Ainda não sei".';
    }
  }
  return null;
}

/**
 * O que vai para o servidor: `meta` e `dataProva` (as de sempre) e a fatia
 * `ficha`. Quem reabre a ficha pelas Configurações mantém a data da primeira
 * conclusão; `atualizadaEm` marca a edição.
 */
export function montarFicha(r, { anterior = null, agora = new Date() } = {}) {
  const iso = agora.toISOString();
  const ordemDosDias = DIAS_DA_SEMANA.map((d) => d.dia);
  const ficha = {
    versao: FICHA_VERSAO,
    concluidaEm: anterior?.concluidaEm || iso,
    fase: r.fase,
    jaFez: r.jaFez,
    diasDaSemana: [...new Set(r.diasDaSemana)].sort((a, b) => ordemDosDias.indexOf(a) - ordemDosDias.indexOf(b)),
    minutosPorDia: r.minutosPorDia,
    dificuldades: r.dificuldadesIndefinidas ? [] : [...new Set(r.dificuldades)],
  };
  if (anterior?.concluidaEm) ficha.atualizadaEm = iso;

  return {
    nome: r.nome.trim(),
    preferencias: {
      meta: metaValida(r.meta),
      dataProva: r.dataIndefinida ? null : r.dataProva,
      ficha,
    },
  };
}

// ---- Textos do resumo (tela final e Configurações) ----

export function rotuloDaFase(chave) {
  const f = FASES.find((x) => x.chave === chave);
  if (!f) return '—';
  return f.chave === FASE_PADRAO ? '1ª fase (objetiva)' : `2ª fase · ${f.rotulo}`;
}

export function rotuloDosDias(dias = []) {
  if (!dias.length) return '—';
  if (dias.length === 7) return 'todos os dias';
  return DIAS_DA_SEMANA.filter((d) => dias.includes(d.dia)).map((d) => d.curto).join(', ');
}

export function rotuloDoTempo(minutos) {
  return TEMPOS_POR_DIA.find((t) => t.minutos === minutos)?.rotulo || '—';
}

export function rotuloJaFez(chave) {
  return JA_FEZ.find((j) => j.chave === chave)?.rotulo || '—';
}

export function formatarData(iso) {
  if (!iso || !DATA_ISO.test(iso)) return 'Ainda não sei';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
