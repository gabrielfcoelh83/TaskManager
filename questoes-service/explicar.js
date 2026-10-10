// Escreve a EXPLICAÇÃO das questões objetivas a partir do GABARITO OFICIAL,
// e só grava a que um SEGUNDO modelo conferiu e aprovou.
//
//   node explicar.js                         # prévia: gera e confere, não grava
//   node explicar.js --aplicar               # grava as aprovadas na conferência
//   node explicar.js --exame 45 --lote 3 --total 30 --aplicar
//   node explicar.js --refazer-ia --aplicar  # reescreve também as que já são 'ia'
//   node explicar.js --conferir-gravadas     # confere as 'ia' já gravadas (prévia)
//   node explicar.js --conferir-gravadas --aplicar  # e LIMPA as reprovadas
//
// O MODELO EXPLICA A RESPOSTA, NÃO A ESCOLHE
// Gabarito é fato da FGV (migrations/001_baseline.sql). O modelo recebe a
// letra oficial pronta e só justifica: por que ela está certa e por que cada
// uma das outras está errada. Ele não vê coluna nenhuma para alterar — o
// UPDATE escreve `explicacao`, `explicacao_fonte = 'ia'` e `revisada = false`,
// e mais nada.
//
// Mesmo assim o modelo pode DISCORDAR do gabarito, e é aí que mora o perigo:
// pedido para justificar uma letra que acha errada, um modelo costuma
// inventar a justificativa — e uma explicação convincente de uma resposta que
// ele não entendeu ensina pior que explicação nenhuma. Por isso ele devolve,
// junto do texto, a letra que considera correta, e o prompt diz que pode
// discordar. Letra diferente da oficial = explicação recusada, sem gravar.
// Pelo mesmo motivo, um texto que AFIRMA outra letra como correta também é
// recusado (ver `letraAfirmadaNoTexto`).
//
// CONFERÊNCIA POR UM SEGUNDO MODELO
// A letra certa não basta. Na primeira rodada do 46º Exame (Ética), 2 das 6
// explicações tinham a letra oficial, passavam em todos os filtros de texto
// e ainda assim ensinavam direito errado:
//   - 46º/1: "ao assumir a chefia da procuradoria, Danilo passa a integrar a
//     carreira do Ministério Público" (Procuradoria do Estado não é MP; o
//     fundamento é a legitimação exclusiva para a advocacia vinculada à
//     função, no Estatuto da Advocacia);
//   - 46º/4: "não há previsão de participação do advogado nos bens
//     particulares do cliente" e "a quota litis não exige contraprestação
//     exclusivamente pecuniária" (o Código de Ética diz o contrário nas duas).
// Erro de conteúdo sem número nenhum, que regex não pega. Por isso cada lote
// gerado vai a um modelo DIFERENTE do que escreveu (`PROMPT_CONFERENCIA`),
// que devolve `{id, aprovada, problemas}` por questão e é instruído a
// reprovar na dúvida. Regras:
//   - só a APROVADA é gravada; a reprovada não marca nada no banco e volta
//     na próxima rodada, com os problemas impressos no resumo;
//   - resposta da conferência fora do formato (JSON quebrado, id faltando ou
//     sobrando, `aprovada` que não seja booleano) derruba o lote inteiro —
//     nunca vira aprovação;
//   - sem um segundo modelo disponível não há conferência, e então não se
//     grava nada: melhor ficar sem explicação do que gravar sem conferir. A
//     rodada para (seguir só gastaria pedidos de geração).
// O conferente também erra, então `revisada = false` continua valendo: a
// conferência reduz o erro, não substitui a revisão humana.
//
// Um pedido de conferência POR LOTE, não por questão: a saída da conferência
// é curta (um booleano e, se houver, uma ou duas frases por questão), então o
// problema que limitou o lote de geração a 3 — resposta longa cortada no meio
// — não existe aqui. Conferir uma a uma custaria 1 + 3 = 4 pedidos por lote
// em vez de 2, e cortaria pela metade o que cabe na cota do dia. O risco do
// lote é o mesmo da geração: uma resposta quebrada derruba as 3 questões, que
// voltam na próxima rodada.
//
// ANULADAS FICAM DE FORA
// A FGV anula quando a questão tem duas respostas, nenhuma, ou erro no
// enunciado. O `gabarito` dessas linhas é o da prova antes da anulação — não
// existe resposta oficial a explicar, e explicar aquela letra seria
// justamente ensinar como certa uma resposta que a própria banca retirou. Elas
// nem entram na fila, nem no UPDATE (que repete `anulada = FALSE` para o caso
// de a anulação chegar no meio da rodada).
//
// 'humano' NUNCA É TOCADO
// Nem com --refazer-ia, nem com --conferir-gravadas. A fila exclui, e o
// UPDATE repete a condição: se uma pessoa escrever a explicação entre a
// leitura e a gravação, o texto do modelo é descartado (e o da pessoa não é
// limpo).
//
// Roda à mão, fora do serviço, pelos mesmos motivos do classificar.js.
//
// COTA: o plano gratuito da OpenRouter dá 50 pedidos/dia por chave, e a
// prévia (sem --aplicar) GASTA a cota igual ao --aplicar (ela gera e confere;
// só não grava). Cada lote custa 2 pedidos quando dá certo (1 de geração + 1
// de conferência) e até 4 + 3 = 7 quando os modelos falham em sequência
// (MAX_TENTATIVAS na geração; na conferência, os mesmos menos o gerador). Lote
// todo recusado nos filtros de texto não vai à conferência e custa 1. Teto do
// dia: 25 lotes = 75 questões se nada falhar; conte com umas 60. O resumo
// mostra os pedidos gastos. --conferir-gravadas custa 1 pedido por lote.

const { pool } = require('./app');
const { migrate } = require('./migrate');
const { modelosEmOrdem } = require('./openrouter');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Mesma lógica do classificar.js: preferência, conferida contra a listagem
// da OpenRouter antes de usar (openrouter.js); IA_MODELOS substitui.
const PREFERIDOS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.8-27b:free',
];

const LETRAS = ['A', 'B', 'C', 'D'];

