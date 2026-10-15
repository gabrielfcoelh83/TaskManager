// O que este arquivo protege.
//
// O simulado mandava um POST por resposta, todos juntos, e o nginx (30 por
// segundo, folga de 50) recusava parte deles com 429 numa prova de 80
// questões. As respostas recusadas não viravam tentativa e sumiam de todas
// as métricas, sem erro que chamasse atenção. As duas peças que resolvem
// isso falham do mesmo jeito silencioso quando falham: uma fila que dispara
// tudo de uma vez volta ao problema, e uma fila que não para quando a sessão
// acaba grava resposta de uma conta na outra.

import { enviarEmFila } from '../src/lib/fila.js';
import { repetirEm429 } from '../src/lib/api/retentativa.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const pausa = () => new Promise((r) => setTimeout(r, 1));

// ---------------------------------------------------------------------------
// Fila: um de cada vez
// ---------------------------------------------------------------------------
{
  let emVoo = 0;
  let maximo = 0;
  const ordem = [];
  const enviar = async (item) => {
    emVoo += 1;
    maximo = Math.max(maximo, emVoo);
    await pausa();
    ordem.push(item);
    emVoo -= 1;
    return true;
  };

  const itens = Array.from({ length: 80 }, (_, i) => i);
  const r = await enviarEmFila(itens, enviar);

  exigir(maximo === 1, `a fila mandou ${maximo} pedidos ao mesmo tempo — é o que o nginx recusava`);
  exigir(r.salvos === 80 && r.falhas === 0 && !r.interrompida, `80 itens: ${JSON.stringify(r)}`);
  exigir(ordem.every((v, i) => v === i), 'a fila trocou a ordem das respostas');
}

{
  // Falha no meio não para a fila, e é contada: é o número que o App mostra.
  const r = await enviarEmFila([1, 2, 3, 4], async (n) => {
    if (n === 2) return false;
    if (n === 3) throw new Error('rede');
    return true;
  });
  exigir(r.salvos === 2 && r.falhas === 2, `falhas no meio: ${JSON.stringify(r)}`);
  exigir(!r.interrompida, 'falha de um item não pode interromper a fila');
}

{
  // A sessão acaba no meio da prova: o resto não pode sair. É o que impede
  // uma resposta da conta anterior de ser gravada na conta de quem entrou.
  const enviados = [];
  let sessaoAtiva = true;
  const r = await enviarEmFila([1, 2, 3, 4, 5], async (n) => {
    enviados.push(n);
    if (n === 2) sessaoAtiva = false;
    return true;
  }, { continuar: () => sessaoAtiva });

  exigir(JSON.stringify(enviados) === JSON.stringify([1, 2]), `depois do fim da sessão ainda saíram: ${JSON.stringify(enviados)}`);
  exigir(r.interrompida && r.salvos === 2, `fila interrompida: ${JSON.stringify(r)}`);
}

{
  const r = await enviarEmFila([], async () => true);
  exigir(r.salvos === 0 && r.falhas === 0 && !r.interrompida, 'simulado todo em branco: fila vazia');
}

// ---------------------------------------------------------------------------
// Fila: poucos de cada vez
// ---------------------------------------------------------------------------
{
  // É como o App chama: quatro no ar, nunca mais. Em série a prova levava
  // tempo demais; todas juntas, o nginx recusava.
  let emVoo = 0;
  let maximo = 0;
  const enviados = new Map();
  const r = await enviarEmFila(Array.from({ length: 80 }, (_, i) => i), async (item) => {
    emVoo += 1;
    maximo = Math.max(maximo, emVoo);
    await pausa();
    enviados.set(item, (enviados.get(item) || 0) + 1);
    emVoo -= 1;
    return true;
  }, { simultaneos: 4 });

  exigir(maximo === 4, `com simultaneos: 4, ficaram ${maximo} pedidos no ar ao mesmo tempo`);
  exigir(r.salvos === 80 && enviados.size === 80, `80 itens com 4 por vez: ${r.salvos} salvos, ${enviados.size} distintos`);
  exigir([...enviados.values()].every((v) => v === 1), 'algum item foi enviado duas vezes');
}

{
  // Fim de sessão com quatro no ar: os que já saíram terminam, nenhum novo sai.
  let sessaoAtiva = true;
  let enviados = 0;
  const r = await enviarEmFila(Array.from({ length: 20 }, (_, i) => i), async () => {
    enviados += 1;
    if (enviados === 6) sessaoAtiva = false;
    await pausa();
    return true;
  }, { simultaneos: 4, continuar: () => sessaoAtiva });

  exigir(enviados <= 6 + 3, `depois do fim da sessão ainda saíram pedidos: ${enviados} enviados`);
  exigir(r.interrompida && r.salvos === enviados, `interrompida com 4 por vez: ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------------------
// 429: repetir, com espera, e desistir no fim
// ---------------------------------------------------------------------------
const resposta = (status) => ({ status });

{
  const esperas = [];
  const status = [429, 429, 201];
  let chamadas = 0;
  const res = await repetirEm429(async () => resposta(status[chamadas++]), {
    esperas: [500, 1000, 2000],
    esperar: async (ms) => { esperas.push(ms); },
  });

  exigir(res.status === 201, `depois de dois 429 deveria ter vindo o 201, veio ${res.status}`);
  exigir(chamadas === 3, `dois 429 e um 201 fizeram ${chamadas} chamadas, esperado 3`);
  exigir(JSON.stringify(esperas) === '[500,1000]', `esperou ${JSON.stringify(esperas)}, esperado [500,1000]`);
}

{
  // 429 sem fim: desiste depois das esperas e devolve o 429, sem laço infinito.
  let chamadas = 0;
  const res = await repetirEm429(async () => { chamadas += 1; return resposta(429); }, {
    esperas: [1, 1, 1],
    esperar: async () => {},
  });
  exigir(res.status === 429 && chamadas === 4, `429 sem fim: ${chamadas} chamadas e status ${res.status}, esperado 4 e 429`);
}

{
  // Outros erros não são repetidos: um 500 ou um 401 repetido não muda nada,
  // e um POST que chegou ao serviço poderia ser gravado duas vezes.
  for (const codigo of [500, 401, 400, 201]) {
    let chamadas = 0;
    let esperou = false;
    const res = await repetirEm429(async () => { chamadas += 1; return resposta(codigo); }, {
      esperas: [1, 1, 1],
      esperar: async () => { esperou = true; },
    });
    exigir(chamadas === 1 && !esperou && res.status === codigo, `status ${codigo} foi repetido (${chamadas} chamadas)`);
  }
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ envio: fila com limite de pedidos no ar, falhas contadas, para no fim da sessão; 429 repetido com espera e só ele');
