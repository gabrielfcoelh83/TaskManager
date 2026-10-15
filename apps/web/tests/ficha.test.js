// A ficha de boas-vindas e a gravação de `profile_data`.
//
// O user-service MESCLA o `profile_data` no primeiro nível (`profile_data ||
// $3`): chave com null grava null, e o total mesclado tem teto de 20000
// bytes. O front manda só as chaves que mudaram. O risco que este arquivo
// cobre é silencioso: um PUT que reconstruísse o objeto inteiro a partir do
// que uma aba desatualizada conhecia desfaria a ficha concluída em outra — e
// a pessoa voltaria a vê-la no próximo acesso, sem erro nenhum na tela.

import { criarFilaDePreferencias, configuracoesDoPerfil } from '../src/lib/preferencias.js';
import {
  fichaConcluida, metaSugerida, metaValida, erroDoPasso, montarFicha, respostasIniciais,
  opcoesDeDificuldade, escolherTempo, DISCIPLINAS_OAB, rotuloDosDias, formatarData,
} from '../src/lib/ficha.js';
import { prioridadeDeEstudo, montarDisciplinas, TENTATIVAS_PARA_CONFIAR } from '../src/lib/disciplinas.js';
import { planoDaSemana } from '../src/lib/agenda.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Servidor falso com a semântica do user-service: mescla no primeiro nível,
// null grava null, 400 se não for objeto ou se o total passar de 20000 bytes.
// Cada PUT leva o tempo da lista `demoras`, na ordem em que chega.
function servidorFalso(inicial, demoras = []) {
  const srv = { profile_data: inicial, puts: [] };
  let n = 0;
  srv.salvar = async (parcial, extra) => {
    const demora = demoras[n++] ?? 0;
    srv.puts.push({ parcial, extra });
    await esperar(demora);
    if (parcial === null || typeof parcial !== 'object' || Array.isArray(parcial)) {
      throw Object.assign(new Error('profile_data deve ser um objeto'), { status: 400 });
    }
    const mesclado = { ...(srv.profile_data || {}), ...parcial };
    if (Buffer.byteLength(JSON.stringify(mesclado)) > 20000) {
      throw Object.assign(new Error('profile_data grande demais'), { status: 400 });
    }
    srv.profile_data = JSON.parse(JSON.stringify(mesclado));
    return { name: extra?.nome ?? 'Nome', preferencias: srv.profile_data };
  };
  return srv;
}

const FICHA = { versao: 1, concluidaEm: '2026-09-20T10:00:00.000Z', fase: 'objetiva', jaFez: 'nao', diasDaSemana: [1, 3], minutosPorDia: 60, dificuldades: ['Direito Penal'] };
const chaves = (o) => Object.keys(o).sort().join(',');

// ---------------------------------------------------------------------------
// Fila de profile_data
// ---------------------------------------------------------------------------

// Salvar a meta manda só meta e data, e preserva a ficha.
await (async () => {
  const srv = servidorFalso({ meta: 20, dataProva: null, ficha: FICHA, outraChave: 'x' });
  const fila = criarFilaDePreferencias(srv.salvar);

  const resposta = await fila.gravar({ meta: 7, dataProva: '2030-03-10' }, { extra: { id: 1 } });
  exigir(chaves(srv.puts[0].parcial) === 'dataProva,meta', `o PUT da meta deveria levar só meta e data, levou ${chaves(srv.puts[0].parcial)}`);
  exigir(srv.profile_data.meta === 7 && srv.profile_data.dataProva === '2030-03-10', 'meta ou data não gravadas');
  exigir(srv.profile_data.ficha?.concluidaEm === FICHA.concluidaEm, 'salvar a meta APAGOU a ficha');
  exigir(srv.profile_data.outraChave === 'x', 'salvar a meta apagou uma chave que o front não conhece');
  exigir(resposta?.preferencias?.ficha?.concluidaEm === FICHA.concluidaEm, 'a resposta (cópia da tela) deveria trazer o profile_data inteiro');
})();

// Salvar a ficha preserva meta, data e o resto.
await (async () => {
  const srv = servidorFalso({ meta: 12, dataProva: '2031-01-05', tema: 'azul' });
  const fila = criarFilaDePreferencias(srv.salvar);

  await fila.gravar({ ficha: FICHA }, { extra: { id: 1, nome: 'Ana' } });
  exigir(chaves(srv.puts[0].parcial) === 'ficha', 'o PUT da ficha deveria levar só a ficha');
  exigir(srv.profile_data.ficha?.concluidaEm === FICHA.concluidaEm, 'a ficha não foi gravada');
  exigir(srv.profile_data.meta === 12 && srv.profile_data.dataProva === '2031-01-05', 'salvar a ficha apagou meta ou data');
  exigir(srv.profile_data.tema === 'azul', 'salvar a ficha apagou uma chave que o front não conhece');
  exigir(srv.puts[0].extra.nome === 'Ana', 'o nome deveria ir no mesmo PUT da ficha');
})();