// Lote padrão: 3 questões por pedido.
//
// O equilíbrio é entre a cota e o que se perde quando um lote falha. Lote
// grande economiza pedido (80 questões em lotes de 10 = 8 pedidos; em lotes de
// 3 = 27), mas cada explicação tem ~150 palavras, ~300–400 tokens de saída já
// com o escape do JSON. Dez delas passam de 3.500 tokens numa única string
// JSON, e é na saída longa que os modelos gratuitos cortam a resposta no meio
// ou esquecem uma aspa. JSON quebrado derruba o lote INTEIRO — e o pedido já
// foi cobrado da cota. Com 3, uma resposta ruim custa um pedido e três
// questões, que voltam na próxima rodada; a saída cabe com folga em
// MAX_TOKENS.
const LOTE_PADRAO = 3;

// 30 questões = 10 lotes = 20 pedidos no caso bom (geração + conferência).
// Mantido em 30, e não dobrado: deixa ~30 pedidos do dia para os modelos que
// falham (cada falha custa mais um) e para uma segunda rodada que pegue as
// reprovadas. Com a cota inteira livre, --total 60 cabe no caso bom (40).
const TOTAL_PADRAO = 30;

const MAX_TOKENS = 4096;
// A conferência devolve booleano + frases curtas por questão; 1500 sobra.
const MAX_TOKENS_CONFERENCIA = 1500;

// Explicação sem resposta em 90s é modelo travado; o pedido seguinte vai para
// o próximo modelo da lista em vez de prender a rodada.
const TIMEOUT_MS = 90 * 1000;

// Validação do texto. O alvo do prompt é 120–200 palavras; a faixa aceita é
// mais larga para não recusar uma explicação boa por 10 palavras, mas fecha
// os dois defeitos reais: resposta vazia/"Ver gabarito" (curta demais) e
// texto que desandou, repetindo-se até o teto de tokens (longo demais).
const MIN_PALAVRAS = 50;
const MAX_PALAVRAS = 400;
const MAX_CARACTERES = 3500;

// SEM NÚMERO DE DISPOSITIVO
// A primeira versão do prompt pedia "cite o dispositivo QUANDO TIVER CERTEZA".
// Rodada em 42 questões reais do 45º Exame, das 9 conferidas à mão 4 tinham
// erro jurídico — e 3 desses 4 estavam justamente na citação numerada, que o
// modelo escreveu com toda a "certeza":
//   - "Súmula 37 do STJ admite cumular dano estético e moral" (é a 387);
//   - "Lei 9.514/97, que regula a alienação fiduciária de bens móveis" (ela é
//     de imóveis; a de veículos é o DL 911/69);
//   - "art. 112 do ECA" como base da procuração oral (o 112 é o das medidas
//     socioeducativas).
// Modelo gratuito não sabe quando sabe um número, e número errado é o pior
// erro possível numa explicação de cursinho: o aluno decora. Então o número
// está PROIBIDO — o modelo nomeia o diploma ou o tribunal e explica a regra —
// e a proibição é conferida no texto (`citacaoNumerada`), não só pedida.
// (O 4º erro foi de conteúdo — renovatória: disse que o terceiro precisa
// explorar o mesmo ramo, quando a lei diz que NÃO pode. Esse nenhum filtro
// pega; é para isso que existe `revisada = false`.)
const PROMPT_SISTEMA = `Você é professor de cursinho preparatório para o Exame de Ordem da OAB.
Sua tarefa é EXPLICAR o gabarito oficial da FGV de questões objetivas.

Para cada questão você recebe o enunciado, as alternativas A, B, C e D e a
letra correta segundo o gabarito oficial. Escreva uma explicação que:
- diga por que a alternativa correta está certa;
- diga, uma a uma, por que cada uma das outras três está errada;
- explique a regra jurídica que fundamenta a resposta, com suas palavras.

É PROIBIDO ESCREVER QUALQUER NÚMERO DE DISPOSITIVO OU DE PRECEDENTE, mesmo
que você tenha certeza dele: nenhum número de artigo, parágrafo, inciso,
alínea, súmula (inclusive vinculante), lei, lei complementar, decreto,
decreto-lei, medida provisória, tema ou tese, enunciado, nem de julgado
(REsp, RE, HC, ADI, ADPF etc.). Não use o símbolo §.
Nomeie o diploma ou o tribunal SEM número: "o Código Civil", "a Lei do
Inquilinato", "o Estatuto da Advocacia", "o ECA", "a LINDB", "a Constituição",
"a jurisprudência do STJ", "súmula do STF". Exemplo: em vez de "conforme o
art. 1.228 do CC", escreva "o Código Civil assegura ao proprietário...".
Explicação com número de dispositivo é descartada automaticamente.
Prazos, valores, idades e quantidades continuam permitidos ("prazo de 15
dias", "maior de 18 anos").

Estilo: português do Brasil, tom de professor de cursinho, direto e
didático. Entre 120 e 200 palavras por questão. Texto corrido, sem
markdown (sem **, sem #, sem listas, sem blocos de código).

Se, depois de analisar, você concluir que a alternativa correta NÃO é a do
gabarito oficial, não tente justificar a letra oficial: devolva em "correta"
a letra que você considera certa e "explicacao": null. Isso é aceitável e
preferível a uma justificativa forçada.

Responda APENAS com JSON válido, sem markdown e sem comentários.`;

function montarPrompt(questoes) {
  const itens = questoes.map((q) => ({
    id: q.id,
    ...(q.disciplina ? { disciplina: q.disciplina } : {}),
    ...(q.tema ? { tema: q.tema } : {}),
    // Enunciado inteiro, ao contrário do classificar.js: lá o começo bastava
    // para achar a matéria; aqui o detalhe do caso é o que decide a resposta.
    enunciado: String(q.enunciado),
    alternativas: Object.fromEntries(
      q.alternativas.map((texto, i) => [LETRAS[i], String(texto)])
    ),
    gabarito_oficial: LETRAS[q.gabarito],
  }));

  return `Explique o gabarito oficial destas ${questoes.length} questões.

${JSON.stringify(itens, null, 2)}

Responda com uma lista JSON, um objeto por questão, no formato:
[{"id": 123, "correta": "C", "explicacao": "A alternativa C está correta porque..."}]`;
}

