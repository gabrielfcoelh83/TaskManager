// O cronograma.
//
// A tela anterior era um cartaz: "180 dias", "início 03/03/2025", "65% do
// plano concluído", "312h 45m estudadas", "4.312 questões respondidas",
// calendário parado em maio de 2025 com o dia 13 aceso. Nada disso vinha de
// lugar nenhum, e o botão "Iniciar estudo" somava 40% na barra a cada clique.
//
// Um cronograma honesto neste app só pode ser duas coisas: uma SUGESTÃO
// derivada do que a pessoa erra mais, e um REGISTRO do que ela de fato fez.
// As duas estão aqui, e a tela deixa claro qual é qual.
//
// A sugestão respeita a rotina da ficha de boas-vindas: os dias da semana que
// a pessoa marcou são dias de estudo; os outros são folga, sem matéria e sem
// meta. Sem ficha (ou sem dias marcados), todo dia é dia de estudo.

import { dateKey } from './metrics.js';
import { prioridadeDeEstudo } from './disciplinas.js';

const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// O bloco de estudo que vai para o Google Agenda: começa no horário que a
// pessoa escolheu (`profile_data.agenda.horario`) e dura o tempo por dia da
// ficha. 19h e 1 h 30 quando nenhum dos dois existe.
export const HORARIO_PADRAO = '19:00';
export const MINUTOS_PADRAO = 90;
export const FUSO_PADRAO = 'America/Sao_Paulo';

// A marca na descrição dos eventos: diz a quem abre a agenda de onde o
// evento veio (e o que o apaga quando o plano muda).
export const MARCA_DOS_EVENTOS = 'mlkoab';

const HORARIO = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Quantas questões foram respondidas em cada dia. Base dos dois blocos. */
export function respondidasPorDia(tentativas = {}) {
  const contagem = {};

  for (const registro of Object.values(tentativas)) {
    for (const t of registro?.tentativas || []) {
      const dia = t.data ? dateKey(t.data) : null;
      if (dia) contagem[dia] = (contagem[dia] || 0) + 1;
    }
  }

  return contagem;
}

/**
 * Os dias de estudo da ficha (`getDay()`, 0 = domingo), ou `null` quando a
 * ficha não diz — e aí todo dia é dia de estudo, como antes da ficha. Lista
 * vazia também é `null`: a ficha exige um dia ao menos, então vazio é dado
 * estragado, e um plano só de folgas não serviria a ninguém.
 */
