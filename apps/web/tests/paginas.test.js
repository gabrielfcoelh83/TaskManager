// O que este arquivo protege.
//
// O histórico de tentativas vinha numa ida só ao servidor, com teto de 1000.
// Quem passasse disso tinha meta, sequência e revisão calculadas sobre uma
// lista cortada, sem erro nenhum na tela. O laço de páginas que resolve isso
// falha do mesmo jeito silencioso quando falha: um offset que não anda repete
// a primeira página, uma condição de parada errada corta a última, e as duas
// coisas só aparecem como números errados.
//
// Por isso o laço é puro e roda aqui, contra um servidor de mentira.

import { paraPagina, percorrerPaginas } from '../src/lib/api/paginas.js';
import { mesclarTentativas } from '../src/lib/historico.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

// Um servidor paginado por offset, como o estudo-service com `paginado=1`.
// `aoPedir` deixa o teste mexer na lista entre uma página e outra.
function servidor(lista, { tamanho = 1000, aoPedir } = {}) {
  const chamadas = [];
  const buscar = async (offset) => {
    chamadas.push(offset);
    aoPedir?.(chamadas.length, lista);
    return { itens: lista.slice(offset, offset + tamanho), total: lista.length };
  };
  return { buscar, chamadas };
}

const linhas = (n, prefixo = 't') => Array.from({ length: n }, (_, i) => ({ id: `${prefixo}${i}` }));
const opcoes = { maxPaginas: 50, chaveDe: (l) => l.id };

// ---------------------------------------------------------------------------
// Chega ao fim, e só ao fim
// ---------------------------------------------------------------------------
{
  const { buscar, chamadas } = servidor(linhas(2500));
  const { itens, completo } = await percorrerPaginas(buscar, opcoes);

  exigir(itens.length === 2500, `2500 no servidor, ${itens.length} lidas — o laço cortou ou repetiu`);
  exigir(completo, 'lista lida inteira não pode vir marcada como incompleta');
  exigir(
    JSON.stringify(chamadas) === JSON.stringify([0, 1000, 2000]),
    `offsets pedidos ${JSON.stringify(chamadas)}, esperado [0,1000,2000]`
  );
}

{
  // Múltiplo exato do tamanho da página: a terceira ida seria uma página
  // vazia pedida à toa em toda abertura do app.
  const { buscar, chamadas } = servidor(linhas(2000));
  const { itens } = await percorrerPaginas(buscar, opcoes);

  exigir(itens.length === 2000, `2000 no servidor, ${itens.length} lidas`);
  exigir(chamadas.length === 2, `2000 itens em páginas de 1000 pediram ${chamadas.length} páginas, esperado 2`);
}

{
  const { buscar, chamadas } = servidor([]);
  const { itens, completo } = await percorrerPaginas(buscar, opcoes);

  exigir(itens.length === 0 && completo, 'histórico vazio tem de voltar vazio e completo');
  exigir(chamadas.length === 1, `histórico vazio pediu ${chamadas.length} páginas, esperado 1`);
}

// ---------------------------------------------------------------------------
// Serviço anterior à paginação
// ---------------------------------------------------------------------------
{
  // Ele ignora `offset` e devolve sempre as mesmas 1000, e o front traduz o
  // array para `total` igual ao tamanho. Se o laço não parar aí, pede a mesma
  // lista 50 vezes e junta 50 cópias — ou, sem `chaveDe`, 50 mil tentativas.
  const antigas = linhas(1000);
  const chamadas = [];
  const buscar = async (offset) => {
    chamadas.push(offset);
    return { itens: antigas, total: antigas.length };
  };
  const { itens, completo } = await percorrerPaginas(buscar, opcoes);

  exigir(chamadas.length === 1, `serviço antigo recebeu ${chamadas.length} pedidos, esperado 1`);
  exigir(itens.length === 1000 && completo, 'serviço antigo: as 1000 que ele manda, numa página só');
}

// ---------------------------------------------------------------------------
// A lista muda durante a leitura
// ---------------------------------------------------------------------------
{
  // Uma resposta gravada entre a primeira e a segunda página entra no topo e
  // empurra tudo uma posição: a última da página 1 volta na página 2.
  const originais = linhas(2500);
  const { buscar } = servidor(originais.slice(), {
    aoPedir: (n, lista) => { if (n === 2) lista.unshift({ id: 'nova' }); },
  });
  const { itens, completo } = await percorrerPaginas(buscar, opcoes);

  const ids = itens.map((l) => l.id);
  exigir(new Set(ids).size === ids.length, 'linha repetida entre páginas não foi descartada');
  exigir(
    originais.every((l) => ids.includes(l.id)),
    'uma tentativa que já existia sumiu porque outra entrou no meio da leitura'
  );
  exigir(completo, 'lista que cresceu durante a leitura ainda foi lida até o fim');
}

{
  // `chaveDe` compara como texto: o Postgres devolve bigint como string, e
  // um id que chegasse como número não pode passar por diferente.
  const buscar = async (offset) =>
    offset === 0 ? { itens: [{ id: 5 }], total: 2 } : { itens: [{ id: '5' }], total: 2 };
  const { itens } = await percorrerPaginas(buscar, opcoes);

  exigir(itens.length === 1, 'id 5 e "5" são a mesma tentativa');
}