// Procura no texto uma afirmação explícita de qual alternativa é a correta
// ("a alternativa correta é a B", "resposta correta: letra D"). A letra é
// maiúscula de propósito: com caixa livre, "a correta é a afirmação" leria o
// artigo "a" como alternativa A.
const AFIRMA_CORRETA =
  /(?:[Rr]esposta|[Aa]lternativa|[Ll]etra|[Gg]abarito)\s+(?:correta|certa)\s*(?:é|e|:)?\s*(?:a\s+)?(?:letra\s+|alternativa\s+)?\(?([A-D])\b/g;

function letraAfirmadaNoTexto(texto) {
  const letras = new Set();
  for (const m of texto.matchAll(AFIRMA_CORRETA)) letras.add(m[1]);
  return [...letras];
}

// CITAÇÃO NUMERADA (ver "SEM NÚMERO DE DISPOSITIVO", acima do prompt).
//
// Critério: recusa um NÚMERO preso a uma palavra que designa dispositivo,
// norma ou julgado. Número solto não é citação e passa: "prazo de 15 dias",
// "80 questões", "2 anos", "R$ 10.000", "1º grau", "Constituição de 1988",
// "Código Civil de 2002". Ano só é recusado quando faz parte do número de uma
// norma ("Lei 9.514/97", "8.245/1991"). Siglas de diploma com ano — "CF/88",
// "CPC/2015", "CC/2002" — nomeiam o diploma, não um dispositivo, e passam.
//
// Decisões de fronteira:
//  - "§" é recusado sempre, com ou sem número: o símbolo só existe em citação.
//  - "parágrafo único" escrito por extenso passa: sem o número do artigo não
//    aponta dispositivo nenhum. "parágrafo 2º" é recusado.
//  - ordinais por extenso ("artigo quinto") NÃO são pegos: "o artigo segundo
//    o qual..." daria falso positivo, e modelo não costuma escrever assim.
//  - "tema", "tese" e "enunciado" + número são recusados mesmo fora de
//    citação ("no tema 2 vezes" cairia): frase rara, e "Tema 1.046" é como
//    se cita repercussão geral. Errar para o lado da recusa custa só um
//    pedido; errar para o lado da aceitação grava citação inventada.
//
// Fronteira de palavra por lookaround Unicode (\p{L}), não \b: \b é ASCII e
// trata "í" de "alínea" como separador.
// "nº", "n°", "n.", "no." (com ponto: "no" sozinho é preposição — "o
// enunciado no 2º parágrafo" não é citação) + 5 · 1.228 · 9.514/97 · 5º
const NUM = String.raw`(?:n\s*(?:[º°]\.?|o\.|\.)\s*)?\d+(?:\.\d+)*(?:\/\d{2,4})?[º°ª]?`;
const ANTES = String.raw`(?<!\p{L})`;
const DEPOIS = String.raw`(?!\p{L})`;

const CITACOES_NUMERADAS = [
  // art. 5º · art 112 · arts. 1.228 · artigo 37
  new RegExp(String.raw`${ANTES}(?:arts?\.?|artigos?)\s*${NUM}`, 'iu'),
  // qualquer §
  /§+\s*[\d\wº°]*/u,
  // parágrafo 2º · parágrafos 1º e 2º (mas não "parágrafo único")
  new RegExp(String.raw`${ANTES}par[aá]grafos?\s*${NUM}`, 'iu'),
  // inciso IV · inciso 3 · incisos II e III
  new RegExp(String.raw`${ANTES}incisos?\s+(?:[ivxlcdm]+${DEPOIS}|\d+)`, 'iu'),
  // alínea "a" · alínea b · alíneas a e b
  new RegExp(String.raw`${ANTES}al[ií]neas?\s*["“'‘(]?[a-z]["”'’)]?${DEPOIS}`, 'iu'),
  // Súmula 387 · Súmula Vinculante 13 · súmulas nº 7 · SV 13
  new RegExp(String.raw`${ANTES}s[uú]mulas?\s+(?:vinculantes?\s+)?${NUM}`, 'iu'),
  new RegExp(String.raw`${ANTES}SV\s*${NUM}`, 'u'),
  // Lei 9.514/97 · Lei nº 8.245/1991 · Lei Complementar 123 · Decreto-Lei 911 ·
  // DL 911/69 · MP 2.200 · LC 123 · Medida Provisória 1.000 · EC 45
  new RegExp(
    String.raw`${ANTES}(?:leis?(?:\s+(?:complementar|ordin[aá]ria|delegada|federal|estadual|municipal))?` +
      String.raw`|decretos?(?:[\s-]+leis?)?|DL|MP|LC|EC|medidas?\s+provis[oó]rias?` +
      String.raw`|emendas?\s+constitucion(?:al|ais))\s*${NUM}`,
    'iu'
  ),
  // Tema 1.046 · Tese 5 · Enunciado 22 (das Jornadas, do FONAJE...)
  new RegExp(String.raw`${ANTES}(?:temas?|teses?|enunciados?)\s+${NUM}`, 'iu'),
  // Julgados. Sensível à caixa: "re", "ms", "ai" minúsculos são palavras.
  new RegExp(
    String.raw`${ANTES}(?:E?A?REsp|AgRg|AgInt|EDcl|A?RE|AI|R?HC|R?MS|ADIn?|ADPF|ADC|ADO|Rcl)[\s-]*${NUM}`,
    'u'
  ),
  // número de norma sem a palavra: "(8.245/91)", "9.514/1997"
  /(?<![\d.])\d{1,2}\.\d{3}\/(?:\d{4}|\d{2})(?!\d)/u,
  // "nº 123" sozinho
  new RegExp(String.raw`${ANTES}n[º°]\s*\.?\s*\d+(?:\.\d+)*`, 'iu'),
];

// O trecho da primeira citação numerada do texto, ou null.
function citacaoNumerada(texto) {
  for (const re of CITACOES_NUMERADAS) {
    const m = re.exec(texto);
    if (m) return m[0].trim();
  }
  return null;
}

// Motivo da recusa do texto, ou null se passa.
function problemaNoTexto(texto, letraOficial) {
  if (texto.includes('```')) return 'texto com cerca de markdown';
  if (texto.length > MAX_CARACTERES) return `texto longo demais (${texto.length} caracteres)`;
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  if (palavras < MIN_PALAVRAS) return `texto curto demais (${palavras} palavras)`;
  if (palavras > MAX_PALAVRAS) return `texto longo demais (${palavras} palavras)`;
  const citacao = citacaoNumerada(texto);
  if (citacao) return `cita dispositivo numerado: ${citacao}`;
  const outras = letraAfirmadaNoTexto(texto).filter((l) => l !== letraOficial);
  if (outras.length > 0) return `texto afirma outra alternativa como correta (${outras.join(', ')})`;
  return null;
}

// Separada da rede: é o que decide o que entra no banco.
function interpretarResposta(texto, questoes) {
  const porId = new Map(questoes.map((q) => [q.id, q]));

  const limpo = String(texto || '').trim();
  // Do primeiro '[' ao último ']': ignora cerca ```json em volta da resposta
  // e um eventual envelope {"questoes": [...]}. Não se apaga ``` no meio do
  // texto — se houver cerca DENTRO de uma explicação, ela deve ser recusada,
  // não limpa em silêncio.
  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('resposta do modelo não contém lista JSON');
  }

  const bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  if (!Array.isArray(bruto)) throw new Error('resposta do modelo não é uma lista');

  const aceitas = [];
  const recusadas = [];
  const vistas = new Set();

  for (const item of bruto) {
    const id = Number(item?.id);
    const q = porId.get(id);

    if (!q) {
      recusadas.push({ id: item?.id, motivo: 'id fora do lote' });
      continue;
    }
    // Duas respostas para a mesma questão: não há como saber qual vale.
    if (vistas.has(id)) {
      recusadas.push({ id, motivo: 'id repetido na resposta' });
      const i = aceitas.findIndex((a) => a.id === id);
      if (i !== -1) aceitas.splice(i, 1);
      continue;
    }
    vistas.add(id);

    const oficial = LETRAS[q.gabarito];
    const letra = String(item.correta ?? '').trim().toUpperCase().replace(/[^A-D]/g, '');

    // A GUARDA ANTI-ALUCINAÇÃO. Sem letra, ou com letra diferente da
    // oficial, o modelo não demonstrou que concorda com o gabarito — e não
    // explica o que não aceita.
    if (letra.length !== 1) {
      recusadas.push({ id, motivo: `modelo não informou a letra correta (${JSON.stringify(item.correta ?? null)})` });
      continue;
    }
    if (letra !== oficial) {
      recusadas.push({ id, motivo: `modelo discorda do gabarito (disse ${letra}, oficial ${oficial})` });
      continue;
    }

    if (typeof item.explicacao !== 'string' || !item.explicacao.trim()) {
      recusadas.push({ id, motivo: 'explicação vazia' });
      continue;
    }

    const explicacao = item.explicacao.trim();
    const problema = problemaNoTexto(explicacao, oficial);
    if (problema) {
      recusadas.push({ id, motivo: problema });
      continue;
    }

    aceitas.push({ id, explicacao });
  }

  // Questão do lote sem resposta nenhuma: entra no resumo, senão some sem
  // rastro e parece que o modelo explicou tudo.
  for (const q of questoes) {
    if (!vistas.has(q.id)) recusadas.push({ id: q.id, motivo: 'modelo não respondeu esta questão' });
  }

  return { aceitas, recusadas };
}

