// O que este arquivo protege.
//
// A tela mostrava dados que não eram de ninguém: nome fixo, percentuais
// escritos no código, abas que não filtravam. Trocar tudo isso por dado real
// criou uma superfície nova de erro — e ela é do tipo silencioso: um `>=` que
// vira `>`, uma taxa que devia ser `null` e vem `0`, um id comparado como
// número quando o Postgres devolve string. Nada disso lança exceção. Só
// aparece como um número errado numa tela, e quem estuda acredita nele.
//
// Por isso os módulos são puros: dá para exercitá-los aqui, sem navegador.

import { payloadDoToken, primeiroNome, iniciais, saudacao, nomeDeExibicao } from '../src/lib/perfil.js';
import { montarDisciplinas, temasDaDisciplina, prioridadeDeEstudo, corDaDisciplina } from '../src/lib/disciplinas.js';
import { classificarRevisao, situacaoDaQuestao } from '../src/lib/revisao.js';
import { respondidasPorDia, planoDaSemana, diasDoMes, resumoDoPlano } from '../src/lib/agenda.js';
import { estatisticasDoPeriodo, evolucaoGeral, tempoPorDisciplina, formatarDuracao, diasAteProva } from '../src/lib/metrics.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

// ---------------------------------------------------------------------------
// Perfil: de quem é a sessão
// ---------------------------------------------------------------------------

