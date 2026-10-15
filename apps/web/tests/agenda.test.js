// Cronograma: folga pelos dias da ficha, rotação só nos dias de estudo,
// ritmo da semana corrente, bloco de estudo e os eventos do Google Agenda.
//
// Datas sem "Z" são hora local de propósito: o test:lib roda este arquivo em
// UTC e em America/Sao_Paulo, e o plano é sempre do dia local.

import {
  planoDaSemana, ritmoDaSemana, diasDeEstudoDaFicha, blocoDeEstudo, horarioValido, duracaoLegivel,
  blocoLegivel, eventosDoPlano, intervaloDoPlano, resumoDaSincronizacao, mensagemDoCalendario,
  retornoDoGoogle, searchSemRetorno, diasDoMes, mesDeslocado, limitesDoCalendario,
  HORARIO_PADRAO, MINUTOS_PADRAO, MARCA_DOS_EVENTOS,
} from '../src/lib/agenda.js';
import { montarDisciplinas, prioridadeDeEstudo } from '../src/lib/disciplinas.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const q = (id, disciplina) => ({
  id, disciplina, topico: 'Tema', enunciado: 'enunciado', alternativas: ['a', 'b', 'c', 'd'],
  correta: 0, revisada: false, exame: 45, numero: Number(id),
});
// `n` respostas no dia `chave` (hora local), na questão `id`.
const respostas = (lista) => {
  const tentativas = {};
  for (const [id, chave, n] of lista) {
    tentativas[id] = { tentativas: Array.from({ length: n }, () => ({ correta: true, data: `${chave}T10:00:00` })) };
  }
  return tentativas;
};

const DISCIPLINAS = montarDisciplinas([q('1', 'A'), q('2', 'B'), q('3', 'C'), q('4', 'D'), q('5', 'E'), q('6', 'F')], {});
const ORDEM = prioridadeDeEstudo(DISCIPLINAS).map((d) => d.nome);