// CONFERÊNCIA (ver "CONFERÊNCIA POR UM SEGUNDO MODELO", no topo).
//
// O exemplo de problema do prompt é de propósito genérico (prazo de recurso),
// e não um dos dois erros reais: citar o caso real no prompt ensinaria o
// conferente a procurar AQUELE erro, não a conferir.
const PROMPT_CONFERENCIA = `Você é revisor jurídico de um cursinho preparatório para o Exame de Ordem
da OAB. Outro professor escreveu explicações para o gabarito oficial da FGV
de questões objetivas. Sua tarefa é CONFERIR cada explicação, não reescrevê-la.

Para cada questão você recebe o enunciado, as alternativas A, B, C e D, a
letra correta segundo o gabarito oficial (é fato, não está em discussão) e a
explicação escrita.

REPROVE a explicação se encontrar QUALQUER um destes defeitos:
1. afirmação jurídica falsa: instituto, órgão, carreira, lei, regra,
   requisito, prazo, competência ou consequência descritos de forma errada —
   mesmo que a letra final esteja certa, e mesmo que o erro esteja num
   detalhe ou na justificativa de uma das alternativas erradas;
2. contradição com a letra oficial: o texto afirma ou dá a entender que outra
   alternativa é a correta, ou que a oficial está errada;
3. justificativa genérica: não explica, especificamente, por que CADA UMA das
   três alternativas erradas está errada (frases como "as demais confundem os
   institutos" não bastam);
4. citação inventada ou que você não consegue confirmar: dispositivo, súmula,
   julgado, tese ou doutrina.

Na dúvida, REPROVE. Uma explicação reprovada é refeita depois; uma explicação
errada aprovada ensina errado a quem estuda. Não reprove por estilo, tamanho
ou por faltar número de artigo: as explicações são proibidas de citar número
de dispositivo de propósito. Se você concluir que o próprio gabarito oficial
está errado, reprove e diga isso em "problemas".

Em "problemas", uma frase curta e específica por defeito: o que o texto
afirma e o que é o correto. Exemplo: "Diz que o prazo da apelação é de 10
dias; no processo civil são 15." Explicação aprovada tem "problemas": [].

Responda APENAS com JSON válido, sem markdown e sem comentários.`;

// `explicadas`: [{id, explicacao}]; `questoes`: as linhas do lote.
function montarPromptConferencia(explicadas, questoes) {
  const porId = new Map(questoes.map((q) => [q.id, q]));
  const itens = explicadas.map(({ id, explicacao }) => {
    const q = porId.get(id);
    return {
      id,
      ...(q.disciplina ? { disciplina: q.disciplina } : {}),
      ...(q.tema ? { tema: q.tema } : {}),
      enunciado: String(q.enunciado),
      alternativas: Object.fromEntries(q.alternativas.map((texto, i) => [LETRAS[i], String(texto)])),
      gabarito_oficial: LETRAS[q.gabarito],
      explicacao,
    };
  });

  return `Confira as explicações destas ${itens.length} questões.

${JSON.stringify(itens, null, 2)}

Responda com uma lista JSON, exatamente um objeto por questão, no formato:
[{"id": 123, "aprovada": false, "problemas": ["Diz que ...; o correto é ..."]}, {"id": 124, "aprovada": true, "problemas": []}]`;
}

