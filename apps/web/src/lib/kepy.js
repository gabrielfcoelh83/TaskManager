// O que o Kepy diz. Sem IA: as falas e as respostas saem dos mesmos números
// que o resto do app mostra (meta do dia, plano da semana, revisões, prova),
// e cada resposta traz o próximo passo como ação. Quando houver um modelo de
// verdade, `responder` é o ponto de troca — a tela só conhece o formato
// `{ texto, acoes }`.
//
// Uma ação é `{ id, rotulo, icone, estudar }` (abre o quiz da matéria) ou
// `{ id, rotulo, icone, ir }` (troca de tela).
//
// contexto: {
//   meta: { meta, respondidas, faltam, batida },
//   materia: { disciplina, motivo } | null,   // a de hoje no plano
//   foco: string,                             // a frase do foco do dia
//   erros, diasProva, temDataProva, sequenciaDias,
//   disciplinas: string[],                    // nomes do acervo
// }

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Minúsculas e sem acento: "Ética" e "etica" são a mesma pergunta.
export const normalizar = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavras que não identificam matéria nenhuma — quase todas começam assim.
const GENERICAS = new Set(['direito', 'direitos', 'processual', 'processo', 'do', 'da', 'de', 'dos', 'das', 'e']);

const acaoEstudar = (ctx, disciplina) => ({
  id: 'foco-do-dia',
  icone: 'play',
  rotulo: `${ctx.meta.batida ? 'Continuar em' : 'Estudar'} ${disciplina}`,
  estudar: disciplina,
});
const acaoDeHoje = (ctx) => (ctx.materia?.disciplina
  ? acaoEstudar(ctx, ctx.materia.disciplina)
  : { id: 'kepy-questoes', icone: 'book-open', rotulo: 'Ir para Questões', ir: 'questoes' });
const acaoRevisar = (ctx) => ({
  id: 'kepy-revisoes', icone: 'repeat', rotulo: `Revisar ${plural(ctx.erros, 'questão errada', 'questões erradas')}`, ir: 'revisoes',
});
const acaoPlano = { id: 'kepy-plano', icone: 'calendar', rotulo: 'Ver o plano da semana', ir: 'cronograma' };
const acaoDataProva = { id: 'kepy-data-prova', icone: 'flag', rotulo: 'Definir a data da prova', ir: 'configuracoes' };

/** O guia: falas do dia e as ações que cabem agora. */
export function guiaDoDia(ctx) {
  const falas = [ctx.foco];
  if (ctx.sequenciaDias >= 2) {
    falas.push(ctx.meta.batida
      ? `${plural(ctx.sequenciaDias, 'dia', 'dias')} seguidos de estudo, e hoje já conta.`
      : `${plural(ctx.sequenciaDias, 'dia', 'dias')} seguidos de estudo. Responder hoje mantém a sequência.`);
  }
  if (ctx.diasProva != null && ctx.diasProva <= 30) {
    falas.push(ctx.diasProva === 0
      ? 'A prova é hoje. Revise o que você mais erra e confie no que já estudou.'
      : `Faltam ${plural(ctx.diasProva, 'dia', 'dias')} para a prova: vale priorizar a revisão do que você erra.`);
  }

  const acoes = [acaoDeHoje(ctx)];
  if (ctx.erros > 0) acoes.push(acaoRevisar(ctx));
  if (!ctx.temDataProva) acoes.push(acaoDataProva);
  acoes.push(acaoPlano);
  return { falas, acoes };
}

/** Status curto da barra: o que muda ao longo do dia. */
export function statusDoDia(ctx) {
  if (ctx.meta.batida) return `Meta batida · ${ctx.meta.respondidas} hoje`;
  return `${ctx.meta.respondidas}/${ctx.meta.meta} hoje · faltam ${ctx.meta.faltam}`;
}

// A matéria citada na mensagem: a que tem mais palavras próprias presentes
// ("processo penal" fica com Processo Penal, não com Direito Penal).
export function materiaCitada(mensagem, disciplinas = []) {
  const msg = normalizar(mensagem);
  const palavrasDaMsg = new Set(msg.split(/[^a-z0-9]+/).filter(Boolean));
  let melhor = null;
  let melhorPontos = 0;
  for (const nome of disciplinas) {
    const palavras = normalizar(nome).split(/[^a-z0-9]+/).filter(Boolean);
    const proprias = palavras.filter((p) => !GENERICAS.has(p) && p.length >= 3);
    if (!proprias.length) continue;
    const casadas = proprias.filter((p) => palavrasDaMsg.has(p) || (p.length >= 6 && msg.includes(p.slice(0, 6)))).length;
    // Todas as palavras gerais do nome também contam, para desempatar
    // "Direito Processual Penal" de "Direito Penal" quando dizem "processo".
    const extras = palavras.filter((p) => GENERICAS.has(p) && p.length > 3 && msg.includes(p.slice(0, 7))).length;
    const pontos = casadas > 0 ? casadas * 10 + extras : 0;
    if (pontos > melhorPontos) { melhor = nome; melhorPontos = pontos; }
  }
  return melhor;
}