// ---------------------------------------------------------------------------
// Servidor quebrado não prende o laço
// ---------------------------------------------------------------------------
{
  // Página cheia, total alto, e o offset nunca faz diferença: sem o teto,
  // o app pediria para sempre.
  let pedidos = 0;
  const buscar = async () => {
    pedidos += 1;
    return { itens: [{ id: `x${pedidos}` }], total: 1e9 };
  };
  const { itens, completo } = await percorrerPaginas(buscar, { ...opcoes, maxPaginas: 5 });

  exigir(pedidos === 5, `teto de 5 páginas fez ${pedidos} pedidos`);
  exigir(!completo, 'parar no teto tem de ser dito: a lista não está completa');
  exigir(itens.length === 5, `teto de 5 páginas devolveu ${itens.length} itens`);
}

{
  // Página vazia com total ainda alto: o servidor não tem mais o que dar, e
  // insistir seria o mesmo laço sem fim por outro caminho.
  let pedidos = 0;
  const buscar = async (offset) => {
    pedidos += 1;
    return { itens: offset === 0 ? linhas(3) : [], total: 100 };
  };
  const { itens } = await percorrerPaginas(buscar, opcoes);

  exigir(pedidos === 2, `página vazia não parou o laço: ${pedidos} pedidos`);
  exigir(itens.length === 3, `página vazia: ${itens.length} itens, esperado 3`);
}

// ---------------------------------------------------------------------------
// Os dois formatos de resposta
// ---------------------------------------------------------------------------
{
  // O serviço antigo responde array. Sem esta tradução, o array cairia em
  // `resposta.tentativas` (undefined) e o histórico viria vazio para todo
  // mundo até o serviço novo ser publicado — com o laço dizendo "completo".
  const antigo = paraPagina([{ id: '1' }, { id: '2' }], 'tentativas');
  exigir(antigo.itens.length === 2, `array do serviço antigo virou ${antigo.itens.length} itens`);
  exigir(antigo.total === 2, 'array do serviço antigo tem de vir com total igual ao tamanho, para o laço parar');

  const novo = paraPagina({ tentativas: [{ id: '1' }], total: 40, limite: 1, offset: 0 }, 'tentativas');
  exigir(novo.itens.length === 1 && novo.total === 40, 'envelope: itens da página e total do filtro');

  const vazio = paraPagina(null, 'tentativas');
  exigir(vazio.itens.length === 0 && vazio.total === 0, 'resposta vazia (204) vira página vazia, não exceção');

  const outraChave = paraPagina({ questoes: [{ id: '1' }], total: 1 }, 'tentativas');
  exigir(outraChave.itens.length === 0, 'envelope de outra rota não pode ser lido como tentativas');
}

// ---------------------------------------------------------------------------
// A resposta dada enquanto o histórico carrega
// ---------------------------------------------------------------------------
{
  const t = (id, extra = {}) => ({ id, correta: true, tipo: null, certeza: null, ...extra });

  // O servidor devolveu o que tinha quando cada página foi lida. Enquanto isso,
  // a pessoa respondeu a q1 de novo (id 30) e a q9 pela primeira vez (id 31) —
  // as duas entraram no topo depois da página 1 e não vieram na carga.
  const carregadas = {
    q1: { tentativas: [t('10'), t('20')], desempenho: 'necessita' },
    q2: { tentativas: [t('11')], desempenho: 'necessita' },
  };
  const recentes = {
    q1: { tentativas: [t('30')], desempenho: 'necessita' },
    q9: { tentativas: [t('31')], desempenho: 'necessita' },
  };
  const junto = mesclarTentativas(carregadas, recentes);

  const idsQ1 = junto.q1.tentativas.map((x) => x.id);
  exigir(
    JSON.stringify(idsQ1) === JSON.stringify(['10', '20', '30']),
    `q1 deveria ser [10,20,30] em ordem cronológica, veio ${JSON.stringify(idsQ1)}`
  );
  exigir(junto.q9?.tentativas.length === 1, 'questão respondida só durante a carga sumiu da tela');
  exigir(junto.q2.tentativas.length === 1, 'questão que só veio da carga se perdeu na mesclagem');

  // O mesmo id vindo como número e como texto é uma tentativa só, e a versão
  // local vence a da carga.
  const comFeedback = mesclarTentativas(
    { q1: { tentativas: [t('10'), t('20')] } },
    { q1: { tentativas: [t(20, { tipo: 'chute', certeza: 30 })] } }
  );
  exigir(comFeedback.q1.tentativas.length === 2, 'a mesma tentativa, com id número e texto, virou duas');
  exigir(comFeedback.q1.tentativas[1].tipo === 'chute', 'a versão local da tentativa foi sobrescrita pela carga');

  // Nada registrado durante a carga: o resultado é a carga, sem mexer nela.
  const soCarga = mesclarTentativas(carregadas, {});
  exigir(JSON.stringify(soCarga) === JSON.stringify(carregadas), 'sem respostas novas, a carga tem de passar intacta');
  exigir(carregadas.q1.tentativas.length === 2, 'a mesclagem não pode alterar o objeto carregado');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ paginação: lê até o fim, aceita o serviço antigo, descarta repetidas, não prende o laço e não perde resposta dada durante a carga');