// Lê o veredito da conferência. ESTRITA de propósito: qualquer coisa fora do
// formato LANÇA, e o lote inteiro volta na próxima rodada — uma resposta que
// não se consegue ler nunca pode virar aprovação. Lança se: não há lista
// JSON; um item não é objeto; `aprovada` não é booleano de verdade ("true"
// em string não serve); `problemas` não é lista de strings; um id é
// repetido, não foi enviado, ou falta.
//
// Devolve Map id -> { aprovada, problemas }. `aprovada: true` com problemas
// apontados é contraditório e conta como REPROVADA (na dúvida, reprovar);
// reprovada sem problema nenhum ganha um texto para o resumo não ficar mudo.
function interpretarConferencia(texto, ids) {
  const limpo = String(texto || '').trim();
  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('conferência sem lista JSON');
  }

  let bruto;
  try {
    bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  } catch (err) {
    throw new Error(`conferência com JSON inválido (${err.message})`);
  }
  if (!Array.isArray(bruto)) throw new Error('conferência não é uma lista');

  const esperados = new Set(ids.map(Number));
  const vereditos = new Map();

  for (const item of bruto) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('conferência com item que não é objeto');
    }
    const id = Number(item.id);
    if (!esperados.has(id)) throw new Error(`conferência com id fora do lote (${JSON.stringify(item.id)})`);
    if (vereditos.has(id)) throw new Error(`conferência com id repetido (${id})`);
    if (typeof item.aprovada !== 'boolean') {
      throw new Error(`conferência sem "aprovada" booleano no id ${id} (${JSON.stringify(item.aprovada ?? null)})`);
    }
    const problemas = item.problemas ?? [];
    if (!Array.isArray(problemas) || problemas.some((p) => typeof p !== 'string')) {
      throw new Error(`conferência com "problemas" que não é lista de textos no id ${id}`);
    }
    const apontados = problemas.map((p) => p.trim()).filter(Boolean);

    if (item.aprovada && apontados.length > 0) {
      vereditos.set(id, {
        aprovada: false,
        problemas: [...apontados, '(conferente marcou aprovada, mas apontou problemas: tratada como reprovada)'],
      });
    } else if (!item.aprovada && apontados.length === 0) {
      vereditos.set(id, { aprovada: false, problemas: ['(conferente reprovou sem dizer por quê)'] });
    } else {
      vereditos.set(id, { aprovada: item.aprovada, problemas: apontados });
    }
  }

  const faltando = [...esperados].filter((id) => !vereditos.has(id));
  if (faltando.length > 0) throw new Error(`conferência não avaliou: ${faltando.join(', ')}`);

  return vereditos;
}

// Um pedido à OpenRouter, caindo para o próximo modelo da lista em erro.
// Devolve { conteudo, modelo, tentativas }; o erro também leva `tentativas`
// (é o custo em pedidos, mostrado no resumo).
//
// `excluir`: modelos que NÃO podem responder — a conferência passa o
// gerador. Se a exclusão esvaziar a lista, o erro sai com
// `semConferente = true`, e quem chamou não grava.
async function chamarOpenRouter(
  prompt,
  {
    chave,
    modelos,
    excluir = [],
    sistema = PROMPT_SISTEMA,
    temperatura = 0.2,
    maxTokens = MAX_TOKENS,
    titulo = 'MA Questoes - explicacao',
  } = {}
) {
  if (!chave) throw new Error('OPENROUTER_API_KEY não definida');

  const todos = modelos || (await modelosEmOrdem(PREFERIDOS));
  if (todos.length === 0) throw new Error('a OpenRouter não lista nenhum modelo gratuito');
  const ordem = todos.filter((m) => !excluir.includes(m));
  if (ordem.length === 0) {
    const erro = new Error(`nenhum modelo disponível além de ${excluir.join(', ')} para conferir`);
    erro.semConferente = true;
    erro.tentativas = 0;
    throw erro;
  }

  let ultimoErro = null;
  let todos429 = true;
  let tentativas = 0;

  for (const modelo of ordem) {
    tentativas++;
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          'X-Title': titulo,
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: prompt },
          ],
          // Geração: baixa, não zero — texto corrido sai menos robótico com
          // um pouco de variação, e o que importa (a letra) é conferido de
          // qualquer jeito. Conferência: zero (ver chamarConferencia).
          temperature: temperatura,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.status !== 429) todos429 = false;
      if (!res.ok) {
        ultimoErro = new Error(`${modelo}: HTTP ${res.status}`);
        continue;
      }

      const dados = await res.json();
      const conteudo = dados?.choices?.[0]?.message?.content;
      if (!conteudo) {
        ultimoErro = new Error(`${modelo}: resposta sem conteúdo`);
        continue;
      }

      return { conteudo, modelo, tentativas };
    } catch (err) {
      todos429 = false;
      ultimoErro = err;
    }
  }

  const erro = ultimoErro || new Error('nenhum modelo respondeu');
  // Todos os modelos em 429 é, quase sempre, a cota diária da CHAVE — não de
  // um modelo. Seguir para o próximo lote só gastaria mais 4 pedidos negados.
  if (todos429) erro.cotaEsgotada = true;
  erro.tentativas = tentativas;
  throw erro;
}

// A conferência: mesma lista de modelos gratuitos (conferida contra
// /api/v1/models), menos os de `excluir`. Temperatura zero: é um veredito,
// não um texto.
function chamarConferencia(prompt, { chave, modelos, excluir = [] } = {}) {
  return chamarOpenRouter(prompt, {
    chave,
    modelos,
    excluir,
    sistema: PROMPT_CONFERENCIA,
    temperatura: 0,
    maxTokens: MAX_TOKENS_CONFERENCIA,
    titulo: 'MA Questoes - conferencia',
  });
}