// A aba desatualizada: a aba A conclui a ficha; a B, aberta antes e que nunca
// soube dela, grava a meta depois. A ficha continua lá.
await (async () => {
  const srv = servidorFalso({ meta: 20 });
  const abaA = criarFilaDePreferencias(srv.salvar);
  const abaB = criarFilaDePreferencias(srv.salvar);
  await abaA.gravar({ ficha: FICHA, meta: 30, dataProva: null }, { extra: { id: 1 } });
  await abaB.gravar({ meta: 25, dataProva: '2030-01-01' }, { extra: { id: 1 } });
  exigir(srv.profile_data.ficha?.concluidaEm === FICHA.concluidaEm, 'a aba desatualizada desfez a ficha da outra');
  exigir(srv.profile_data.meta === 25, 'a meta da aba B deveria valer');
})();

// Gravações parciais em qualquer ordem de chegada preservam as outras chaves.
await (async () => {
  const gravacoes = [
    { meta: 9, dataProva: '2030-05-05' },
    { ficha: FICHA },
    { tema: 'verde' },
  ];
  const ordens = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const ordem of ordens) {
    // Cada gravação por uma fila própria (abas diferentes), chegando ao
    // servidor na ordem da vez.
    const demoras = [];
    ordem.forEach((indice, posicao) => { demoras[indice] = posicao * 5; });
    const srv = servidorFalso({ antiga: 1 }, demoras);
    await Promise.all(gravacoes.map((g) => criarFilaDePreferencias(srv.salvar).gravar(g, { extra: { id: 1 } })));
    const pd = srv.profile_data;
    const ok = pd.meta === 9 && pd.dataProva === '2030-05-05' && pd.ficha?.concluidaEm === FICHA.concluidaEm && pd.tema === 'verde' && pd.antiga === 1;
    exigir(ok, `na ordem ${ordem} alguma chave se perdeu: ${JSON.stringify(pd)}`);
  }
})();

// Na mesma fila, a ordem é a de entrada, mesmo com o primeiro PUT mais lento.
await (async () => {
  const srv = servidorFalso({ meta: 20 }, [40, 5, 0]);
  const fila = criarFilaDePreferencias(srv.salvar);
  const a = fila.gravar({ meta: 8, dataProva: null }, { extra: { id: 1 } });
  const b = fila.gravar({ ficha: FICHA }, { extra: { id: 1 } });
  const c = fila.gravar({ meta: 15, dataProva: '2030-01-01' }, { extra: { id: 1 } });
  await Promise.all([a, b, c]);
  exigir(srv.profile_data.meta === 15, `a última meta deveria valer, veio ${srv.profile_data.meta}`);
  exigir(srv.profile_data.ficha?.concluidaEm === FICHA.concluidaEm, 'a ficha se perdeu');
  exigir(srv.puts.map((p) => chaves(p.parcial)).join('|') === 'dataProva,meta|ficha|dataProva,meta', 'os PUT saíram fora da ordem de entrada');
})();

// `dataProva: null` grava null ("sem data"), e a tela lê assim.
await (async () => {
  const srv = servidorFalso({ meta: 5, dataProva: '2030-01-01', ficha: FICHA });
  const fila = criarFilaDePreferencias(srv.salvar);
  const r = await fila.gravar({ meta: 5, dataProva: null }, { extra: { id: 1 } });
  exigir('dataProva' in srv.profile_data && srv.profile_data.dataProva === null, 'dataProva null deveria ficar gravada como null');
  exigir(configuracoesDoPerfil(r.preferencias, { meta: 1, dataProva: '2029-01-01' }).dataProva === null, 'dataProva null do servidor deveria apagar a local');
})();