const tem = (msg, ...raizes) => raizes.some((r) => msg.includes(r));

/** Responde a uma mensagem livre com `{ texto, acoes }`. */
export function responder(mensagem, ctx) {
  const msg = normalizar(mensagem).trim();
  const { meta } = ctx;

  if (!msg) return { texto: 'Pode perguntar.', acoes: [] };

  if (tem(msg, 'revis', 'errei', 'erro', 'errad')) {
    return ctx.erros > 0
      ? { texto: `Você tem ${plural(ctx.erros, 'questão errada', 'questões erradas')} na última tentativa. Revisar agora é o jeito mais barato de não errar de novo.`, acoes: [acaoRevisar(ctx)] }
      : { texto: 'Nada errado esperando revisão. Bom sinal — siga no plano do dia.', acoes: [acaoDeHoje(ctx)] };
  }

  const materia = materiaCitada(mensagem, ctx.disciplinas);
  if (materia) {
    return { texto: `Bora de ${materia}. Abro um quiz do tamanho da sua meta, com as que você nunca respondeu primeiro.`, acoes: [acaoEstudar(ctx, materia)] };
  }

  if (tem(msg, 'plano', 'semana', 'cronograma', 'estudar', 'comec', 'o que fa')) {
    const texto = ctx.materia?.disciplina
      ? `Hoje o plano é ${ctx.materia.disciplina}${ctx.materia.motivo ? ` — ${ctx.materia.motivo}` : ''}.`
      : 'Ainda não há matéria definida para hoje. Responda algumas questões e o plano se ajusta.';
    return { texto, acoes: [acaoDeHoje(ctx), acaoPlano] };
  }

  // Prova antes da meta: "quanto falta para a prova" é sobre a prova.
  if (tem(msg, 'prova', 'exame', 'oab')) {
    if (!ctx.temDataProva || ctx.diasProva == null) {
      return { texto: 'Você ainda não me disse a data da prova. Com ela eu conto os dias e aperto a revisão na reta final.', acoes: [acaoDataProva] };
    }
    return {
      texto: ctx.diasProva === 0 ? 'A prova é hoje. Boa prova!' : `Faltam ${plural(ctx.diasProva, 'dia', 'dias')} para a prova.`,
      acoes: ctx.diasProva <= 30 && ctx.erros > 0 ? [acaoRevisar(ctx)] : [acaoPlano],
    };
  }

  if (tem(msg, 'meta', 'falta', 'quanto')) {
    const texto = meta.batida
      ? `Você já bateu a meta: ${meta.respondidas} de ${meta.meta} hoje. Quer aproveitar o embalo e seguir no plano?`
      : `Você fez ${meta.respondidas} de ${meta.meta}. Faltam ${plural(meta.faltam, 'questão', 'questões')} para a meta de hoje.`;
    return { texto, acoes: [acaoDeHoje(ctx)] };
  }

  if (tem(msg, 'simulad')) {
    return { texto: 'Simulado mede o ritmo de prova. Escolha o tamanho e o tempo na tela de Simulados.', acoes: [{ id: 'kepy-simulados', icone: 'timer', rotulo: 'Abrir Simulados', ir: 'simulados' }] };
  }

  if (tem(msg, 'desempenh', 'evolu', 'como estou', 'taxa', 'acerto')) {
    return { texto: 'Sua evolução semana a semana e o tempo por questão estão em Desempenho.', acoes: [{ id: 'kepy-desempenho', icone: 'trending-up', rotulo: 'Ver desempenho', ir: 'desempenho' }] };
  }

  // Por palavra inteira: "oi" está dentro de "noite", "foi", "dois".
  if (/^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite)\b/.test(msg)) {
    return { texto: `Oi! ${ctx.foco}`, acoes: [acaoDeHoje(ctx)] };
  }

  return {
    texto: 'Ainda não converso sobre tudo. Por enquanto entendo meta, revisão, prova, plano da semana, simulados e o nome das matérias.',
    acoes: [acaoDeHoje(ctx)],
  };
}

/** Perguntas prontas para quem abre a conversa sem saber o que digitar. */
export const SUGESTOES = ['Quanto falta para a meta?', 'O que eu revisei mal?', 'Quando é a prova?', 'O que estudar hoje?'];