export function diasDeEstudoDaFicha(ficha) {
  const dias = Array.isArray(ficha?.diasDaSemana)
    ? [...new Set(ficha.diasDaSemana.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  return dias.length > 0 ? dias : null;
}

function ehDiaDeEstudo(data, diasDeEstudo) {
  return !diasDeEstudo || diasDeEstudo.includes(data.getDay());
}

/** 'HH:MM' válido (00:00 a 23:59) ou null. */
export function horarioValido(valor) {
  return typeof valor === 'string' && HORARIO.test(valor) ? valor : null;
}

/**
 * O bloco de estudo: horário de `profile_data.agenda.horario` e duração do
 * `ficha.minutosPorDia`. Valor estragado cai no padrão em vez de virar um
 * evento às "undefined".
 */
export function blocoDeEstudo(preferencias) {
  const minutos = Number(preferencias?.ficha?.minutosPorDia);
  return {
    horario: horarioValido(preferencias?.agenda?.horario) || HORARIO_PADRAO,
    minutos: Number.isInteger(minutos) && minutos > 0 && minutos <= 24 * 60 ? minutos : MINUTOS_PADRAO,
  };
}

/** 90 → "1 h 30"; 60 → "1 h"; 30 → "30 min". */
export function duracaoLegivel(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** "19:00 · 1 h 30", o que a tela mostra em cada dia de estudo. */
export function blocoLegivel({ horario, minutos }) {
  return `${horario} · ${duracaoLegivel(minutos)}`;
}

/**
 * Sete dias a partir de hoje, cada um com uma disciplina sugerida — ou folga.
 *
 * A sugestão sai da ordem de prioridade (o que se erra mais primeiro) e não se
 * repete enquanto houver matéria nova. Só os dias de estudo consomem a fila:
 * uma folga no meio não "gasta" a matéria seguinte. O progresso do dia é
 * real: questões respondidas naquele dia sobre a meta do dia (a meta diária
 * nos dias de estudo, zero na folga). Dias futuros não têm progresso, e a tela
 * mostra isso como "planejado" em vez de uma barra em zero.
 */
export function planoDaSemana({
  disciplinas = [], tentativas = {}, meta = 20, hoje = new Date(), dificuldades = [], diasDeEstudo = null,
} = {}) {
  const prioridade = prioridadeDeEstudo(disciplinas, { dificuldades });
  const porDia = respondidasPorDia(tentativas);
  const hojeChave = dateKey(hoje);
  let estudo = 0;

  return Array.from({ length: 7 }, (_, i) => {
    const data = new Date(hoje);
    data.setDate(data.getDate() + i);
    const chave = dateKey(data);
    const folga = !ehDiaDeEstudo(data, diasDeEstudo);

    const sugerida = !folga && prioridade.length > 0 ? prioridade[estudo % prioridade.length] : null;
    if (!folga) estudo += 1;
    const respondidas = porDia[chave] || 0;
    const metaDoDia = folga ? 0 : meta;

    return {
      chave,
      dow: DOW[data.getDay()],
      dia: data.getDate(),
      hoje: chave === hojeChave,
      futuro: chave > hojeChave,
      folga,
      disciplina: sugerida?.nome || null,
      cor: sugerida?.cor || null,
      // O motivo da sugestão vai junto: conselho sem motivo é palpite.
      motivo: sugerida ? motivoDaSugestao(sugerida) : null,
      questoesDisponiveis: sugerida?.total || 0,
      respondidas,
      meta: metaDoDia,
      pct: metaDoDia > 0 ? Math.min(100, Math.round((respondidas / metaDoDia) * 100)) : 0,
    };
  });
}

function motivoDaSugestao(d) {
  if (d.pontoFraco) return 'você marcou como ponto fraco na sua ficha';
  if (d.status === 'novo') return `${d.total} ${d.total === 1 ? 'questão' : 'questões'} que você ainda não respondeu`;
  if (d.status === 'necessita') return `sua taxa aqui é de ${d.pct}%`;
  if (d.status === 'em-desenvolvimento') return `${d.pct}% de acerto — dá para subir`;
  return `${d.pct}% de acerto, só para manter`;
}

/**
 * O ritmo da semana CORRENTE — de domingo, como o calendário, até hoje.
 *
 * Antes era o respondido nos próximos 7 dias sobre a meta dos 7: quem batia a
 * meta de hoje via ~14%, porque os outros seis dias ainda nem tinham chegado.
 * Agora conta só o que já podia ter sido feito: as respondidas nos dias de
 * estudo de domingo até hoje sobre a soma das metas desses dias. O que foi
 * respondido numa folga é bônus e não entra (nem no numerador nem no
 * denominador). `pct` é `null` quando ainda não houve dia de estudo na semana
 * (domingo de folga, por exemplo): 0% diria "atrasado" a quem descansou.
 */
export function ritmoDaSemana({ tentativas = {}, meta = 20, diasDeEstudo = null, hoje = new Date() } = {}) {
  const porDia = respondidasPorDia(tentativas);
  let respondidas = 0;
  let metaAteHoje = 0;
  let dias = 0;

  for (let i = hoje.getDay(); i >= 0; i--) {
    const data = new Date(hoje);
    data.setDate(data.getDate() - i);
    if (!ehDiaDeEstudo(data, diasDeEstudo)) continue;
    dias += 1;
    respondidas += porDia[dateKey(data)] || 0;
    metaAteHoje += meta;
  }

  return {
    respondidas,
    meta: metaAteHoje,
    dias,
    pct: metaAteHoje > 0 ? Math.round((respondidas / metaAteHoje) * 100) : null,
  };
}

/**
 * O mês (`ano`, `mes` de 0 a 11) somado de `deslocamento` meses — o que as
 * setas do calendário fazem. Pelo `Date` para virar o ano sozinho.
 */
export function mesDeslocado(hoje = new Date(), deslocamento = 0) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1);
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

// Doze meses para trás bastam para rever o registro; para a frente, só até o
// mês do último dia do plano (hoje + 6): depois dele não há nada a mostrar.
export const MESES_PARA_TRAS = 12;

/** Até onde as setas do calendário vão, em meses a partir do mês de hoje. */
export function limitesDoCalendario(hoje = new Date()) {
  const fimDoPlano = new Date(hoje);
  fimDoPlano.setDate(fimDoPlano.getDate() + 6);
  const meses = (fimDoPlano.getFullYear() - hoje.getFullYear()) * 12 + fimDoPlano.getMonth() - hoje.getMonth();
  return { min: -MESES_PARA_TRAS, max: meses };
}

/**
 * Um mês com os dias em que houve atividade.
 *
 * `ano`/`mes` escolhem o mês (padrão: o de hoje). `planejados` são as chaves
 * dos próximos dias de estudo do plano, marcadas à parte do registro.
 *
 * Começa alinhado no domingo (as células vazias no início existem para o dia
 * 1 cair na coluna certa — sem elas o calendário mostra a data debaixo do dia
 * da semana errado, que é pior que não ter calendário).
 */
export function diasDoMes(tentativas = {}, { hoje = new Date(), ano, mes, planejados = [] } = {}) {
  const porDia = respondidasPorDia(tentativas);
  const a = Number.isInteger(ano) ? ano : hoje.getFullYear();
  const m = Number.isInteger(mes) ? mes : hoje.getMonth();
  const hojeChave = dateKey(hoje);
  const noPlano = new Set(planejados);

  const primeiro = new Date(a, m, 1);
  const totalDeDias = new Date(a, m + 1, 0).getDate();

  const celulas = Array.from({ length: primeiro.getDay() }, () => ({ vazia: true }));

  for (let n = 1; n <= totalDeDias; n++) {
    const chave = dateKey(new Date(a, m, n));
    celulas.push({
      vazia: false,
      n,
      chave,
      respondidas: porDia[chave] || 0,
      hoje: chave === hojeChave,
      planejado: chave > hojeChave && noPlano.has(chave),
    });
  }

  return { rotulo: `${MESES[m]} ${a}`, celulas };
}

/**
 * O resumo do lado direito. Todo número aqui é contado, não estimado — por
 * isso não há "horas estudadas": o app registra o tempo de cada questão, e
 * somar isso e chamar de "horas de estudo" seria contar só o tempo com a
 * questão aberta na tela.
 */
export function resumoDoPlano({ tentativas = {}, disciplinas = [], hoje = new Date() } = {}) {
  const porDia = respondidasPorDia(tentativas);
  const dias = Object.keys(porDia);

  const respondidas = Object.values(porDia).reduce((soma, n) => soma + n, 0);
  const acervo = disciplinas.reduce((soma, d) => soma + d.total, 0);
  const questoesTocadas = disciplinas.reduce((soma, d) => soma + d.respondidas, 0);

  return {
    diasAtivos: dias.length,
    respondidas,
    acervo,
    questoesTocadas,
    cobertura: acervo > 0 ? Math.round((questoesTocadas / acervo) * 100) : 0,
    hojeRespondidas: porDia[dateKey(hoje)] || 0,
  };
}

// ---------------------------------------------------------------------------
// Google Agenda

/** O fuso do navegador (IANA), que o Google usa para ler a hora local. */
export function fusoDoNavegador() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FUSO_PADRAO;
  } catch {
    return FUSO_PADRAO;
  }
}