// Recusa do servidor (400 por tamanho) chega a quem gravou e não trava a fila;
// sessão encerrada antes da vez não manda nada.
await (async () => {
  const srv = servidorFalso({ meta: 1 });
  const fila = criarFilaDePreferencias(srv.salvar);
  let vivo = true;
  const grande = fila.gravar({ lixo: 'x'.repeat(20001) }, { continuar: () => vivo, extra: { id: 1 } }).catch((e) => e);
  const depois = fila.gravar({ meta: 3 }, { continuar: () => vivo, extra: { id: 1 } });
  exigir((await grande)?.status === 400, 'o 400 do servidor deveria chegar a quem gravou');
  exigir((await depois)?.preferencias?.meta === 3, 'a falha anterior não pode travar a fila');
  exigir(!('lixo' in srv.profile_data), 'o PUT recusado não pode ter gravado nada');

  const parada = fila.gravar({ meta: 9 }, { continuar: () => vivo, extra: { id: 1 } });
  vivo = false;
  exigir((await parada) === null, 'com a sessão encerrada a vez deveria resolver null');
  exigir(srv.profile_data.meta === 3, 'o PUT de uma sessão encerrada saiu');
})();

{
  // Chave ausente: nunca gravada, fica a local. Presente, o servidor manda.
  const locais = { meta: 20, dataProva: '2029-09-09' };
  const vazio = configuracoesDoPerfil({}, locais);
  exigir(vazio.meta === 20 && vazio.dataProva === '2029-09-09', 'sem chaves no servidor, ficam as locais');
  const cheio = configuracoesDoPerfil({ meta: 7, dataProva: '2030-03-10' }, locais);
  exigir(cheio.meta === 7 && cheio.dataProva === '2030-03-10', 'com chaves, o servidor manda');
}

// ---------------------------------------------------------------------------
// Ficha: regras dos passos
// ---------------------------------------------------------------------------

{
  exigir(fichaConcluida({ ficha: FICHA }) === true, 'ficha com concluidaEm deveria contar como feita');
  exigir(fichaConcluida({ ficha: { versao: 1 } }) === false, 'ficha sem concluidaEm não está feita');
  exigir(fichaConcluida(null) === false && fichaConcluida({}) === false, 'sem ficha não está feita');

  exigir(metaSugerida(30) === 10, `30 min → 10 questões, veio ${metaSugerida(30)}`);
  exigir(metaSugerida(60) === 20, `1 h → 20 questões, veio ${metaSugerida(60)}`);
  exigir(metaSugerida(120) === 40, `2 h → 40, veio ${metaSugerida(120)}`);
  exigir(metaSugerida(180) === 60, `3 h → 60, veio ${metaSugerida(180)}`);
  exigir(metaSugerida(null) === null, 'sem tempo não há sugestão');

  exigir(metaValida('12') === 12 && metaValida('0') === null && metaValida('') === null && metaValida('9999') === 500, 'metaValida errada');

  const r = escolherTempo({ meta: 7, minutosPorDia: null }, 120);
  exigir(r.meta === 40 && r.minutosPorDia === 120, 'escolher o tempo deveria sugerir a meta');
}

{
  const hoje = new Date('2026-09-25T12:00:00');
  const base = {
    nome: 'Ana', fase: 'objetiva', dataProva: '', dataIndefinida: false, jaFez: null,
    diasDaSemana: [], minutosPorDia: null, meta: '', dificuldades: [], dificuldadesIndefinidas: false,
  };
  exigir(erroDoPasso(0, { ...base, nome: '  ' }, hoje) != null, 'nome em branco deveria barrar o passo 1');
  exigir(erroDoPasso(0, base, hoje) === null, 'nome e fase bastam no passo 1');
  exigir(erroDoPasso(0, { ...base, fase: 'discursiva-penal' }, hoje) != null, 'fase inexistente deveria barrar');

  exigir(erroDoPasso(1, { ...base, jaFez: 'nao' }, hoje) != null, 'sem data e sem "ainda não sei" deveria barrar');
  exigir(erroDoPasso(1, { ...base, jaFez: 'nao', dataIndefinida: true }, hoje) === null, '"Ainda não sei" é resposta válida');
  exigir(erroDoPasso(1, { ...base, jaFez: 'nao', dataProva: '2026-09-24' }, hoje) != null, 'data que já passou deveria barrar');
  exigir(erroDoPasso(1, { ...base, jaFez: 'nao', dataProva: '2026-09-25' }, hoje) === null, 'a prova pode ser hoje');
  exigir(erroDoPasso(1, { ...base, dataIndefinida: true }, hoje) != null, 'sem "já fez" deveria barrar');

  const rotina = { ...base, diasDaSemana: [1], minutosPorDia: 60, meta: 20 };
  exigir(erroDoPasso(2, rotina, hoje) === null, 'rotina completa deveria passar');
  exigir(erroDoPasso(2, { ...rotina, diasDaSemana: [] }, hoje) != null, 'sem dia da semana deveria barrar');
  exigir(erroDoPasso(2, { ...rotina, meta: '0' }, hoje) != null, 'meta zero deveria barrar');

  exigir(erroDoPasso(3, base, hoje) != null, 'nenhuma matéria e sem "ainda não sei" deveria barrar');
  exigir(erroDoPasso(3, { ...base, dificuldadesIndefinidas: true }, hoje) === null, '"Ainda não sei" vale no passo 4');
  exigir(erroDoPasso(3, { ...base, dificuldades: ['Direito Civil'] }, hoje) === null, 'uma matéria basta');
}