{
  // Um JWT de verdade tem base64url no payload — com `-` e `_` no lugar de
  // `+` e `/`, e sem padding. Um decodificador que ignore isso funciona com a
  // maioria dos tokens e falha com alguns, que é o pior tipo de bug.
  const payload = { id: 13, email: 'pessoa@exemplo.com', exp: 9999999999 };
  const base64url = Buffer.from(JSON.stringify(payload)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = `cabecalho.${base64url}.assinatura`;

  const lido = payloadDoToken(token);
  exigir(lido?.id === 13, `id do token deveria ser 13, veio ${lido?.id}`);
  exigir(lido?.email === 'pessoa@exemplo.com', 'e-mail do token não veio');

  // Token quebrado não pode derrubar o app: quem chama trata o null.
  exigir(payloadDoToken('não é token') === null, 'token sem três partes deveria dar null');
  exigir(payloadDoToken('a.!!!.c') === null, 'payload que não é base64 deveria dar null');
  exigir(payloadDoToken(null) === null, 'token null deveria dar null');

  const semId = Buffer.from(JSON.stringify({ email: 'x@y.z' })).toString('base64url');
  exigir(payloadDoToken(`a.${semId}.c`) === null, 'payload sem id deveria dar null — é o id que busca o perfil');
}

{
  exigir(primeiroNome('Gabriel Ferreira Coelho') === 'Gabriel', 'primeiro nome errado');
  exigir(primeiroNome('   ') === null, 'nome em branco deveria dar null, não string vazia');
  exigir(primeiroNome(undefined) === null, 'nome ausente deveria dar null');

  // O sobrenome vem do ÚLTIMO pedaço: "Ana Maria de Souza" é AS, não AM.
  exigir(iniciais('Ana Maria de Souza') === 'AS', `iniciais erradas: ${iniciais('Ana Maria de Souza')}`);
  exigir(iniciais('Gabriel') === 'GA', `nome único deveria dar duas letras: ${iniciais('Gabriel')}`);
  exigir(iniciais('') === '?', 'nome vazio deveria cair no alternativo');
  exigir(iniciais(null, '·') === '·', 'alternativo personalizado não foi usado');

  // Sem nome, a saudação não inventa vocativo. Era exatamente isso que a tela
  // fazia ao dizer "Olá, Maria!" para qualquer conta.
  exigir(saudacao('Gabriel Coelho') === 'Olá, Gabriel!', 'saudação com nome errada');
  exigir(saudacao(null) === 'Olá!', 'saudação sem nome deveria ficar sem vocativo');

  exigir(nomeDeExibicao({ name: 'Fulana' }) === 'Fulana', 'nome do perfil deveria vencer');
  exigir(nomeDeExibicao({ name: '  ' }, 'joana@x.com') === 'joana', 'nome em branco deveria cair no e-mail');
  exigir(nomeDeExibicao({}, 'joana@x.com') === 'joana', 'sem nome, usar o trecho antes do @');
  exigir(nomeDeExibicao({}, null) === null, 'sem nome e sem e-mail, null');
}

// ---------------------------------------------------------------------------
// Disciplinas: o que substituiu a lista fixa de oito nomes
// ---------------------------------------------------------------------------

// O acervo devolve `id` como STRING (BIGSERIAL vira texto no pg), e as
// tentativas são indexadas por essa string. Os testes usam os dois tipos de
// propósito: comparar sem normalizar faz o histórico sumir sem erro nenhum.
const q = (id, disciplina, tema = 'Tema', extra = {}) => ({
  id, disciplina, topico: tema, enunciado: 'enunciado', alternativas: ['a', 'b', 'c', 'd'],
  correta: 0, revisada: false, exame: 45, numero: Number(id), ...extra,
});

const tent = (...tentativas) => ({ tentativas });
const t = (correta, data = '2026-08-10T10:00:00Z', tempo = null) => ({ correta, data, tempo_gasto_segundos: tempo });

{
  const questoes = [q('1', 'Direito Penal'), q('2', 'Direito Penal'), q('3', 'Direito Civil'), q(4, null)];
  const tentativas = {
    '1': tent(t(true), t(false)),   // mesma questão, duas tentativas
    '3': tent(t(true)),
  };

  const d = montarDisciplinas(questoes, tentativas);
  const penal = d.find((x) => x.nome === 'Direito Penal');
  const civil = d.find((x) => x.nome === 'Direito Civil');
  const sem = d.find((x) => x.nome === 'Sem classificação');

  exigir(penal.total === 2, `Penal deveria ter 2 questões no acervo, tem ${penal.total}`);
  // Respondidas conta QUESTÕES distintas; tentativas conta respostas. Somar as
  // duas coisas na mesma variável faz a cobertura passar de 100%.
  exigir(penal.respondidas === 1, `Penal deveria ter 1 questão respondida, tem ${penal.respondidas}`);
  exigir(penal.tentativas === 2, `Penal deveria ter 2 tentativas, tem ${penal.tentativas}`);
  exigir(penal.pct === 50, `Penal deveria estar em 50%, está em ${penal.pct}`);
  exigir(penal.cobertura === 50, `cobertura de Penal deveria ser 50%, é ${penal.cobertura}`);

  // Sem tentativa, a taxa é AUSENTE — não zero. Zero é "respondi e errei tudo",
  // e a tela precisa distinguir para não pintar de vermelho quem nunca tentou.
  const nunca = d.find((x) => x.nome === 'Direito Civil');
  exigir(civil.pct === 100, `Civil deveria estar em 100%, está em ${civil.pct}`);
  exigir(nunca !== undefined, 'Civil sumiu da lista');

  const semTentativa = montarDisciplinas([q('9', 'Direito Ambiental')], {});
  exigir(semTentativa[0].pct === null, `disciplina sem resposta deveria ter pct null, veio ${semTentativa[0].pct}`);
  exigir(semTentativa[0].status === 'novo', 'disciplina sem resposta deveria ter status novo');

  // A questão sem classificação vira um balde próprio, e ele vai para o fim.
  exigir(sem !== undefined, 'questão sem disciplina deveria virar "Sem classificação"');
  exigir(d[d.length - 1].nome === 'Sem classificação', 'o balde não classificado deveria ser o último');

  // Id numérico casando com chave string: é o formato que a API devolve.
  const comIdNumerico = montarDisciplinas([q(4, 'Direito Penal')], { '4': tent(t(true)) });
  exigir(comIdNumerico[0].respondidas === 1, 'id numérico não casou com a chave string do histórico');
}

{
  // A cor é atribuída por hash e precisa ser estável: ela identifica a mesma
  // disciplina em três telas diferentes.
  const a = corDaDisciplina('Direito Tributário');
  const b = corDaDisciplina('Direito Tributário');
  exigir(a === b, 'a cor da disciplina mudou entre chamadas');
  exigir(/^#[0-9A-F]{6}$/i.test(a), `cor inválida: ${a}`);
}

{
  const questoes = [
    q('1', 'Direito Penal', 'Furto'),
    q('2', 'Direito Penal', 'Furto'),
    q('3', 'Direito Penal', 'Homicídio'),
  ];
  const temas = temasDaDisciplina(questoes, { '1': tent(t(true), t(true)) }, 'Direito Penal');

  exigir(temas.length === 2, `esperados 2 temas, vieram ${temas.length}`);
  exigir(temas[0].nome === 'Furto', 'o tema com mais questões deveria vir primeiro');
  exigir(temas[0].pct === 100, `Furto deveria estar em 100%, está em ${temas[0].pct}`);
  exigir(temas[1].pct === null, 'tema sem resposta deveria ter pct null');
}

{
  // A ordem de prioridade é o que o cronograma e o dashboard usam para sugerir
  // o que estudar. Inverter isto manda a pessoa revisar o que ela já domina.
  const disciplinas = montarDisciplinas(
    [q('1', 'A'), q('2', 'B'), q('3', 'C'), q('4', 'D'), q('5', 'D')],
    {
      '1': tent(t(false), t(false)),          // A: 0%   → necessita
      '2': tent(t(true), t(false)),           // B: 50%  → em desenvolvimento
      '3': tent(t(true), t(true), t(true)),   // C: 100% → domina
      // D: sem resposta → novo
    }
  );

  const ordem = prioridadeDeEstudo(disciplinas).map((d) => d.nome);
  exigir(ordem[0] === 'A', `o pior deveria vir primeiro, veio ${ordem[0]}`);
  exigir(ordem[1] === 'B', `o segundo deveria ser B, veio ${ordem[1]}`);
  exigir(ordem[2] === 'D', `o nunca estudado vem antes do dominado, veio ${ordem[2]}`);
  exigir(ordem[3] === 'C', `o dominado deveria ser o último, veio ${ordem[3]}`);
}

// ---------------------------------------------------------------------------
// Revisão: as abas que não filtravam
// ---------------------------------------------------------------------------

{
  const questoes = [q('1', 'Penal'), q('2', 'Penal'), q('3', 'Civil'), q('4', 'Civil')];
  const tentativas = {
    // Errou e DEPOIS acertou: já corrigiu, não é mais material de revisão.
    '1': tent(t(false, '2026-08-01T10:00:00Z'), t(true, '2026-08-05T10:00:00Z')),
    // Acertou e depois errou: voltou a ser.
    '2': tent(t(true, '2026-08-01T10:00:00Z'), t(false, '2026-08-06T10:00:00Z')),
    '3': tent(t(false, '2026-08-02T10:00:00Z')),
    // '4' nunca respondida
  };

  const r = classificarRevisao(questoes, tentativas, ['4']);

  const idsErrei = r.errei.map((x) => String(x.questao.id));
  exigir(!idsErrei.includes('1'), 'questão corrigida não pode continuar em "Errei"');
  exigir(idsErrei.includes('2') && idsErrei.includes('3'), 'faltou questão em "Errei"');
  exigir(idsErrei.length === 2, `esperadas 2 erradas, vieram ${idsErrei.length}`);

  // A errada há mais tempo vem primeiro: é a que corre mais risco de ter sido
  // esquecida.
  exigir(idsErrei[0] === '3', `a mais antiga deveria vir primeiro, veio ${idsErrei[0]}`);

  // Favorito guardado como string tem de casar com id vindo como número (e
  // vice-versa) — é o mesmo id em dois formatos.
  exigir(r.favoritas.length === 1 && String(r.favoritas[0].questao.id) === '4', 'favorito não casou por id');

  exigir(r.emAberto.length === 1, `esperada 1 em aberto, vieram ${r.emAberto.length}`);
  exigir(r.resumo.acertos === 1, `esperado 1 acerto, veio ${r.resumo.acertos}`);
  exigir(r.resumo.erros === 2, `esperados 2 erros, vieram ${r.resumo.erros}`);
  exigir(r.resumo.emAberto === 1, 'resumo de em aberto errado');
  exigir(r.resumo.respondidas === 3, `esperadas 3 respondidas, vieram ${r.resumo.respondidas}`);
  exigir(r.resumo.acervo === 4, 'o resumo deveria contar o acervo inteiro');

  // "Para revisar" junta erradas e favoritas sem repetir.
  exigir(r.todas.length === 3, `esperadas 3 para revisar, vieram ${r.todas.length}`);

  const s2 = situacaoDaQuestao(tentativas, '2');
  exigir(s2.situacao === 'errou' && s2.pct === 50, 'situação da questão 2 errada');
  exigir(situacaoDaQuestao(tentativas, '4').situacao === 'em-aberto', 'questão sem tentativa deveria ser em-aberto');
  exigir(situacaoDaQuestao(tentativas, '4').pct === null, 'questão sem tentativa deveria ter pct null');
}

// ---------------------------------------------------------------------------
// Agenda: o cronograma que era um cartaz
// ---------------------------------------------------------------------------

{
  const hoje = new Date('2026-08-12T09:00:00');
  const tentativas = {
    '1': tent(t(true, '2026-08-12T08:00:00'), t(false, '2026-08-12T08:30:00')),
    '2': tent(t(true, '2026-08-10T08:00:00')),
  };

  const porDia = respondidasPorDia(tentativas);
  exigir(porDia['2026-08-12'] === 2, `esperadas 2 hoje, vieram ${porDia['2026-08-12']}`);
  exigir(porDia['2026-08-10'] === 1, 'contagem do dia 10 errada');

  const disciplinas = montarDisciplinas(
    [q('1', 'A'), q('2', 'B'), q('3', 'C')],
    { '1': tent(t(false)), '2': tent(t(true)) }
  );

  const plano = planoDaSemana({ disciplinas, tentativas, meta: 10, hoje });
  exigir(plano.length === 7, `a semana deveria ter 7 dias, tem ${plano.length}`);
  exigir(plano[0].hoje === true, 'o primeiro dia deveria ser hoje');
  exigir(plano[0].futuro === false, 'hoje não é futuro');
  exigir(plano[1].futuro === true, 'amanhã deveria ser futuro');
  exigir(plano[0].respondidas === 2, `hoje tem 2 respostas, veio ${plano[0].respondidas}`);
  exigir(plano[0].pct === 20, `20% da meta de 10, veio ${plano[0].pct}`);
  exigir(plano[1].respondidas === 0, 'dia futuro não pode ter resposta');

  // Enquanto houver disciplina nova, a sugestão não repete: com 3 matérias e 7
  // dias, os três primeiros dias têm de ser diferentes.
  const tresPrimeiros = new Set(plano.slice(0, 3).map((d) => d.disciplina));
  exigir(tresPrimeiros.size === 3, 'a sugestão repetiu disciplina antes de esgotar as matérias');
  exigir(plano[0].disciplina === 'A', `o dia de hoje deveria ser a pior matéria, veio ${plano[0].disciplina}`);

  // Acervo sem classificação: a tela precisa saber que não há sugestão, em vez
  // de receber `undefined` e imprimir isso.
  const semNada = planoDaSemana({ disciplinas: [], tentativas: {}, meta: 10, hoje });
  exigir(semNada.every((d) => d.disciplina === null), 'sem disciplinas, a sugestão deveria ser null');
}

{
  // Agosto de 2026 começa num sábado: seis células vazias antes do dia 1. Se
  // este alinhamento quebrar, o calendário mostra cada data embaixo do dia da
  // semana errado — pior que não ter calendário.
  const hoje = new Date('2026-08-12T09:00:00');
  const cal = diasDoMes({ '1': tent(t(true, '2026-08-10T08:00:00')) }, hoje);

  const vazias = cal.celulas.filter((c) => c.vazia).length;
  const dias = cal.celulas.filter((c) => !c.vazia);

  exigir(cal.rotulo === 'Agosto 2026', `rótulo do mês errado: ${cal.rotulo}`);
  exigir(vazias === 6, `esperadas 6 células vazias, vieram ${vazias}`);
  exigir(dias.length === 31, `agosto tem 31 dias, vieram ${dias.length}`);
  exigir(dias.find((d) => d.n === 10).respondidas === 1, 'o dia 10 deveria estar marcado');
  exigir(dias.find((d) => d.n === 12).hoje === true, 'o dia 12 deveria ser hoje');
  exigir(dias.find((d) => d.n === 11).respondidas === 0, 'dia sem estudo não pode aparecer marcado');

  const resumo = resumoDoPlano({ tentativas: { '1': tent(t(true, '2026-08-10T08:00:00'), t(false, '2026-08-11T08:00:00')) }, disciplinas: montarDisciplinas([q('1', 'A'), q('2', 'A')], { '1': tent(t(true)) }), hoje });
  exigir(resumo.diasAtivos === 2, `esperados 2 dias ativos, vieram ${resumo.diasAtivos}`);
  exigir(resumo.respondidas === 2, 'total de respostas errado');
  exigir(resumo.cobertura === 50, `cobertura deveria ser 50%, veio ${resumo.cobertura}`);
}

// ---------------------------------------------------------------------------
// Estatísticas: o período que multiplicava 1248 por 0.25
// ---------------------------------------------------------------------------

{
  const hoje = new Date('2026-08-12T12:00:00');
  const questoes = [q('1', 'Penal'), q('2', 'Civil')];

  const tentativas = {
    '1': tent(
      t(true, '2026-08-11T10:00:00', 60),    // 1 dia atrás  → janela de 7
      t(false, '2026-08-01T10:00:00', 30)    // 11 dias atrás → janela anterior
    ),
    '2': tent(t(true, '2026-08-10T10:00:00', 90)),
  };

  const semana = estatisticasDoPeriodo(tentativas, { questoes, dias: 7, hoje });
  exigir(semana.tentativas === 2, `esperadas 2 na semana, vieram ${semana.tentativas}`);
  exigir(semana.acertos === 2 && semana.pct === 100, 'taxa da semana errada');
  exigir(semana.tempoTotalSeg === 150, `tempo total deveria ser 150s, veio ${semana.tempoTotalSeg}`);
  exigir(semana.diasAtivos === 2, `esperados 2 dias ativos, vieram ${semana.diasAtivos}`);

  // A janela anterior é a de 7 a 14 dias atrás: a tentativa de 11 dias atrás
  // cai nela, e é ela que dá sentido ao "vs. período anterior".
  exigir(semana.anterior.tentativas === 1, `janela anterior deveria ter 1, veio ${semana.anterior.tentativas}`);
  exigir(semana.delta.tentativas === 100, `delta deveria ser +100%, veio ${semana.delta.tentativas}`);
  exigir(semana.delta.pct === 100, `delta de taxa deveria ser +100pp, veio ${semana.delta.pct}`);

  // Sem período anterior, não há comparação — e não pode virar "+100%".
  const tudo = estatisticasDoPeriodo(tentativas, { questoes, dias: null, hoje });
  exigir(tudo.tentativas === 3, `desde o início deveriam ser 3, vieram ${tudo.tentativas}`);
  exigir(tudo.delta.tentativas === null, 'sem janela anterior o delta tem de ser null');

  // O filtro de disciplina precisa filtrar de verdade.
  const soPenal = estatisticasDoPeriodo(tentativas, { questoes, dias: null, disciplina: 'Penal', hoje });
  exigir(soPenal.tentativas === 2, `Penal tem 2 respostas, vieram ${soPenal.tentativas}`);
  exigir(soPenal.questoes === 1, 'Penal tem 1 questão distinta respondida');

  const vazio = estatisticasDoPeriodo({}, { questoes, dias: 7, hoje });
  exigir(vazio.pct === null, 'sem resposta, a taxa é null e não 0');
  exigir(vazio.tempoTotalSeg === null, 'sem medição, o tempo é null e não 0');
}

{
  const hoje = new Date('2026-08-12T12:00:00');
  const tentativas = {
    '1': tent(t(true, '2026-08-11T10:00:00'), t(false, '2026-08-11T11:00:00')),
    '2': tent(t(true, '2026-07-29T10:00:00')),   // duas semanas atrás
  };

  const ev = evolucaoGeral(tentativas, 6, hoje);
  exigir(ev.length === 6, `esperadas 6 semanas, vieram ${ev.length}`);
  exigir(ev[5].pct === 50, `a semana atual deveria estar em 50%, veio ${ev[5].pct}`);
  exigir(ev[3].pct === 100, `a semana de 2 atrás deveria estar em 100%, veio ${ev[3].pct}`);
  // Semana sem atividade é `null`, não zero: senão o gráfico desenha uma queda
  // a zero que nunca aconteceu.
  exigir(ev[4].pct === null, 'semana sem atividade deveria ser null');
}

{
  const questoes = [q('1', 'Penal'), q('2', 'Civil')];
  const tentativas = {
    '1': tent(t(true, '2026-08-11T10:00:00', 100), t(true, '2026-08-11T10:05:00', 200)),
    '2': tent(t(true, '2026-08-11T10:00:00', null)),   // sem medição
  };

  const tempos = tempoPorDisciplina(tentativas, questoes);
  exigir(tempos.length === 1, `só Penal tem tempo medido, vieram ${tempos.length}`);
  exigir(tempos[0].mediaSeg === 150, `média deveria ser 150s, veio ${tempos[0].mediaSeg}`);
}

{
  exigir(formatarDuracao(45) === '45s', 'segundos');
  exigir(formatarDuracao(600) === '10min', 'minutos');
  exigir(formatarDuracao(3600) === '1h', 'hora exata não leva minutos');
  exigir(formatarDuracao(3900) === '1h 05min', `1h05: veio ${formatarDuracao(3900)}`);
  exigir(formatarDuracao(null) === null, 'sem tempo, null');
}

{
  const hoje = new Date('2026-08-12T12:00:00');
  exigir(diasAteProva({ dataProva: '2026-08-22' }, hoje) === 10, 'contagem até a prova errada');
  exigir(diasAteProva({ dataProva: '2026-08-12' }, hoje) === 0, 'prova hoje deveria dar 0');
  exigir(diasAteProva({ dataProva: '2026-08-01' }, hoje) === 0, 'prova passada não pode dar negativo');
  // Sem data escolhida não há contagem — antes havia uma data fixa no código.
  exigir(diasAteProva({}, hoje) === null, 'sem data, null');
}

// ---------------------------------------------------------------------------
// Storage: o merge que engolia campo novo
// ---------------------------------------------------------------------------

{
  const guardado = {};
  globalThis.localStorage = {
    getItem: (k) => (k in guardado ? guardado[k] : null),
    setItem: (k, v) => { guardado[k] = String(v); },
    removeItem: (k) => { delete guardado[k]; },
  };

  const { loadState, saveState, limparEstado } = await import('../src/lib/storage.js');

  const padroes = { theme: 'rosa', configuracoes: { meta: 20, dataProva: null }, favoritos: [] };

  // Estado salvo por uma versão anterior: a fatia `configuracoes` não tem o
  // campo novo. Com o spread raso de antes, `dataProva` sumia — e sumia só
  // para quem já usava o app, que é o pior lugar para um bug aparecer.
  saveState({ theme: 'azul', configuracoes: { meta: 50 } });

  const lido = loadState(padroes);
  exigir(lido.theme === 'azul', 'o valor salvo deveria vencer o padrão');
  exigir(lido.configuracoes.meta === 50, 'a meta salva deveria vencer');
  exigir('dataProva' in lido.configuracoes, 'campo novo do padrão sumiu na fatia salva');
  exigir(lido.configuracoes.dataProva === null, 'o campo novo deveria vir com o valor padrão');
  exigir(Array.isArray(lido.favoritos), 'chave ausente deveria cair no padrão');

  // Array não pode ser fundido com o padrão: viraria um objeto com índices.
  saveState({ favoritos: ['7', '9'] });
  exigir(loadState(padroes).favoritos.length === 2, 'array salvo virou outra coisa no merge');

  limparEstado();
  exigir(loadState(padroes).theme === 'rosa', 'depois de limpar, tudo volta ao padrão');

  // JSON corrompido não pode derrubar o app na abertura.
  guardado['ma-questoes-state-v1'] = '{quebrado';
  exigir(loadState(padroes).theme === 'rosa', 'JSON inválido deveria cair no padrão');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ perfil, disciplinas, revisão, agenda, estatísticas e storage íntegros');