// 'YYYY-MM-DD' + 'HH:MM' + minutos → 'YYYY-MM-DDTHH:MM:SS', em hora LOCAL,
// sem "Z". A conta é feita em UTC só como aritmética de relógio: um
// `new Date(ano, mes, dia, h, m)` local pularia ou repetiria uma hora no dia
// de mudança de horário de verão, e o bloco das 19h viraria 20h.
function horaLocal(chave, horario, somarMinutos = 0) {
  const [ano, mes, dia] = chave.split('-').map(Number);
  const [h, m] = horario.split(':').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia, h, m + somarMinutos));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00`;
}

/**
 * Os eventos do plano para `POST /api/calendar/google/sync`: um por DIA DE
 * ESTUDO, nenhum na folga. Sem id: o servidor gera um por dia (sincronizar
 * de novo atualiza o mesmo evento) e apaga os dias do intervalo que não
 * vierem — a folga, ou o dia que deixou de ser de estudo.
 */
export function eventosDoPlano(plano = [], { horario = HORARIO_PADRAO, minutos = MINUTOS_PADRAO, timeZone = FUSO_PADRAO } = {}) {
  const inicio = horarioValido(horario) || HORARIO_PADRAO;
  return plano
    .filter((dia) => !dia.folga)
    .map((dia) => {
      const linhas = [`Meta do dia: ${dia.meta} ${dia.meta === 1 ? 'questão' : 'questões'}.`];
      if (dia.disciplina && dia.motivo) linhas.push(`Por que ${dia.disciplina}: ${dia.motivo}.`);
      linhas.push('', `Plano de estudo do ${MARCA_DOS_EVENTOS}.`);
      return {
        dia: dia.chave,
        summary: `Estudo OAB — ${dia.disciplina || 'revisão livre'}`,
        description: linhas.join('\n'),
        start: horaLocal(dia.chave, inicio),
        end: horaLocal(dia.chave, inicio, minutos),
        timeZone,
      };
    });
}

/** Os dias que a sincronização cobre: hoje até hoje + 6, os do plano. */
export function intervaloDoPlano(plano = []) {
  if (plano.length === 0) return null;
  return { de: plano[0].chave, ate: plano[plano.length - 1].chave };
}

const semPonto = (texto) => (typeof texto === 'string' ? texto.trim().replace(/\.+$/, '') : '');

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "7 dias sincronizados, 2 removidos." — o retorno do sync em português. */
export function resumoDaSincronizacao(resposta) {
  const sincronizados = Number(resposta?.sincronizados) || 0;
  const removidos = Number(resposta?.removidos) || 0;
  const base = plural(sincronizados, 'dia sincronizado', 'dias sincronizados');
  return removidos > 0 ? `${base}, ${plural(removidos, 'removido', 'removidos')}.` : `${base}.`;
}

/**
 * A falha de uma chamada do Google Agenda em frase que a pessoa entende.
 * `acao`: 'status' | 'conectar' | 'confirmar' | 'sincronizar' | 'desconectar'.
 */
export function mensagemDoCalendario(erro, acao) {
  const status = erro?.status;
  if (status === 0) return 'Não foi possível falar com o servidor. Confira sua conexão e tente de novo.';
  if (status === 404 && acao === 'status') return 'A integração com o Google Agenda ainda não está disponível.';
  // 409: o Google revogou o acesso (ou a conexão não existe) e o servidor já
  // apagou a conexão — a tela volta a "desconectado" e pede para reconectar.
  if (status === 409) {
    return `${semPonto(erro?.message) || 'Reconecte o Google Agenda'}. A conexão foi desfeita: clique em "Conectar Google Agenda" para ligar de novo.`;
  }
  // 503 (integração sem configuração no servidor) e 504 (sincronização que
  // demorou demais; repetir é seguro) trazem do servidor uma frase pronta.
  if (status === 503) return erro?.message || 'A integração com o Google Agenda está fora do ar no momento.';
  if (status === 504) return erro?.message || 'A sincronização demorou demais; tente de novo.';
  if (acao === 'confirmar') {
    return status === 400 || status === 410
      ? 'O link de autorização do Google expirou. Clique em "Conectar" de novo.'
      : `Não foi possível concluir a conexão com o Google Agenda (${erro?.message || 'erro desconhecido'}).`;
  }
  const verbo = {
    status: 'verificar a conexão com o Google Agenda',
    conectar: 'abrir a autorização do Google',
    sincronizar: 'sincronizar o plano',
    desconectar: 'desconectar o Google Agenda',
  }[acao] || 'falar com o Google Agenda';
  return `Não foi possível ${verbo}${erro?.message ? `: ${erro.message}` : ''}.`;
}

/**
 * O que o retorno do Google deixou na URL (`/?calendar=confirmar&codigo=…` ou
 * `/?calendar=error`), ou null. Puro: recebe o `search`.
 */
export function retornoDoGoogle(search = '') {
  const p = new URLSearchParams(search);
  const calendar = p.get('calendar');
  if (calendar === 'confirmar' && p.get('codigo')) return { tipo: 'confirmar', codigo: p.get('codigo') };
  if (calendar === 'error') return { tipo: 'erro' };
  // `connected` era o retorno antigo, sem código: só manda consultar o status.
  if (calendar) return { tipo: 'outro' };
  return null;
}

/** O `search` sem `calendar` e `codigo`, para o retorno não ser lido de novo. */
export function searchSemRetorno(search = '') {
  const p = new URLSearchParams(search);
  p.delete('calendar');
  p.delete('codigo');
  const resto = p.toString();
  return resto ? `?${resto}` : '';
}