{
  const agora = new Date('2026-09-25T15:00:00.000Z');
  const r = {
    nome: '  Ana Souza ', fase: 'discursiva-civil', dataProva: '2027-02-28', dataIndefinida: true, jaFez: 'uma-vez',
    diasDaSemana: [0, 1, 1, 3], minutosPorDia: 120, meta: '35', dificuldades: ['Direito Penal'], dificuldadesIndefinidas: true,
  };
  const { nome, preferencias } = montarFicha(r, { agora });
  exigir(nome === 'Ana Souza', 'o nome deveria ir sem espaços nas pontas');
  exigir(preferencias.meta === 35, 'a meta vai como número');
  exigir(preferencias.dataProva === null, '"Ainda não sei" grava a data como null');
  exigir(preferencias.ficha.concluidaEm === agora.toISOString(), 'concluidaEm deveria ser agora');
  exigir(preferencias.ficha.versao === 1, 'versao deveria ser 1');
  exigir(JSON.stringify(preferencias.ficha.diasDaSemana) === '[1,3,0]', `dias em ordem seg→dom e sem repetir, veio ${preferencias.ficha.diasDaSemana}`);
  exigir(preferencias.ficha.dificuldades.length === 0, '"Ainda não sei" grava dificuldades vazias');
  exigir(!('atualizadaEm' in preferencias.ficha), 'primeira conclusão não tem atualizadaEm');

  const edicao = montarFicha({ ...r, dataIndefinida: false, dificuldadesIndefinidas: false }, { anterior: FICHA, agora });
  exigir(edicao.preferencias.ficha.concluidaEm === FICHA.concluidaEm, 'editar não pode mudar a data da conclusão');
  exigir(edicao.preferencias.ficha.atualizadaEm === agora.toISOString(), 'editar marca atualizadaEm');
  exigir(edicao.preferencias.dataProva === '2027-02-28', 'com data, a data vai');
  exigir(edicao.preferencias.ficha.dificuldades[0] === 'Direito Penal', 'as matérias marcadas vão');
}

{
  // Conta antiga, sem ficha: nome, meta e data que já existem vêm preenchidos.
  const r = respostasIniciais({ nome: 'Maria', configuracoes: { meta: 7, dataProva: '2030-03-10' }, fase: 'objetiva', preferencias: { meta: 7, dataProva: '2030-03-10' } });
  exigir(r.nome === 'Maria' && r.meta === 7 && r.dataProva === '2030-03-10', 'conta antiga deveria vir pré-preenchida');
  exigir(r.dataIndefinida === false && r.jaFez === null && r.dificuldadesIndefinidas === false, 'o que não foi respondido começa em aberto');

  // Ficha feita, reaberta: as respostas voltam, inclusive os "ainda não sei".
  const salva = respostasIniciais({ nome: 'Maria', configuracoes: { meta: 20, dataProva: null }, fase: 'objetiva', preferencias: { meta: 20, dataProva: null, ficha: { ...FICHA, dificuldades: [] } } });
  exigir(salva.dataIndefinida === true && salva.dificuldadesIndefinidas === true, 'os "ainda não sei" deveriam voltar marcados');
  exigir(salva.minutosPorDia === 60 && salva.jaFez === 'nao' && salva.diasDaSemana.length === 2, 'as respostas da ficha deveriam voltar');

  // Data em formato estranho não entra no campo.
  exigir(respostasIniciais({ configuracoes: { dataProva: 'amanhã' } }).dataProva === '', 'data inválida não pode ir para o campo');
}

{
  const acervo = [{ disciplina: 'Direito Penal' }, { disciplina: 'Ética Profissional' }, { disciplina: null }, { disciplina: 'Direito Penal' }];
  const doAcervo = opcoesDeDificuldade(acervo);
  exigir(JSON.stringify(doAcervo) === JSON.stringify(['Direito Penal', 'Ética Profissional']), `as opções saem do acervo, sem repetir e sem "sem classificação": ${doAcervo}`);
  exigir(opcoesDeDificuldade([]).length === DISCIPLINAS_OAB.length && DISCIPLINAS_OAB.length === 18, 'sem acervo, as 18 matérias conhecidas');
  exigir(opcoesDeDificuldade(acervo, ['Direito Ambiental']).includes('Direito Ambiental'), 'matéria já marcada não pode sumir da lista');

  exigir(rotuloDosDias([1, 2, 3, 4, 5, 6, 0]) === 'todos os dias', 'sete dias = todos os dias');
  exigir(rotuloDosDias([0, 1]) === 'Seg, Dom', `dias na ordem da semana: ${rotuloDosDias([0, 1])}`);
  exigir(formatarData('2027-02-28') === '28/02/2027' && formatarData(null) === 'Ainda não sei', 'formatarData errada');
}