// 9/10/2026 é uma sexta-feira.
const SEXTA = new Date('2026-10-09T10:00:00');
const UTEIS = [1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Dias da ficha

{
  exigir(diasDeEstudoDaFicha(null) === null, 'sem ficha, todo dia é de estudo (null)');
  exigir(diasDeEstudoDaFicha({ diasDaSemana: [] }) === null, 'lista vazia não pode virar semana só de folga');
  const lidos = diasDeEstudoDaFicha({ diasDaSemana: [5, 1, 1, 9, '2', 0] });
  exigir(JSON.stringify(lidos) === '[0,1,5]', `dias inválidos/repetidos deveriam sair e o resto ordenar: ${JSON.stringify(lidos)}`);
}

// ---------------------------------------------------------------------------
// Folga e rotação

{
  const plano = planoDaSemana({ disciplinas: DISCIPLINAS, meta: 10, hoje: SEXTA, diasDeEstudo: UTEIS });
  const folgas = plano.filter((d) => d.folga).map((d) => d.chave);
  exigir(JSON.stringify(folgas) === '["2026-10-10","2026-10-11"]', `sábado e domingo deveriam ser folga: ${folgas}`);

  for (const d of plano.filter((x) => x.folga)) {
    exigir(d.disciplina === null && d.motivo === null, `folga ${d.chave} não pode ter matéria`);
    exigir(d.meta === 0 && d.pct === 0, `folga ${d.chave} tem meta 0, veio ${d.meta}`);
  }
  for (const d of plano.filter((x) => !x.folga)) {
    exigir(d.meta === 10, `dia de estudo ${d.chave} usa a meta diária, veio ${d.meta}`);
  }

  // A rotação anda só nos dias de estudo: a folga do meio não "gasta"
  // matéria. Sex, Seg, Ter, Qua, Qui = as cinco primeiras da prioridade.
  const sugeridas = plano.filter((d) => !d.folga).map((d) => d.disciplina);
  exigir(
    JSON.stringify(sugeridas) === JSON.stringify(ORDEM.slice(0, 5)),
    `rotação deveria seguir a prioridade só nos dias de estudo: ${sugeridas} × ${ORDEM.slice(0, 5)}`,
  );
  exigir(new Set(sugeridas).size === 5, 'a sugestão repetiu matéria com matéria sobrando');

  // Sem dias (sem ficha), o comportamento de antes: sete dias de estudo.
  const semFicha = planoDaSemana({ disciplinas: DISCIPLINAS, meta: 10, hoje: SEXTA });
  exigir(semFicha.every((d) => !d.folga && d.meta === 10), 'sem ficha, nenhum dia é folga');
  exigir(semFicha[6].disciplina === ORDEM[0], `com 6 matérias, o 7º dia volta à primeira: ${semFicha[6].disciplina}`);

  // Resposta dada numa folga aparece no dia (bônus), mas sem meta.
  const comBonus = planoDaSemana({
    disciplinas: DISCIPLINAS, meta: 10, hoje: new Date('2026-10-10T09:00:00'), diasDeEstudo: UTEIS,
    tentativas: respostas([['1', '2026-10-10', 3]]),
  });
  exigir(comBonus[0].folga && comBonus[0].respondidas === 3 && comBonus[0].pct === 0, 'folga com resposta: conta as respondidas, sem porcentagem');
}

// ---------------------------------------------------------------------------
// Ritmo da semana: domingo até hoje, só dias de estudo

{
  // Semana de 4/10 (domingo) a 9/10 (sexta). Domingo é folga: as 7 de lá não
  // entram. Seg 10 + sex 5 = 15 de 5 dias × 10 = 50.
  const tentativas = respostas([['1', '2026-10-04', 7], ['2', '2026-10-05', 10], ['3', '2026-10-09', 5], ['4', '2026-10-10', 9]]);
  const r = ritmoDaSemana({ tentativas, meta: 10, diasDeEstudo: UTEIS, hoje: SEXTA });
  exigir(r.dias === 5, `de domingo a sexta há 5 dias de estudo, vieram ${r.dias}`);
  exigir(r.meta === 50 && r.respondidas === 15, `esperado 15/50, veio ${r.respondidas}/${r.meta}`);
  exigir(r.pct === 30, `esperado 30%, veio ${r.pct}`);

  // Quem bate a meta no primeiro dia de estudo da semana está em 100% — e não
  // em ~14%, como quando o ritmo dividia pela meta dos próximos 7 dias.
  const segunda = ritmoDaSemana({ tentativas: respostas([['1', '2026-10-05', 10]]), meta: 10, diasDeEstudo: UTEIS, hoje: new Date('2026-10-05T21:00:00') });
  exigir(segunda.pct === 100, `meta batida na segunda deveria dar 100%, veio ${segunda.pct}`);

  // Domingo de folga: ainda não houve dia de estudo, e 0% diria "atrasado".
  const domingo = ritmoDaSemana({ tentativas, meta: 10, diasDeEstudo: UTEIS, hoje: new Date('2026-10-04T12:00:00') });
  exigir(domingo.dias === 0 && domingo.pct === null, `domingo de folga: sem ritmo, veio ${domingo.pct}`);

  // Sem ficha: domingo a sexta = 6 dias, e o domingo conta.
  const semFicha = ritmoDaSemana({ tentativas, meta: 10, hoje: SEXTA });
  exigir(semFicha.dias === 6 && semFicha.respondidas === 22 && semFicha.pct === 37, `sem ficha: 22/60 = 37%, veio ${semFicha.respondidas}/${semFicha.meta} = ${semFicha.pct}`);

  // O sábado seguinte (10/10) não entra na semana que termina hoje.
  exigir(r.respondidas === 15, 'resposta de depois de hoje não pode entrar no ritmo');
}

// ---------------------------------------------------------------------------
// Bloco de estudo

{
  exigir(horarioValido('19:00') === '19:00' && horarioValido('7:00') === null && horarioValido('24:00') === null, 'validação de HH:MM');
  const padrao = blocoDeEstudo(null);
  exigir(padrao.horario === HORARIO_PADRAO && padrao.minutos === MINUTOS_PADRAO, `padrão 19:00 e 90 min, veio ${JSON.stringify(padrao)}`);
  const daConta = blocoDeEstudo({ agenda: { horario: '06:30' }, ficha: { minutosPorDia: 60 } });
  exigir(daConta.horario === '06:30' && daConta.minutos === 60, `bloco da conta: ${JSON.stringify(daConta)}`);
  const estragado = blocoDeEstudo({ agenda: { horario: '25:99' }, ficha: { minutosPorDia: -5 } });
  exigir(estragado.horario === HORARIO_PADRAO && estragado.minutos === MINUTOS_PADRAO, 'valor estragado cai no padrão');
  exigir(duracaoLegivel(90) === '1 h 30' && duracaoLegivel(60) === '1 h' && duracaoLegivel(30) === '30 min' && duracaoLegivel(180) === '3 h', 'duração legível');
  exigir(blocoLegivel({ horario: '19:00', minutos: 90 }) === '19:00 · 1 h 30', `bloco legível: ${blocoLegivel({ horario: '19:00', minutos: 90 })}`);
}

// ---------------------------------------------------------------------------
// Eventos do Google Agenda

{
  const plano = planoDaSemana({ disciplinas: DISCIPLINAS, meta: 10, hoje: SEXTA, diasDeEstudo: UTEIS });
  const eventos = eventosDoPlano(plano, { horario: '19:00', minutos: 90, timeZone: 'America/Manaus' });

  exigir(eventos.length === 5, `um evento por dia de estudo (5), vieram ${eventos.length}`);
  exigir(!eventos.some((e) => e.dia === '2026-10-10' || e.dia === '2026-10-11'), 'folga não pode ter evento');
  exigir(eventos.every((e) => !('id' in e)), 'o cliente não manda id: o servidor gera um por dia');
  exigir(new Set(eventos.map((e) => e.dia)).size === eventos.length, 'no máximo um evento por dia');

  const sexta = eventos[0];
  exigir(sexta.dia === '2026-10-09', `primeiro evento é hoje, veio ${sexta.dia}`);
  exigir(sexta.start === '2026-10-09T19:00:00', `início em hora local sem Z: ${sexta.start}`);
  exigir(sexta.end === '2026-10-09T20:30:00', `fim = início + 90 min: ${sexta.end}`);
  exigir(sexta.timeZone === 'America/Manaus', 'o fuso vai como veio');
  exigir(sexta.summary.includes(plano[0].disciplina), `o título nomeia a matéria: ${sexta.summary}`);
  exigir(sexta.description.includes(MARCA_DOS_EVENTOS) && sexta.description.includes('10 questões'), `descrição com a marca e a meta: ${sexta.description}`);
  exigir(eventos.every((e) => !/Z$/.test(e.start) && !/Z$/.test(e.end)), 'nenhum horário em UTC');

  // Bloco que passa da meia-noite termina no dia seguinte.
  const tarde = eventosDoPlano(plano, { horario: '23:30', minutos: 90, timeZone: 'America/Sao_Paulo' })[0];
  exigir(tarde.end === '2026-10-10T01:00:00', `23:30 + 90 min termina às 01:00 do dia seguinte: ${tarde.end}`);

  // Fim de mês e de ano.
  const reveillon = planoDaSemana({ disciplinas: DISCIPLINAS, meta: 10, hoje: new Date('2026-12-31T08:00:00') });
  const ultimo = eventosDoPlano(reveillon, { horario: '22:00', minutos: 180 })[0];
  exigir(ultimo.end === '2027-01-01T01:00:00', `virada de ano: ${ultimo.end}`);

  const intervalo = intervaloDoPlano(plano);
  exigir(intervalo.de === '2026-10-09' && intervalo.ate === '2026-10-15', `intervalo hoje..hoje+6: ${JSON.stringify(intervalo)}`);

  // Dia de estudo sem matéria (acervo vazio) ainda é bloco de estudo.
  const semAcervo = eventosDoPlano(planoDaSemana({ disciplinas: [], meta: 10, hoje: SEXTA, diasDeEstudo: UTEIS }));
  exigir(semAcervo.length === 5 && /revisão livre/.test(semAcervo[0].summary), 'sem acervo: evento de revisão livre');
  exigir(semAcervo[0].start === `2026-10-09T${HORARIO_PADRAO}:00`, `horário padrão: ${semAcervo[0].start}`);
}

// ---------------------------------------------------------------------------
// Mensagens e retorno do Google

{
  exigir(resumoDaSincronizacao({ sincronizados: 7, removidos: 2 }) === '7 dias sincronizados, 2 removidos.', resumoDaSincronizacao({ sincronizados: 7, removidos: 2 }));
  exigir(resumoDaSincronizacao({ sincronizados: 1, removidos: 0 }) === '1 dia sincronizado.', resumoDaSincronizacao({ sincronizados: 1, removidos: 0 }));
  const revogado = mensagemDoCalendario({ status: 409, message: 'Reconecte o Google Agenda' }, 'sincronizar');
  exigir(revogado.startsWith('Reconecte o Google Agenda. A conexão foi desfeita'), `409 pede reconexão: ${revogado}`);
  exigir(mensagemDoCalendario({ status: 504, message: 'A sincronização demorou demais; tente de novo' }, 'sincronizar') === 'A sincronização demorou demais; tente de novo', '504 mostra a frase do servidor');
  exigir(mensagemDoCalendario({ status: 503, message: 'Google Calendar não está configurado no servidor' }, 'conectar') === 'Google Calendar não está configurado no servidor', '503 mostra a frase do servidor como está');
  exigir(/servidor/.test(mensagemDoCalendario({ status: 0, message: 'x' }, 'status')), 'status 0 fala de conexão');
  exigir(/sincronizar o plano: Erro 502/.test(mensagemDoCalendario({ status: 502, message: 'Erro 502' }, 'sincronizar')), 'erro genérico diz a ação e a mensagem');

  const ok = retornoDoGoogle('?calendar=confirmar&codigo=abc123');
  exigir(ok?.tipo === 'confirmar' && ok.codigo === 'abc123', `retorno com código: ${JSON.stringify(ok)}`);
  exigir(retornoDoGoogle('?calendar=error')?.tipo === 'erro', 'retorno de erro');
  exigir(retornoDoGoogle('?calendar=confirmar')?.tipo === 'outro', 'confirmar sem código não confirma nada');
  exigir(retornoDoGoogle('') === null && retornoDoGoogle('?x=1') === null, 'sem retorno: null');
  exigir(searchSemRetorno('?calendar=confirmar&codigo=abc') === '', 'a URL fica limpa');
  exigir(searchSemRetorno('?x=1&calendar=error') === '?x=1', 'outros parâmetros ficam');
}

// ---------------------------------------------------------------------------
// Calendário: mês escolhido e limites das setas

{
  const set = diasDoMes(respostas([['1', '2026-09-03', 2]]), { hoje: SEXTA, ano: 2026, mes: 8 });
  exigir(set.rotulo === 'Setembro 2026', `rótulo do mês anterior: ${set.rotulo}`);
  exigir(set.celulas.filter((c) => c.vazia).length === 2, 'setembro de 2026 começa numa terça (2 vazias)');
  exigir(set.celulas.find((c) => c.n === 3).respondidas === 2, 'o registro do mês anterior aparece');
  exigir(!set.celulas.some((c) => c.hoje), 'mês anterior não tem "hoje"');

  const out = diasDoMes({}, { hoje: SEXTA, planejados: ['2026-10-09', '2026-10-12', '2026-09-01'] });
  exigir(out.rotulo === 'Outubro 2026', 'sem mês, o de hoje');
  exigir(out.celulas.find((c) => c.n === 12).planejado === true, 'dia de estudo futuro aparece planejado');
  exigir(out.celulas.find((c) => c.n === 9).planejado === false, 'hoje não é "planejado"');

  const jan = mesDeslocado(new Date('2026-01-15T12:00:00'), -1);
  exigir(jan.ano === 2025 && jan.mes === 11, `um mês antes de janeiro é dezembro do ano anterior: ${JSON.stringify(jan)}`);
  exigir(limitesDoCalendario(SEXTA).max === 0, 'o plano de 9/10 acaba em outubro: sem mês seguinte');
  exigir(limitesDoCalendario(new Date('2026-10-28T12:00:00')).max === 1, 'o plano de 28/10 entra em novembro');
  exigir(limitesDoCalendario(new Date('2026-12-29T12:00:00')).max === 1, 'virada de ano');
  exigir(limitesDoCalendario(SEXTA).min === -12, 'doze meses para trás');
}

if (falhas.length > 0) {
  console.error(`✗ ${falhas.length} falha(s) em agenda.test.js:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ agenda.test.js: folga, rotação, ritmo da semana, bloco de estudo, eventos e calendário');