async function buscarPendentes(cliente, { exame, limite, refazerIa, ignorar = [] }) {
  const valores = [];

  // Anuladas e 'humano' ficam de fora em qualquer modo. A fila normal é
  // "sem explicação" (string em branco conta como sem); --refazer-ia soma as
  // escritas por modelo e ainda não revisadas — uma 'ia' com revisada = true
  // foi conferida por alguém, e reescrevê-la jogaria fora essa conferência.
  const vazia = `(explicacao IS NULL OR btrim(explicacao) = '')`;
  const condicoes = [
    'anulada = FALSE',
    `explicacao_fonte IS DISTINCT FROM 'humano'`,
    refazerIa ? `(${vazia} OR (explicacao_fonte = 'ia' AND revisada = FALSE))` : vazia,
  ];

  if (exame != null) {
    valores.push(exame);
    condicoes.push(`exame = $${valores.length}`);
  }

  // Já tentadas nesta rodada saem da busca — como no classificar.js, é o
  // que impede um lote recusado (que continua pendente) de voltar em laço.
  if (ignorar.length > 0) {
    valores.push(ignorar);
    condicoes.push(`id <> ALL($${valores.length}::bigint[])`);
  }

  valores.push(limite);

  const { rows } = await cliente.query(
    `SELECT id, exame, numero, enunciado, alternativas, gabarito, disciplina, tema
       FROM questoes
      WHERE ${condicoes.join(' AND ')}
      ORDER BY exame DESC, tipo_prova ASC, numero ASC
      LIMIT $${valores.length}`,
    valores
  );

  // id: BIGSERIAL chega como string do `pg` (ver classificar.js).
  return rows.map((r) => ({ ...r, id: Number(r.id), gabarito: Number(r.gabarito) }));
}

async function gravar(cliente, aceitas, pendentes, { refazerIa }) {
  const porId = new Map(pendentes.map((q) => [q.id, q]));
  let gravadas = 0;

  for (const item of aceitas) {
    const q = porId.get(item.id);

    // O WHERE repete a leitura, porque entre ela e esta escrita a linha pode
    // ter mudado:
    //  - uma pessoa escreveu a explicação  → fonte 'humano', não sobrescreve;
    //  - outra rodada gravou primeiro      → já não está vazia (modo normal);
    //  - a FGV anulou ou trocou o gabarito → o texto explica uma resposta
    //    que não é mais a oficial, então é descartado.
    // Nos três casos rowCount = 0 e a questão, se ainda pendente, volta na
    // próxima rodada.
    const { rowCount } = await cliente.query(
      `UPDATE questoes
          SET explicacao       = $2,
              explicacao_fonte = 'ia',
              revisada         = FALSE,
              atualizada_em    = NOW()
        WHERE id = $1
          AND anulada = FALSE
          AND gabarito = $3
          AND explicacao_fonte IS DISTINCT FROM 'humano'
          AND ${
            refazerIa
              ? `((explicacao IS NULL OR btrim(explicacao) = '') OR (explicacao_fonte = 'ia' AND revisada = FALSE))`
              : `(explicacao IS NULL OR btrim(explicacao) = '')`
          }`,
      [item.id, item.explicacao, q.gabarito]
    );
    gravadas += rowCount;
  }

  return gravadas;
}

// Explicações 'ia' já gravadas e ainda não revisadas por pessoa — a fila do
// --conferir-gravadas. 'ia' revisada = true foi conferida por alguém e fica
// de fora, como no --refazer-ia; 'humano' nunca entra.
async function buscarGravadas(cliente, { exame, limite, ignorar = [] }) {
  const valores = [];
  const condicoes = [
    'anulada = FALSE',
    `explicacao_fonte = 'ia'`,
    'revisada = FALSE',
    `explicacao IS NOT NULL AND btrim(explicacao) <> ''`,
  ];
  if (exame != null) {
    valores.push(exame);
    condicoes.push(`exame = $${valores.length}`);
  }
  if (ignorar.length > 0) {
    valores.push(ignorar);
    condicoes.push(`id <> ALL($${valores.length}::bigint[])`);
  }
  valores.push(limite);

  const { rows } = await cliente.query(
    `SELECT id, exame, numero, enunciado, alternativas, gabarito, disciplina, tema, explicacao
       FROM questoes
      WHERE ${condicoes.join(' AND ')}
      ORDER BY exame DESC, tipo_prova ASC, numero ASC
      LIMIT $${valores.length}`,
    valores
  );
  return rows.map((r) => ({ ...r, id: Number(r.id), gabarito: Number(r.gabarito) }));
}

// Devolve à fila (explicacao e fonte = NULL) as 'ia' reprovadas. O WHERE
// exige o MESMO texto que foi conferido: se alguém o editou, revisou ou
// trocou por um humano no meio, nada é apagado.
async function limparReprovadas(cliente, reprovadas) {
  let limpas = 0;
  for (const { id, explicacao } of reprovadas) {
    const { rowCount } = await cliente.query(
      `UPDATE questoes
          SET explicacao       = NULL,
              explicacao_fonte = NULL,
              revisada         = FALSE,
              atualizada_em    = NOW()
        WHERE id = $1
          AND explicacao_fonte = 'ia'
          AND revisada = FALSE
          AND explicacao = $2`,
      [id, explicacao]
    );
    limpas += rowCount;
  }
  return limpas;
}

function novoResumo() {
  return {
    lidas: 0,
    geradas: 0, // passaram nos filtros de texto (letra, tamanho, citação)
    aprovadas: 0, // e na conferência
    reprovadas: [], // { id, exame, numero, problemas } — reprovadas na conferência
    gravadas: 0,
    limpas: 0, // --conferir-gravadas --aplicar
    recusadas: [], // filtros de texto
    semConferente: 0,
    lotesComErro: 0,
    errosDeLote: [],
    modelos: [],
    modelosConferencia: [],
    pedidos: 0,
    interrompida: null,
  };
}

const anotarModelo = (lista, modelo) => {
  if (modelo && !lista.includes(modelo)) lista.push(modelo);
};

function registrarErroDeLote(resumo, ids, err, log) {
  log(`  ⚠️  lote [${ids.join(', ')}] falhou (${err.message}) — volta na próxima rodada`);
  resumo.lotesComErro++;
  resumo.errosDeLote.push({ ids, motivo: err.message });
  if (err.cotaEsgotada) {
    resumo.interrompida = 'todos os modelos devolveram 429 (cota da chave provavelmente esgotada)';
  }
}

// Confere `explicadas` ([{id, explicacao}]) e devolve o Map de vereditos.
// Lança nos mesmos casos de interpretarConferencia, e também quando o
// conferente acaba sendo o próprio gerador (defesa contra um `conferirModelo`
// que ignore `excluir`).
async function conferir(conferirModelo, explicadas, questoes, { gerador, resumo }) {
  const excluir = gerador ? [gerador] : [];
  let r;
  try {
    r = await conferirModelo(montarPromptConferencia(explicadas, questoes), { excluir });
  } catch (err) {
    resumo.pedidos += err.tentativas ?? 1;
    throw err;
  }
  resumo.pedidos += r.tentativas ?? 1;
  anotarModelo(resumo.modelosConferencia, r.modelo);
  if (gerador && (!r.modelo || r.modelo === gerador)) {
    throw new Error(`conferência feita pelo próprio gerador (${r.modelo || 'modelo não informado'})`);
  }
  return interpretarConferencia(r.conteudo, explicadas.map((e) => e.id));
}

