// A conferência de fundamentos da 2ª fase.
//
// O risco aqui é duplo e silencioso: dizer "faltou o art. 1.659" para quem o
// citou (a pessoa desconfia do app, com razão) e dizer "citou" para quem
// escreveu o artigo de outra lei (a pessoa leva para a prova um fundamento
// errado achando que acertou). Os casos abaixo são frases reais de padrões de
// resposta da FGV e jeitos comuns de escrever citação.

import {
  extrairCitacoes, esperadosDoGabarito, compararFundamentos, conferirQuestao, formatarArtigo,
  caminhosDoGabarito,
} from '../src/lib/fundamentos.js';
import { agruparPorExame, formatarValor, respostasPreenchidas, mesmoRascunho, maisRecente } from '../src/lib/discursivas.js';

const falhas = [];
const exigir = (condicao, mensagem) => {
  if (!condicao) falhas.push(mensagem);
};

const chaves = (texto) => extrairCitacoes(texto).map((c) => c.chave);
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exigirChaves = (texto, esperado) => {
  const obtido = chaves(texto);
  exigir(igual(obtido, esperado), `"${texto}" → ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
};

// ---- Extração: formatos reais -------------------------------------------

exigirChaves('nos termos do Art. 1.659, inciso I, do CC.', ['CC:1659']);
exigirChaves('art. 876, §5º ou §6º, do CPC', ['CPC:876']);
exigirChaves('arts. 186 e 927 do CC', ['CC:186', 'CC:927']);
exigirChaves('CC, art. 186', ['CC:186']);
exigirChaves('artigo 1.228 do Código Civil', ['CC:1228']);
exigirChaves('Art. 125, inciso II, do CPC', ['CPC:125']);
exigirChaves('Súmula 537 do STJ', ['SUM:STJ:537']);
exigirChaves('Lei nº 8.078/90, art. 14', ['CDC:14']);
exigirChaves('art. 14 da Lei nº 8.078/90', ['CDC:14']);
exigirChaves('art. 14 do CDC', ['CDC:14']);
exigirChaves('art. 1659 do CC/02', ['CC:1659']);
exigirChaves('artigo 1.659, I, do Código Civil de 2002', ['CC:1659']);
exigirChaves('art. 319 do Código de Processo Civil', ['CPC:319']);
exigirChaves('art. 5º, X, da CF/88', ['CF:5']);
exigirChaves('art. 1.240-A do CC', ['CC:1240-A']);
exigirChaves('arts. 186, 187 e 927 do CC', ['CC:186', 'CC:187', 'CC:927']);
exigirChaves('art. 186 c/c art. 927, ambos do CC', ['CC:186', 'CC:927']);
exigirChaves('art. 186 do CC c/c art. 927 do mesmo diploma', ['CC:186', 'CC:927']);
exigirChaves('Súmula Vinculante 25', ['SUM:VSTF:25']);
exigirChaves('súmula nº 297 do Superior Tribunal de Justiça', ['SUM:STJ:297']);
exigirChaves('art. 22 da Lei nº 8.245/91', ['Lei 8.245:22']);
exigirChaves('(art. 1.659, I, CC)', ['CC:1659']);
exigirChaves('artigo 1659 inciso I do CC', ['CC:1659']);

// "CC" e "CDC" são letras romanas válidas: não podem virar inciso.
exigirChaves('art. 186, CC', ['CC:186']);
exigirChaves('art. 6º, VIII, CDC', ['CDC:6']);

// Detalhe fica registrado, sem entrar na chave.
{
  const [c] = extrairCitacoes('Art. 1.659, inciso I, do CC');
  exigir(c.detalhe === 'inciso I', `detalhe do inciso: "${c?.detalhe}"`);
  exigir(c.rotulo === 'Art. 1.659 do CC', `rótulo: "${c?.rotulo}"`);
  const [d] = extrairCitacoes('art. 876, §5º ou §6º, do CPC');
  exigir(d.detalhe === '§5º ou §6º', `detalhe dos parágrafos: "${d?.detalhe}"`);
}

// ---- Encadeamentos (achados da revisão) ------------------------------------

// "C/C" em maiúsculas: o "C" era lido como inciso romano e o 927 sumia.
exigirChaves('art. 186 C/C 927 do CC', ['CC:186', 'CC:927']);
exigirChaves('art. 186 c.c. 927 do CC', ['CC:186', 'CC:927']);
{
  const cs = extrairCitacoes('Art. 186 C/C Art. 927 do CC');
  exigir(igual(cs.map((c) => c.chave), ['CC:186', 'CC:927']), `"C/C Art.": ${JSON.stringify(cs.map((c) => c.chave))}`);
  exigir(cs[0]?.detalhe === '', `"C/C" não é detalhe do 186: "${cs[0]?.detalhe}"`);
}
// O diploma fechou o primeiro grupo; o "e 179" continua, com a lei dele.
exigirChaves('artigo 496 do Código Civil e 179 do CC', ['CC:496', 'CC:179']);
exigirChaves('art. 496 do CC e 179', ['CC:496', 'CC:179']);
exigirChaves('Art. 14 do CDC e art. 186 do CC', ['CDC:14', 'CC:186']);
exigirChaves('art. 14 do CDC e 10 dias depois', ['CDC:14']);
// Intervalo: os do meio também contam.
exigirChaves('arts. 186 a 188 do CC', ['CC:186', 'CC:187', 'CC:188']);
exigirChaves('arts. 186 até 188 do CC', ['CC:186', 'CC:187', 'CC:188']);
{
  const r = compararFundamentos('Conforme os arts. 186 a 188 do CC.', 'Sim, nos termos do Art. 187 do CC.');
  exigir(r.atendidos.length === 1, 'intervalo atende o artigo do meio');
}
exigirChaves('art. 5º a 10 dias', ['?:5']);
// Intervalo no meio do encadeamento, não só no primeiro par.
exigirChaves('arts. 186, 187 a 190 do CC', ['CC:186', 'CC:187', 'CC:188', 'CC:189', 'CC:190']);
exigirChaves('arts. 186 e 187 a 190 do CC', ['CC:186', 'CC:187', 'CC:188', 'CC:189', 'CC:190']);
// Intervalo de parágrafos ou incisos é detalhe do artigo, nunca artigo novo.
exigirChaves('art. 1.228, § 1º a 3º, do CC', ['CC:1228']);
exigirChaves('art. 5º, §§ 1º a 3º, da CF', ['CF:5']);
exigirChaves('art. 1.228, §§ 1º até 3º, do CC', ['CC:1228']);
exigirChaves('art. 5º, incisos I a III, da CF', ['CF:5']);
{
  const [c] = extrairCitacoes('art. 1.228, § 1º a 3º, do CC');
  exigir(c?.detalhe === '§ 1º a 3º', `detalhe do intervalo de parágrafos: "${c?.detalhe}"`);
}
// Depois de o diploma fechar o grupo, número seguido de palavra comum não é artigo.
exigirChaves('art. 186 do CC e 3, conforme a doutrina', ['CC:186']);
exigirChaves('art. 186 do CC e 2 dos réus', ['CC:186']);
exigirChaves('art. 186 do CC e 927.', ['CC:186', 'CC:927']);
exigirChaves('art. 186 do CC e 927, parágrafo único', ['CC:186', 'CC:927']);
exigirChaves('art. 186 do CC e art. 2 dos réus', ['CC:186', 'CC:2']);
// …mas vírgula ou parêntese depois de número com cara de artigo continua.
exigirChaves('Com base no art. 186 do CC e 927, o réu indeniza.', ['CC:186', 'CC:927']);
exigirChaves('art. 186 do CC e 927, sendo devida a indenização', ['CC:186', 'CC:927']);
exigirChaves('art. 186 do CC e 927 (responsabilidade)', ['CC:186', 'CC:927']);
exigirChaves('art. 1.228 do CC e 1.240-A, quanto à usucapião', ['CC:1228', 'CC:1240-A']);
exigirChaves('art. 186 do CC e 3, conforme a doutrina', ['CC:186']);
exigirChaves('art. 186 do CC e 3 (três) réus', ['CC:186']);
exigirChaves('art. 523 do CPC e 15 (quinze) dias', ['CPC:523']);
exigirChaves('art. 186 do CC e 50 (cinquenta) mil reais', ['CC:186']);
exigirChaves('art. 186 do CC e 10, conforme a doutrina', ['CC:186']);
// Palavra que só começa como número por extenso não é quantidade.
exigirChaves('art. 186 do CC e 187 (umbral)', ['CC:186', 'CC:187']);
exigirChaves('art. 186 do CC e 44 (milícia)', ['CC:186', 'CC:44']);
exigirChaves('art. 186 do CC e 200 (duzentos) reais', ['CC:186']);
// Decisão registrada: depois do diploma, dois dígitos seguidos só de vírgula
// não contam (o preço de barrar "e 10, conforme"); com "caput" contam.
exigirChaves('art. 5º da CF e 37, conforme', ['CF:5']);
exigirChaves('art. 186 do CC e 927, sendo devida a indenização', ['CC:186', 'CC:927']);
// O "1" de "1.229" não é um § 1º.
{
  const cs = extrairCitacoes('art. 1.228, § 1º a 3º e 1.229 do CC');
  exigir(igual(cs.map((c) => c.chave), ['CC:1228', 'CC:1229']), `"§ 1º a 3º e 1.229": ${JSON.stringify(cs.map((c) => c.chave))}`);
  exigir(cs[0]?.detalhe === '§ 1º a 3º', `detalhe antes do 1.229: "${cs[0]?.detalhe}"`);
}
exigirChaves('art. 1.228, § 1º e 1.229 do CC', ['CC:1228', 'CC:1229']);
exigirChaves('art. 1.228, §§ 1º e 2º, do CC', ['CC:1228']);
// Sigla minúscula logo depois da preposição.
exigirChaves('art. 186 do cc', ['CC:186']);
exigirChaves('art. 319 do cpc', ['CPC:319']);
exigirChaves('art. 14 do cdc', ['CDC:14']);
exigirChaves('art. 5º da cf', ['CF:5']);
exigirChaves('art. 150 do ctn', ['CTN:150']);
exigirChaves('art. 7º da clt', ['CLT:7']);
// Sem a preposição, minúscula continua não sendo sigla.
exigirChaves('art. 186, cc', ['?:186']);

// ---- Sem lookbehind ---------------------------------------------------------
//
// Lookbehind é SyntaxError no Safari antes do 16.4, e este módulo é
// importado pelo App: o app inteiro deixaria de carregar.
// Vale para todo o código que vai para o navegador ou roda na Vercel, não só
// para este módulo. `.at()` (Safari < 15.4) pelo mesmo motivo.
{
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const path = await import('node:path');
  const raiz = new URL('..', import.meta.url).pathname;
  const arquivos = [];
  const varrer = (pasta) => {
    for (const nome of readdirSync(pasta)) {
      if (nome === 'node_modules') continue;
      const caminho = path.join(pasta, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (/\.(js|jsx)$/.test(nome)) arquivos.push(caminho);
    }
  };
  varrer(path.join(raiz, 'src'));
  varrer(path.join(raiz, 'api'));
  exigir(arquivos.length > 10, `varredura achou só ${arquivos.length} arquivos`);
  for (const arquivo of arquivos) {
    const codigo = readFileSync(arquivo, 'utf8');
    exigir(!codigo.includes('(?<'), `${path.relative(raiz, arquivo)} usa lookbehind (ou grupo nomeado)`);
    exigir(!/\.at\(\s*-/.test(codigo), `${path.relative(raiz, arquivo)} usa .at(-n)`);
  }
}

// ---- Extração: o que NÃO é citação --------------------------------------

exigirChaves('O valor da causa era de R$ 1.659,00, pago em 186 dias.', []);
exigirChaves('A Lei nº 8.078/90 se aplica à relação.', []);
exigirChaves('art. 186 e 10 testemunhas foram ouvidas', ['?:186']);
exigirChaves('cf. art. 186', ['?:186']);
exigirChaves('O processo nº 1234 tramitou por 2 anos.', []);
exigirChaves('partilha', []);
exigirChaves('', []);
exigirChaves(null, []);

// ---- Rótulos --------------------------------------------------------------

exigir(formatarArtigo('1659') === '1.659', 'milhar no rótulo');
exigir(formatarArtigo('5') === '5º', 'ordinal até o 9');
exigir(formatarArtigo('10') === '10', 'sem ordinal a partir do 10');
exigir(formatarArtigo('1240-A') === '1.240-A', 'artigo com letra');

// ---- Gabarito: fundamentos esperados --------------------------------------

const GABARITO_HERANCA = 'Não. Tendo em vista que o bem móvel penhorado foi adquirido por Fabiano em razão de herança recebida na constância do casamento, ele estará excluído da comunhão, nos termos do Art. 1.659, inciso I, do CC.';

{
  const e = esperadosDoGabarito(GABARITO_HERANCA);
  exigir(e.length === 1 && e[0].opcoes[0].chave === 'CC:1659', `esperados do gabarito da herança: ${JSON.stringify(e)}`);
}

const GABARITO_ALTERNATIVAS = 'Sim. A seguradora pode ser demandada diretamente, com fundamento no Art. 787, §3º, do CC ou do Art. 125, inciso II, do CPC, ou da Súmula 537 do STJ.';

{
  const e = esperadosDoGabarito(GABARITO_ALTERNATIVAS);
  exigir(e.length === 1, `"ou" tem de virar um fundamento só, veio ${e.length}`);
  exigir(
    igual(e[0]?.opcoes.map((o) => o.chave), ['CC:787', 'CPC:125', 'SUM:STJ:537']),
    `opções do fundamento alternativo: ${JSON.stringify(e[0]?.opcoes.map((o) => o.chave))}`,
  );
  exigir(e[0]?.rotulo === 'Art. 787 do CC ou Art. 125 do CPC ou Súmula 537 do STJ', `rótulo alternativo: ${e[0]?.rotulo}`);
}

{
  // "e" não é "ou": dois fundamentos, cada um obrigatório.
  const e = esperadosDoGabarito('Responde com base nos arts. 186 e 927 do CC e no Art. 14 do CDC.');
  exigir(e.length === 3, `"e" entre fundamentos: ${e.length} esperados`);
}

{
  // O mesmo artigo citado duas vezes no padrão não vira dois fundamentos.
  const e = esperadosDoGabarito('Art. 1.659, I, do CC. Como diz o art. 1.659 do CC, o bem é particular.');
  exigir(e.length === 1, `artigo repetido no gabarito: ${e.length} esperados`);
}

{
  const e = esperadosDoGabarito('O prazo é de três anos, conforme o art. 206, §3º, V, do CC; ou de cinco, pelo art. 27 do CDC.');
  exigir(e.length === 1 && e[0].opcoes.length === 2, `"; ou" também liga alternativas: ${JSON.stringify(e)}`);
}

// ---- Comparação resposta × gabarito ---------------------------------------

{
  const r = compararFundamentos('Não, pois bens recebidos por herança não se comunicam (art. 1659, I, CC).', GABARITO_HERANCA);
  exigir(r.atendidos.length === 1 && r.faltando.length === 0, `resposta certa da herança: ${JSON.stringify(r)}`);
  exigir(r.atendidos[0]?.citado.detalhe === 'I', 'o detalhe citado pela pessoa aparece');
  exigir(r.extras.length === 0, 'sem extras');
}

{
  // Mesmo número, outro diploma: não atende, e aparece como extra.
  const r = compararFundamentos('Não, conforme art. 1.659 do CPC.', GABARITO_HERANCA);
  exigir(r.atendidos.length === 0 && r.faltando.length === 1, 'artigo de outro diploma não atende');
  exigir(r.extras[0]?.chave === 'CPC:1659', `o artigo de outro diploma vira extra: ${JSON.stringify(r.extras)}`);
}

{
  // Sem dizer a lei: atende, marcado.
  const r = compararFundamentos('Não, o art. 1.659, I exclui o bem.', GABARITO_HERANCA);
  exigir(r.atendidos.length === 1 && r.atendidos[0].citado.semDiploma === true, 'artigo sem diploma atende, com aviso');
}

{
  const r = compararFundamentos('Não, porque o bem veio de herança.', GABARITO_HERANCA);
  exigir(r.atendidos.length === 0 && r.faltando.length === 1 && r.extras.length === 0, 'resposta sem citação');
}

{
  // Qualquer uma das alternativas satisfaz.
  const pelaSumula = compararFundamentos('Sim, a Súmula 537 do STJ permite.', GABARITO_ALTERNATIVAS);
  exigir(pelaSumula.atendidos.length === 1, 'súmula satisfaz o fundamento alternativo');
  const peloCpc = compararFundamentos('Sim, pela denunciação da lide (art. 125, II, do CPC).', GABARITO_ALTERNATIVAS);
  exigir(peloCpc.atendidos.length === 1, 'CPC satisfaz o fundamento alternativo');
  const errado = compararFundamentos('Sim, art. 125 do CC.', GABARITO_ALTERNATIVAS);
  exigir(errado.atendidos.length === 0, 'art. 125 do CC não é o art. 125 do CPC');
}

{
  // Extra que não está no padrão.
  const r = compararFundamentos('Não, art. 1.659, I, do CC e art. 1.658 do CC.', GABARITO_HERANCA);
  exigir(r.atendidos.length === 1 && r.extras.length === 1 && r.extras[0].chave === 'CC:1658', `extras: ${JSON.stringify(r.extras)}`);
}

{
  // Gabarito sem artigo nenhum: nada esperado, nada faltando.
  const r = compararFundamentos('Não, art. 1.659 do CC.', 'Não, porque o contrato é nulo.');
  exigir(r.esperados.length === 0 && r.faltando.length === 0, 'gabarito sem citação');
}

// ---- Padrões de resposta reais (Direito Civil, 36º a 45º Exame) ----------

// 36º Exame, questão 2, item A: o mesmo artigo volta sem a lei ("o Art. 462
// adota…"). É o art. 462 do CC de novo, não um segundo fundamento.
{
  const e = esperadosDoGabarito('…atraindo o disposto no Art. 462 do CC. (…) Ainda que a forma adotada tenha sido dissonante, o Art. 462 adota a liberdade formal (…) Marina pode exigir o cumprimento da obrigação de contratar, na forma do Art. 463 do CC.');
  exigir(igual(e.map((x) => x.opcoes.map((o) => o.chave)), [['CC:462'], ['CC:463']]), `artigo repetido sem a lei: ${JSON.stringify(e.map((x) => x.rotulo))}`);
}

// 36º Exame, questão 2, item B: "parte final" é detalhe, não some com a lei.
{
  const e = esperadosDoGabarito('na forma do Art. 464 do CC, (…) na forma do Art. 501 do CPC. As perdas e danos são cabíveis (…) conforme o Art. 464, parte final, do CC, ou se for do interesse da parte credora, (…) na forma do Art. 465 do CC.');
  exigir(igual(e.map((x) => x.opcoes.map((o) => o.chave)), [['CC:464'], ['CPC:501'], ['CC:465']]), `artigo já pedido não vira opção de outro: ${JSON.stringify(e.map((x) => x.rotulo))}`);
}
exigirChaves('conforme o Art. 464, parte final, do CC', ['CC:464']);

// 39º Exame, questão 3: LGPD pela sigla e pelo número da lei.
exigirChaves('O Art. 8º, § 5º, da Lei nº 13.709/18 (LGPD) dispõe', ['LGPD:8']);
exigirChaves('(Art. 15, inciso III, da LGPD)', ['LGPD:15']);
{
  const [c] = extrairCitacoes('na forma do Art. 16, caput, da LGPD');
  exigir(c?.rotulo === 'Art. 16 da LGPD', `rótulo no feminino: "${c?.rotulo}"`);
}

// 42º Exame, questão 2, item A: a lei pelo nome e pelo número é a mesma.
{
  const e = esperadosDoGabarito('Sim, nos termos do Art. 57 da Lei de Registros Públicos (Lei nº 6.015/1973), como a união (…) (Art. 57, § 2º, da Lei nº 6.015/1973).');
  exigir(e.length === 1 && e[0].opcoes[0].chave === 'Lei 6.015:57', `Lei de Registros Públicos: ${JSON.stringify(e)}`);
}

// 40º Exame, questão 2, item A: "ou … ambos do Código Civil".
{
  const e = esperadosDoGabarito('Sim, Maria pode revogar a doação por descumprimento do encargo, nos termos do Art. 562 ou do Art. 555, ambos do Código Civil.');
  exigir(igual(e.map((x) => x.opcoes.map((o) => o.chave)), [['CC:562', 'CC:555']]), `"ou … ambos do": ${JSON.stringify(e)}`);
}

// 43º Exame, questão 2, item B: três caminhos, de três diplomas.
{
  const e = esperadosDoGabarito('pela via judicial, nos termos do Art. 501 do CPC ou Art. 1.418 do CC, ou extrajudicial, nos termos do Art. 216-B da Lei nº 6.015/1973.');
  exigir(igual(e[0]?.opcoes.map((o) => o.chave), ['CPC:501', 'CC:1418', 'Lei 6.015:216-B']), `três alternativas: ${JSON.stringify(e)}`);
}

// 43º Exame, questão 1, item B: a linha "OU" sozinha separa duas respostas
// inteiras. Cada uma é um caminho, e vale o que a resposta mais atende.
const GABARITO_COM_LINHA_OU = 'Camila e seus demais filhos deverão propor ação de anulação do negócio jurídico em Santos, SP, por ser o foro de localização do imóvel objeto da lide, conforme o Art. 47 do CPC.\nOU\nEm São Paulo, SP, o foro do domicílio do réu, entendendo ser obrigação pessoal, conforme Art. 46 do CPC.';

exigir(caminhosDoGabarito(GABARITO_COM_LINHA_OU).length === 2, 'linha OU separa dois caminhos');
exigir(caminhosDoGabarito('Sim, ou não, conforme o art. 1 do CC.').length === 1, '"ou" no meio da frase não é linha OU');
{
  const pelo46 = compararFundamentos('Em São Paulo, domicílio do réu (art. 46 do CPC).', GABARITO_COM_LINHA_OU);
  exigir(pelo46.caminhos === 2 && pelo46.caminho === 1, `escolhe o caminho do art. 46: ${pelo46.caminho}`);
  exigir(pelo46.atendidos.length === 1 && pelo46.faltando.length === 0, 'o caminho escolhido está completo');
  exigir(pelo46.extras.length === 0, 'o artigo do caminho escolhido não é extra');

  const pelo47 = compararFundamentos('Em Santos, art. 47 do CPC.', GABARITO_COM_LINHA_OU);
  exigir(pelo47.caminho === 0 && pelo47.atendidos.length === 1, 'escolhe o caminho do art. 47');

  const nenhum = compararFundamentos('Em Santos.', GABARITO_COM_LINHA_OU);
  exigir(nenhum.caminho === 0 && nenhum.faltando.length === 1, 'sem citação: o primeiro caminho, com o que falta');
}

// Todo item de verdade traz pelo menos um fundamento com lei conhecida.
{
  const reais = [
    'Não. Tendo em vista que o bem móvel penhorado foi adquirido por Fabiano em razão de herança recebida na constância do casamento, ele estará excluído da comunhão, nos termos do Art. 1.659, inciso I, do CC.',
    'Sim. Considerando o regime da comunhão parcial de bens, o direito de adjudicação poderá ser exercido pelo cônjuge do executado, que gozará de preferência em caso de igualdade de ofertas, conforme o Art. 876, §5º ou §6º, do CPC.',
    'Sim. Na hipótese, a atriz poderá requerer que a clínica de estética seja proibida de utilizar a sua imagem, sem a sua autorização, para fins comerciais, nos termos do Art. 20 do CC ou do Art. 5º, inciso X, da CRFB/88.',
    'Em caso de citação por carta precatória (…) sendo essa data a do início da contagem do prazo (Art. 232 do CPC). Não havendo a comunicação eletrônica, (…) nos termos do Art. 231, inciso VI, do CPC.',
  ];
  const esperado = [[['CC:1659']], [['CPC:876']], [['CC:20', 'CF:5']], [['CPC:232'], ['CPC:231']]];
  reais.forEach((g, i) => {
    const obtido = esperadosDoGabarito(g).map((x) => x.opcoes.map((o) => o.chave));
    exigir(igual(obtido, esperado[i]), `gabarito real ${i + 1}: ${JSON.stringify(obtido)}`);
  });
}

// ---- Questão inteira ------------------------------------------------------

{
  const itens = [
    { letra: 'A', gabarito: GABARITO_HERANCA },
    { letra: 'B', gabarito: GABARITO_ALTERNATIVAS },
  ];
  const q = conferirQuestao(itens, { A: 'art. 1.659, I, do CC', B: '' });
  exigir(q.citados === 1 && q.esperados === 2, `totais da questão: ${q.citados} de ${q.esperados}`);
  exigir(q.porItem.B.faltando.length === 1, 'item em branco fica com o fundamento faltando');
}

// ---- Apoio da tela ----------------------------------------------------------

exigir(formatarValor(0.6) === '0,60', `valor 0.6 → ${formatarValor(0.6)}`);
exigir(formatarValor(1.25) === '1,25', 'valor 1.25');
exigir(formatarValor('0.65') === '0,65', 'valor em texto');
exigir(formatarValor(null) === null, 'sem valor');

{
  const grupos = agruparPorExame([
    { id: 3, exame: 44, numero: 1 },
    { id: 1, exame: 45, numero: 2 },
    { id: 2, exame: 45, numero: 1 },
  ]);
  exigir(igual(grupos.map((g) => g.exame), [45, 44]), 'exames do mais recente ao mais antigo');
  exigir(igual(grupos[0].questoes.map((q) => q.numero), [1, 2]), 'questões em ordem dentro do exame');
}

exigir(respostasPreenchidas({ A: '  ', B: 'x' }) === 1, 'conta só item com texto');
exigir(respostasPreenchidas(undefined) === 0, 'sem respostas');

// O rascunho só sai depois do POST se ainda for o texto enviado.
exigir(mesmoRascunho({ A: 'x' }, { A: 'x', B: '' }), 'item ausente no rascunho vale como vazio');
exigir(!mesmoRascunho({ A: 'x', B: 'novo' }, { A: 'x', B: '' }), 'edição feita depois do envio não é o mesmo rascunho');
exigir(!mesmoRascunho({ A: 'xy' }, { A: 'x' }), 'texto alterado não é o mesmo rascunho');

{
  const velha = { id: 1, criada_em: '2026-09-25T10:00:00Z' };
  const nova = { id: 2, criada_em: '2026-09-25T10:05:00Z' };
  exigir(maisRecente(velha, nova) === nova && maisRecente(nova, velha) === nova, 'mais recente pela data');
  exigir(maisRecente(null, nova) === nova && maisRecente(velha, undefined) === velha, 'uma só');
  exigir(maisRecente(null, undefined) === null, 'nenhuma');
  exigir(maisRecente({ id: 3, criada_em: 'x' }, { id: 4, criada_em: 'x' }).id === 4, 'empate: o id maior');
}

if (falhas.length > 0) {
  console.error(`\n❌ ${falhas.length} problema(s):`);
  for (const f of falhas) console.error('   - ' + f);
  process.exit(1);
}

console.log('✅ extração de citações, fundamentos esperados e conferência íntegros');