// ---------------------------------------------------------------------------
// Pontos fracos na prioridade de estudo
// ---------------------------------------------------------------------------

{
  const q = (id, disciplina) => ({ id, disciplina, revisada: true });
  const questoes = [
    q('1', 'Civil'), q('2', 'Civil'), q('3', 'Civil'),
    q('4', 'Penal'),
    q('5', 'Ética'), q('6', 'Ética'),
  ];

  // Conta nova: tudo "novo". Sem dificuldade declarada vence a que tem mais
  // questões; com Penal marcada, Penal vem primeiro.
  const semHistorico = montarDisciplinas(questoes, {});
  exigir(prioridadeDeEstudo(semHistorico)[0].nome === 'Civil', 'sem ficha, a de mais questões vem primeiro');
  const comFicha = prioridadeDeEstudo(semHistorico, { dificuldades: ['Penal'] });
  exigir(comFicha[0].nome === 'Penal' && comFicha[0].pontoFraco === true, `a matéria difícil deveria vir primeiro no começo, veio ${comFicha[0].nome}`);
  exigir(comFicha[1].pontoFraco !== true, 'só a declarada ganha pontoFraco');

  // Duas declaradas: entre elas, a de mais questões primeiro.
  const duas = prioridadeDeEstudo(semHistorico, { dificuldades: ['Penal', 'Ética'] }).map((d) => d.nome);
  exigir(duas[0] === 'Ética' && duas[1] === 'Penal' && duas[2] === 'Civil', `duas declaradas: ${duas}`);

  // Com respostas suficientes em Penal, o desempenho manda: acertou tudo,
  // domina, e vai para o fim.
  const tent = (correta) => ({ correta, data: '2026-09-20T10:00:00' });
  const acertos = { '4': { tentativas: Array.from({ length: TENTATIVAS_PARA_CONFIAR }, () => tent(true)) } };
  const comDados = prioridadeDeEstudo(montarDisciplinas(questoes, acertos), { dificuldades: ['Penal'] });
  exigir(comDados[comDados.length - 1].nome === 'Penal', `com ${TENTATIVAS_PARA_CONFIAR} acertos Penal deveria ir para o fim, ordem: ${comDados.map((d) => d.nome)}`);
  exigir(!comDados.some((d) => d.pontoFraco), 'com dados, nenhuma é ponto fraco pela ficha');

  // Com poucas respostas ainda vale a ficha, mesmo que tenha acertado.
  const poucas = { '4': { tentativas: [tent(true)] } };
  exigir(prioridadeDeEstudo(montarDisciplinas(questoes, poucas), { dificuldades: ['Penal'] })[0].nome === 'Penal', 'uma resposta só não basta para tirar a matéria da frente');

  // Matéria errada de verdade continua antes das "novas", mas a declarada
  // sem dados vem antes: é o que a pessoa disse que precisa.
  const errosEmCivil = { '1': { tentativas: Array.from({ length: 6 }, () => tent(false)) } };
  const misto = prioridadeDeEstudo(montarDisciplinas(questoes, errosEmCivil), { dificuldades: ['Ética'] }).map((d) => d.nome);
  exigir(misto[0] === 'Ética' && misto[1] === 'Civil' && misto[2] === 'Penal', `ordem com dados e ficha: ${misto}`);

  // O plano da semana usa a mesma ordem e diz de onde veio a sugestão.
  const plano = planoDaSemana({ disciplinas: semHistorico, tentativas: {}, meta: 10, hoje: new Date('2026-09-25T09:00:00'), dificuldades: ['Penal'] });
  exigir(plano[0].disciplina === 'Penal', `o cronograma deveria começar pela matéria difícil, veio ${plano[0].disciplina}`);
  exigir(/ponto fraco/.test(plano[0].motivo || ''), `o motivo deveria citar a ficha: ${plano[0].motivo}`);
}

if (falhas.length > 0) {
  console.error(`✗ ${falhas.length} falha(s) em ficha.test.js:`);
  for (const f of falhas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ ficha.test.js: fila de profile_data, passos da ficha e pontos fracos na prioridade');