const rotulo = (q) => `${q.exame}º/${q.numero} (id ${q.id}) · gabarito ${LETRAS[q.gabarito]}`;

// `chamarModelo(prompt)` gera; `conferirModelo(prompt, { excluir })` confere.
// Os dois são injetáveis para o teste rodar sem rede, e devolvem
// { conteudo, modelo, tentativas? }. Sem `conferirModelo` a função se
// recusa a rodar: não existe caminho que grave sem conferir.
async function explicar({
  exame = null,
  lote = LOTE_PADRAO,
  total = TOTAL_PADRAO,
  aplicar = false,
  refazerIa = false,
  chamarModelo,
  conferirModelo,
  log = console.log,
} = {}) {
  if (typeof conferirModelo !== 'function') {
    throw new Error('explicar() sem conferirModelo: nada é gravado sem conferência');
  }

  const cliente = await pool.connect();
  const resumo = novoResumo();

  try {
    let restantes = total;
    const jaTentadas = [];

    while (restantes > 0) {
      const pendentes = await buscarPendentes(cliente, {
        exame,
        limite: Math.min(lote, restantes),
        refazerIa,
        ignorar: jaTentadas,
      });

      if (pendentes.length === 0) break;
      resumo.lidas += pendentes.length;
      jaTentadas.push(...pendentes.map((p) => p.id));
      restantes -= pendentes.length;
      const ids = pendentes.map((p) => p.id);

      // 1. GERAÇÃO
      let interpretada;
      let gerador;
      try {
        let r;
        try {
          r = await chamarModelo(montarPrompt(pendentes));
        } catch (err) {
          resumo.pedidos += err.tentativas ?? 1;
          throw err;
        }
        resumo.pedidos += r.tentativas ?? 1;
        gerador = r.modelo;
        anotarModelo(resumo.modelos, gerador);
        // Sem saber quem escreveu, não há como garantir que outro confira.
        if (!gerador) throw new Error('a geração não informou o modelo');
        interpretada = interpretarResposta(r.conteudo, pendentes);
      } catch (err) {
        // Lote que falha (rede, JSON quebrado) não derruba a rodada: as
        // questões continuam pendentes e voltam na próxima execução.
        registrarErroDeLote(resumo, ids, err, log);
        if (resumo.interrompida) break;
        continue;
      }

      resumo.geradas += interpretada.aceitas.length;
      resumo.recusadas.push(...interpretada.recusadas);
      for (const rec of interpretada.recusadas) log(`  ✗ recusada ${rec.id}: ${rec.motivo}`);

      // Tudo recusado nos filtros de texto: nada a conferir, e não se gasta
      // o pedido.
      if (interpretada.aceitas.length === 0) continue;

      // 2. CONFERÊNCIA
      let vereditos;
      try {
        vereditos = await conferir(conferirModelo, interpretada.aceitas, pendentes, { gerador, resumo });
      } catch (err) {
        if (err.semConferente) {
          resumo.semConferente += interpretada.aceitas.length;
          resumo.interrompida = `sem segundo modelo para conferir (${err.message}); nada foi gravado sem conferência`;
          log(`  ⛔ ${resumo.interrompida}`);
          break;
        }
        registrarErroDeLote(resumo, ids, err, log);
        if (resumo.interrompida) break;
        continue;
      }

      // O texto vai inteiro para a tela, com o veredito: é para ler antes
      // de confiar.
      const aprovadas = [];
      for (const item of interpretada.aceitas) {
        const q = pendentes.find((p) => p.id === item.id);
        const v = vereditos.get(item.id);
        log(`\n  ${rotulo(q)} · ${v.aprovada ? 'APROVADA' : 'REPROVADA'} na conferência`);
        log(`  ${item.explicacao}`);
        if (v.aprovada) {
          aprovadas.push(item);
        } else {
          for (const p of v.problemas) log(`    - ${p}`);
          resumo.reprovadas.push({ id: q.id, exame: q.exame, numero: q.numero, problemas: v.problemas });
        }
      }
      resumo.aprovadas += aprovadas.length;

      // 3. GRAVAÇÃO — só as aprovadas. Reprovada não marca nada no banco:
      // continua pendente e volta na próxima rodada.
      if (aplicar && aprovadas.length > 0) {
        resumo.gravadas += await gravar(cliente, aprovadas, pendentes, { refazerIa });
      }
    }
  } finally {
    cliente.release();
  }

  return resumo;
}

// --conferir-gravadas: confere as 'ia' não revisadas que JÁ estão no banco,
// sem gerar nada. Com `aplicar`, as reprovadas são limpas e voltam à fila
// normal; as aprovadas ficam como estão (sem marca nenhuma — `revisada`
// continua sendo só para pessoa). O banco não guarda qual modelo escreveu
// cada uma, então o conferente é o primeiro disponível da lista — para não
// ter o autor conferindo a si mesmo, rode com IA_MODELOS sem o gerador.
async function conferirGravadas({
  exame = null,
  lote = LOTE_PADRAO,
  total = TOTAL_PADRAO,
  aplicar = false,
  conferirModelo,
  log = console.log,
} = {}) {
  if (typeof conferirModelo !== 'function') throw new Error('conferirGravadas() sem conferirModelo');

  const cliente = await pool.connect();
  const resumo = novoResumo();

  try {
    let restantes = total;
    const jaTentadas = [];

    while (restantes > 0) {
      const gravadas = await buscarGravadas(cliente, {
        exame,
        limite: Math.min(lote, restantes),
        ignorar: jaTentadas,
      });
      if (gravadas.length === 0) break;
      resumo.lidas += gravadas.length;
      jaTentadas.push(...gravadas.map((q) => q.id));
      restantes -= gravadas.length;

      const explicadas = gravadas.map((q) => ({ id: q.id, explicacao: q.explicacao }));
      let vereditos;
      try {
        vereditos = await conferir(conferirModelo, explicadas, gravadas, { gerador: null, resumo });
      } catch (err) {
        registrarErroDeLote(resumo, gravadas.map((q) => q.id), err, log);
        if (resumo.interrompida) break;
        continue;
      }

      const reprovadas = [];
      for (const q of gravadas) {
        const v = vereditos.get(q.id);
        log(`\n  ${rotulo(q)} · ${v.aprovada ? 'APROVADA' : 'REPROVADA'} na conferência`);
        if (v.aprovada) {
          resumo.aprovadas++;
        } else {
          log(`  ${q.explicacao}`);
          for (const p of v.problemas) log(`    - ${p}`);
          resumo.reprovadas.push({ id: q.id, exame: q.exame, numero: q.numero, problemas: v.problemas });
          reprovadas.push(q);
        }
      }

      if (aplicar && reprovadas.length > 0) {
        resumo.limpas += await limparReprovadas(cliente, reprovadas);
      }
    }
  } finally {
    cliente.release();
  }

  return resumo;
}

function imprimirResumo(r, { aplicar, modo }) {
  console.log('');
  if (modo === 'conferir-gravadas') {
    console.log(
      `${r.lidas} conferida(s): ${r.aprovadas} aprovada(s), ${r.reprovadas.length} reprovada(s)` +
        (aplicar ? `, ${r.limpas} limpa(s) e de volta à fila` : ' (prévia: nada foi limpo)')
    );
  } else {
    console.log(
      `${r.lidas} lida(s) · ${r.geradas} gerada(s) · ${r.aprovadas} aprovada(s) · ` +
        `${r.reprovadas.length} reprovada(s) na conferência · ` +
        (aplicar ? `${r.gravadas} gravada(s)` : '0 gravada(s) (prévia)')
    );
    if (r.recusadas.length) console.log(`${r.recusadas.length} recusada(s) nos filtros de texto`);
    if (r.semConferente) console.log(`${r.semConferente} sem conferente disponível — não gravada(s)`);
  }
  console.log(`custo: ${r.pedidos} pedido(s) à OpenRouter (cota gratuita: 50/dia)`);
  if (r.lotesComErro) console.log(`${r.lotesComErro} lote(s) falharam e voltam na próxima rodada`);
  for (const e of r.errosDeLote) console.log(`  lote [${e.ids.join(', ')}]: ${e.motivo}`);
  if (r.interrompida) console.log(`⛔ rodada interrompida: ${r.interrompida}`);
  if (modo !== 'conferir-gravadas') {
    console.log(`gerador(es): ${r.modelos.length ? r.modelos.join(', ') : 'nenhum'}`);
  }
  console.log(`conferente(s): ${r.modelosConferencia.length ? r.modelosConferencia.join(', ') : 'nenhum'}`);
  for (const rec of r.recusadas) console.log(`  recusada ${rec.id}: ${rec.motivo}`);
  for (const rep of r.reprovadas) {
    console.log(`  reprovada ${rep.exame}º/${rep.numero} (id ${rep.id}):`);
    for (const p of rep.problemas) console.log(`    - ${p}`);
  }
}

module.exports = {
  explicar,
  conferirGravadas,
  interpretarResposta,
  interpretarConferencia,
  montarPrompt,
  montarPromptConferencia,
  chamarOpenRouter,
  chamarConferencia,
  letraAfirmadaNoTexto,
  citacaoNumerada,
  PROMPT_SISTEMA,
  PROMPT_CONFERENCIA,
  PREFERIDOS,
  LOTE_PADRAO,
  TOTAL_PADRAO,
  MAX_CARACTERES,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = argv.indexOf(nome);
    if (i === -1) return padrao;
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1) {
      console.error(`❌ ${nome} precisa de um inteiro positivo.`);
      process.exit(1);
    }
    return n;
  };

  const aplicar = argv.includes('--aplicar');
  const refazerIa = argv.includes('--refazer-ia');
  const modoGravadas = argv.includes('--conferir-gravadas');
  const exame = valor('--exame', null);
  const lote = valor('--lote', LOTE_PADRAO);
  const total = valor('--total', TOTAL_PADRAO);
  const chave = process.env.OPENROUTER_API_KEY;

  if (!chave) {
    console.error('❌ OPENROUTER_API_KEY não definida.');
    console.error('   Ex.: OPENROUTER_API_KEY=$(cat ~/.openrouter-key) node explicar.js --aplicar');
    process.exit(1);
  }
  if (modoGravadas && refazerIa) {
    console.error('❌ --conferir-gravadas não gera nada; não combina com --refazer-ia.');
    process.exit(1);
  }

  if (!aplicar) {
    console.log('🔍 Prévia: nada será gravado nem limpo. Use --aplicar para valer.');
    console.log('   (A prévia chama os modelos e gasta cota da OpenRouter igual.)\n');
  }
  if (refazerIa) console.log('♻️  --refazer-ia: explicações da IA não revisadas também entram na fila.\n');
  if (modoGravadas) console.log("🔎 --conferir-gravadas: confere as explicações 'ia' não revisadas já gravadas.\n");

  const conferirModelo = (prompt, { excluir }) => chamarConferencia(prompt, { chave, excluir });

  // Antes de gastar um pedido: a geração precisa de DOIS modelos (um escreve,
  // outro confere). Com um só (ex.: IA_MODELOS com um id), não roda.
  // Listar modelos não gasta cota.
  modelosEmOrdem(PREFERIDOS)
    .then((disponiveis) => {
      const minimo = modoGravadas ? 1 : 2;
      if (disponiveis.length < minimo) {
        throw new Error(
          `só ${disponiveis.length} modelo(s) gratuito(s) disponível(is) (${disponiveis.join(', ') || 'nenhum'}); ` +
            `${modoGravadas ? 'a conferência precisa de 1' : 'são precisos 2: um escreve, outro confere'}. Nada foi feito.`
        );
      }
      console.log(`modelos disponíveis: ${disponiveis.join(', ')}\n`);
      return migrate(pool);
    })
    .then(() =>
      modoGravadas
        ? conferirGravadas({ exame, lote, total, aplicar, conferirModelo })
        : explicar({
            exame,
            lote,
            total,
            aplicar,
            refazerIa,
            chamarModelo: (prompt) => chamarOpenRouter(prompt, { chave }),
            conferirModelo,
          })
    )
    .then((r) => {
      imprimirResumo(r, { aplicar, modo: modoGravadas ? 'conferir-gravadas' : 'gerar' });
      return pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
