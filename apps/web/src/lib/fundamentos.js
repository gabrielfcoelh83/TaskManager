// Confere se uma resposta discursiva cita os fundamentos do padrão de
// resposta da FGV.
//
// Não é correção: a banca pontua a fundamentação, e o próprio enunciado avisa
// que citar o artigo sozinho não pontua. O que dá para conferir sem IA é o
// que a cliente pediu — "bater se eu fundamentar e colocar o artigo certo" —,
// e é só isso que este módulo faz.
//
// A comparação é no nível diploma + artigo (ou súmula + tribunal). Parágrafo,
// inciso e alínea ficam como detalhe exibido: quem escreveu "art. 1.659, I,
// do CC" e quem escreveu "art. 1.659 do CC" citaram o mesmo fundamento, e
// cobrar o inciso aqui daria "errado" para uma resposta que a banca aceitaria.

// ---------------------------------------------------------------------------
// Diplomas
// ---------------------------------------------------------------------------
//
// `nome` casa sem diferenciar maiúsculas; `sigla`, só em maiúsculas. "cf."
// (confira) e "cc" (com cópia) aparecem em texto corrido, e ler um deles como
// Constituição ou Código Civil inventaria uma citação.

const DIPLOMAS = [
  { id: 'CC', nome: 'c[óo]digo\\s+civil(?:\\s+brasileiro)?(?:\\s+de\\s+2002)?', sigla: 'CCB?(?:\\s*\\/\\s*(?:20)?02)?' },
  { id: 'CPC', nome: 'c[óo]digo\\s+de\\s+processo\\s+civil(?:\\s+de\\s+2015)?', sigla: 'N?CPC(?:\\s*\\/\\s*(?:20)?15)?' },
  { id: 'CDC', nome: 'c[óo]digo\\s+de\\s+defesa\\s+do\\s+consumidor', sigla: 'CDC' },
  { id: 'CF', nome: 'constitui[çc][ãa]o(?:\\s+federal|\\s+da\\s+rep[úu]blica)?(?:\\s+de\\s+1988)?', sigla: '(?:CRFB|CF)(?:\\s*\\/\\s*(?:19)?88)?' },
  { id: 'CP', nome: 'c[óo]digo\\s+penal', sigla: 'CP' },
  { id: 'CPP', nome: 'c[óo]digo\\s+de\\s+processo\\s+penal', sigla: 'CPP' },
  { id: 'CTN', nome: 'c[óo]digo\\s+tribut[áa]rio\\s+nacional', sigla: 'CTN' },
  { id: 'CLT', nome: 'consolida[çc][ãa]o\\s+das\\s+leis\\s+do\\s+trabalho', sigla: 'CLT' },
  { id: 'ECA', nome: 'estatuto\\s+da\\s+crian[çc]a\\s+e\\s+do\\s+adolescente', sigla: 'ECA' },
  { id: 'LINDB', nome: 'lei\\s+de\\s+introdu[çc][ãa]o\\s+[àa]s\\s+normas\\s+do\\s+direito\\s+brasileiro', sigla: 'LINDB' },
  { id: 'LGPD', nome: 'lei\\s+geral\\s+de\\s+prote[çc][ãa]o\\s+de\\s+dados(?:\\s+pessoais)?', sigla: 'LGPD' },
  { id: 'EPD', nome: 'estatuto\\s+da\\s+pessoa\\s+com\\s+defici[êe]ncia', sigla: 'EPD' },
  { id: 'Lei 6.015', nome: 'lei\\s+de\\s+registros\\s+p[úu]blicos', sigla: 'LRP' },
  { id: 'Lei 8.245', nome: 'lei\\s+do\\s+inquilinato|lei\\s+de\\s+loca[çc][õo]es', sigla: null },
];

// "da CF", "da LGPD", "da Lei 6.015"; "do CC", "do CPC".
const FEMININOS = new Set(['CF', 'CLT', 'LINDB', 'LGPD']);

// Lei citada pelo número. As que têm sigla própria viram a sigla: "Lei nº
// 8.078/90, art. 14" e "art. 14 do CDC" são o mesmo fundamento.
const LEI = '(?:lei|l\\.)\\s+(?:federal\\s+)?(?:n(?:[º°o]|\\.\\s*[º°o]?)?\\s*)?(\\d{1,2}\\.?\\d{3})(?:\\s*\\/\\s*(\\d{2,4}))?';
const LEI_COM_SIGLA = { 8078: 'CDC', 8069: 'ECA', 10406: 'CC', 13105: 'CPC', 13709: 'LGPD', 13146: 'EPD' };

const FIM_DE_PALAVRA = '(?![\\p{L}\\d])';
// Início de palavra SEM lookbehind: essa sintaxe é SyntaxError no Safari antes
// do 16.4, e este módulo é importado pelo App — o app inteiro não carregaria.
// Um grupo que consome o caractere anterior faz o mesmo papel; quem precisa
// da posição exata soma o tamanho do grupo 1 (ver `extrairCitacoes`).
const INICIO_DE_PALAVRA = '(^|[^\\p{L}\\d])';

const sticky = (fonte, i) => new RegExp(fonte + FIM_DE_PALAVRA, i ? 'iuy' : 'uy');
const noFim = (fonte, i) => new RegExp(INICIO_DE_PALAVRA + '(?:' + fonte + ')[\\s,]*$', i ? 'iu' : 'u');

const DIPLOMA_EM = DIPLOMAS.flatMap((d) => [
  { id: d.id, re: sticky(d.nome, true) },
  ...(d.sigla ? [{ id: d.id, re: sticky(d.sigla, false) }] : []),
]);
// "do cc", "da cf": sigla em minúscula só vale logo depois da preposição —
// solta no texto, "cc" e "cf." são outra coisa.
const SIGLA_MINUSCULA_EM = DIPLOMAS.filter((d) => d.sigla).map((d) => ({ id: d.id, re: sticky(d.sigla, true) }));
const DIPLOMA_ANTES = DIPLOMAS.flatMap((d) => [
  { id: d.id, re: noFim(d.nome, true) },
  ...(d.sigla ? [{ id: d.id, re: noFim(d.sigla, false) }] : []),
]);
const LEI_EM = sticky(LEI, true);
const LEI_ANTES = noFim(LEI, true);

function idDaLei(numero) {
  const n = Number(numero.replace(/\./g, ''));
  return LEI_COM_SIGLA[n] || `Lei ${milhar(String(n))}`;
}

// O diploma que começa exatamente em `pos`.
function diplomaEm(texto, pos, depoisDePreposicao = false) {
  for (const { id, re } of depoisDePreposicao ? [...DIPLOMA_EM, ...SIGLA_MINUSCULA_EM] : DIPLOMA_EM) {
    re.lastIndex = pos;
    const m = re.exec(texto);
    if (m) return { id, fim: pos + m[0].length };
  }
  LEI_EM.lastIndex = pos;
  const lei = LEI_EM.exec(texto);
  if (lei) return { id: idDaLei(lei[1]), fim: pos + lei[0].length };
  return null;
}

// "…, do CC", " da Lei nº 8.078/90", " (CPC)", ", ambos do CC", ", do mesmo diploma".
const ANTES_DO_DIPLOMA = /[\s,]*\(?\s*(?:amb[oa]s\s+)?(?:(d[oa]s?|n[oa]s?|em)\s+)?/iuy;
const MESMO_DIPLOMA = new RegExp('mesm[oa]\\s+(?:diploma|c[óo]digo|lei|estatuto)' + FIM_DE_PALAVRA, 'iuy');

function diplomaAdiante(texto, pos) {
  ANTES_DO_DIPLOMA.lastIndex = pos;
  const filler = ANTES_DO_DIPLOMA.exec(texto);
  const inicio = pos + (filler ? filler[0].length : 0);

  MESMO_DIPLOMA.lastIndex = inicio;
  const mesmo = MESMO_DIPLOMA.exec(texto);
  if (mesmo) return { id: null, mesmo: true, fim: inicio + mesmo[0].length };

  const achado = diplomaEm(texto, inicio, Boolean(filler?.[1]));
  if (!achado) return null;
  let fim = achado.fim;
  if (texto[fim] === ')') fim += 1;
  return { ...achado, fim };
}

// "CC, art. 186", "Lei nº 8.078/90, art. 14": o diploma vem antes.
function diplomaAtras(texto, pos) {
  const trecho = texto.slice(Math.max(0, pos - 90), pos);
  for (const { id, re } of DIPLOMA_ANTES) {
    if (re.test(trecho)) return id;
  }
  const lei = LEI_ANTES.exec(trecho);
  // lei[1] é o caractere antes da palavra (INICIO_DE_PALAVRA).
  return lei ? idDaLei(lei[2]) : null;
}

// ---------------------------------------------------------------------------
// Artigos
// ---------------------------------------------------------------------------

const RE_ART = new RegExp(INICIO_DE_PALAVRA + '(?:arts?\\.?|artigos?)\\s*(?=\\d)', 'giu');

// "c/c", "C/C", "c.c." (combinado com): ligam artigos. Sem esta checagem o
// "C" de "C/C" era lido como inciso romano e o artigo seguinte sumia.
const RE_CC = /(?:c\/c|c\.\s*c\.)(?![\p{L}\d])/iuy;

// 1.659 e 1659 são o mesmo artigo; "5º" e "5o" também. "1.240-A" existe.
const RE_NUMERO = /(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*[º°o](?![\p{L}\d]))?(?:\s*-\s*([A-Z])(?![\p{L}\d]))?/uy;

// Parágrafo, inciso, alínea: o detalhe que acompanha o artigo. O romano solto
// ("art. 1.659, I") só é aceito em maiúsculas e depois de conferido que não é
// sigla de diploma — "CC" e "CDC" são letras romanas válidas.
const RE_DETALHE = new RegExp(
  '(?:(?:e|ou)\\s+)?(?:'
  // "§ 1º a 3º", "§§ 1º e 2º": intervalo de parágrafos é detalhe do artigo,
  // nunca artigo novo — sem isto, "art. 1.228, § 1º a 3º" citava um art. 3.
  // Número de parágrafo nunca é seguido de "." + dígito: em "§ 1º e 1.229",
  // o "1" é o começo do art. 1.229, não um § 1º.
  + '§{1,2}\\s*\\d+\\s*[º°o]?(?:\\s*(?:e|ou|,|a|at[ée])\\s*§?\\s*\\d+\\s*[º°o]?(?![\\p{L}\\d]|\\.\\d))*'
  + '|par[áa]grafos\\s+\\d+\\s*[º°o]?(?:\\s*(?:e|ou|,|a|at[ée])\\s*\\d+\\s*[º°o]?(?![\\p{L}\\d]|\\.\\d))*'
  + '|par[áa]grafo\\s+(?:[úu]nico|\\d+\\s*[º°o]?)'
  + '|p\\.\\s*[úu]\\.'
  + '|caput|in\\s+fine|parte\\s+final|(?:primeira|segunda)\\s+parte'
  + '|incisos?\\s+[IVXLCDM]+(?:\\s*(?:e|ou|,|a|at[ée])\\s*[IVXLCDM]+(?![\\p{L}\\d]))*'
  + '|inc\\.\\s*[IVXLCDM]+'
  + '|al[íi]neas?\\s+["“\']?[a-z]["”\']?'
  + '|[IVXLCDM]+'
  + ')' + FIM_DE_PALAVRA,
  'uy',
);
const RE_ESPACO_VIRGULA = /[\s,]*/y;

// Entre um artigo e o próximo do mesmo grupo: "arts. 186 e 927",
// "art. 186 c/c 927", "art. 876 ou 877", "arts. 186, 187 e 927",
// "arts. 186 a 188" (intervalo).
const RE_CONTINUACAO = new RegExp(
  '[\\s,]*(?:(e|ou|a|at[ée]|c\\/c|c\\.\\s*c\\.)\\s+)?(?:(?:o|os|do|dos|no|nos)\\s+)?((?:arts?\\.?|artigos?)\\s*)?(?=\\d)',
  'iuy',
);
// Depois que o diploma fechou o grupo: "artigo 496 do Código Civil e 179 do
// CC", "Art. 787 do CC ou do Art. 125 do CPC". Aqui o conector é obrigatório.
const RE_CONTINUACAO_DEPOIS_DO_DIPLOMA = new RegExp(
  '[\\s,;]*(e|ou|c\\/c|c\\.\\s*c\\.)\\s+(?:(?:o|os|do|dos|da|das|no|nos|ao|aos)\\s+)?((?:arts?\\.?|artigos?)\\s*)?(?=\\d)',
  'iuy',
);
// Intervalo maior que isto é mais provável erro de leitura que citação.
const MAX_INTERVALO = 30;
// Um número só continua o grupo se o que vem depois tem cara de citação.
// Sem isto, "art. 186 e 10 testemunhas" citaria um art. 10.
const RE_DEPOIS_DO_NUMERO = /(?:[º°o](?![\p{L}\d])|\s*-\s*[A-Z](?![\p{L}\d])|\s*(?:[,;.:)]|$|§|\(|(?:a|at[ée])\s+\d|(?:e|ou|d[oa]s?|n[oa]s?|c\/c|caput|inciso|par[áa]grafo|al[íi]nea)(?![\p{L}\d])))/iuy;

// Depois de o diploma fechar o grupo, um número sem "art." só é artigo se o
// que vem depois é fim de frase, detalhe de artigo, outro diploma ou outro
// artigo. "art. 186 do CC e 3, conforme…" e "…do CC e 2 dos réus" não são.
const RE_DEPOIS_DO_NUMERO_POS_DIPLOMA = /(?:\s*[º°o](?![\p{L}\d]))?(?:\s*-\s*[A-Z](?![\p{L}\d]))?(?:\s*(?:[.;:)]|$)|[\s,]*(?:§|incisos?(?![\p{L}\d])|inc\.|caput|par[áa]grafo|[IVXLCDM]+(?![\p{L}\d]))|\s+(?:e|ou|a|at[ée]|c\/c)\s+(?:arts?\.?\s*|artigos?\s*)?\d)/uy;

const RE_VIRGULA = /(?:\s*[º°o](?![\p{L}\d]))?\s*,/uy;
const RE_PARENTESE = /(?:\s*[º°o](?![\p{L}\d]))?\s*\(/uy;
// Número por extenso entre parênteses é quantidade, não artigo: "15 (quinze)
// dias", "50 (cinquenta) mil reais".
const RE_POR_EXTENSO = /(?:\s*[º°o](?![\p{L}\d]))?\s*\(\s*(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent\p{L}*|trezent\p{L}*|quatrocent\p{L}*|quinhent\p{L}*|seiscent\p{L}*|setecent\p{L}*|oitocent\p{L}*|novecent\p{L}*|mil)(?![\p{L}])/iuy;

function lerNumero(texto, pos) {
  RE_NUMERO.lastIndex = pos;
  const m = RE_NUMERO.exec(texto);
  if (!m) return null;
  const artigo = m[1].replace(/\./g, '') + (m[2] ? `-${m[2]}` : '');
  return { artigo, fim: pos + m[0].length };
}

function lerDetalhes(texto, pos) {
  const detalhes = [];
  let q = pos;
  for (;;) {
    RE_ESPACO_VIRGULA.lastIndex = q;
    const inicio = q + RE_ESPACO_VIRGULA.exec(texto)[0].length;
    if (diplomaAdiante(texto, q)) break;
    RE_CC.lastIndex = inicio;
    if (RE_CC.test(texto)) break;
    RE_DETALHE.lastIndex = inicio;
    const m = RE_DETALHE.exec(texto);
    if (!m) break;
    detalhes.push(m[0].replace(/\s+/g, ' ').trim());
    q = inicio + m[0].length;
  }
  return { detalhe: detalhes.join(', '), fim: q };
}

// O próximo número de um encadeamento, se houver: `{ pos, conector }`.
// Sem "art." antes, o número só conta se o que vem depois tem cara de
// citação ("e 10 testemunhas" não é o art. 10).
function continuacao(texto, pos, re, depoisDoDiploma = false) {
  re.lastIndex = pos;
  const cont = re.exec(texto);
  if (!cont) return null;
  const inicioNumero = pos + cont[0].length;
  const proximo = lerNumero(texto, inicioNumero);
  if (!proximo) return null;
  if (!cont[2]) {
    if (depoisDoDiploma) {
      RE_DEPOIS_DO_NUMERO_POS_DIPLOMA.lastIndex = proximo.fim;
      // Vírgula ou parêntese logo depois só se o número tem cara de artigo.
      // Vírgula: três dígitos ou mais, ou sufixo ("…do CC e 927, sendo
      // devida…"); "…e 10, conforme a doutrina" não. Parêntese: dois dígitos
      // ou mais ("…e 927 (responsabilidade)"), mas não número por extenso
      // ("…do CPC e 15 (quinze) dias").
      const digitos = proximo.artigo.split('-')[0].length;
      const temSufixo = proximo.artigo.includes('-');
      RE_VIRGULA.lastIndex = proximo.fim;
      RE_PARENTESE.lastIndex = proximo.fim;
      RE_POR_EXTENSO.lastIndex = proximo.fim;
      const porVirgula = (digitos >= 3 || temSufixo) && RE_VIRGULA.test(texto);
      const porParentese = (digitos >= 2 || temSufixo) && RE_PARENTESE.test(texto) && !RE_POR_EXTENSO.test(texto);
      const ok = RE_DEPOIS_DO_NUMERO_POS_DIPLOMA.test(texto)
        || diplomaAdiante(texto, proximo.fim)
        || porVirgula || porParentese;
      if (!ok) return null;
    } else {
      RE_DEPOIS_DO_NUMERO.lastIndex = proximo.fim;
      if (!RE_DEPOIS_DO_NUMERO.test(texto)) return null;
    }
  }
  const conector = cont[1] ? cont[1].toLowerCase().replace(/\s+/g, '') : null;
  return { pos: inicioNumero, conector: conector === 'c.c.' ? 'c/c' : conector };
}

function lerGrupoDeArtigos(texto, pos) {
  const artigos = [];
  let q = pos;
  let conector = null;

  for (;;) {
    const numero = lerNumero(texto, q);
    if (!numero) break;
    const { detalhe, fim } = lerDetalhes(texto, numero.fim);

    // "arts. 186 a 188": os do meio também foram citados.
    const anterior = artigos[artigos.length - 1];
    if (conector === 'a' || conector === 'até' || conector === 'ate') {
      const de = Number(anterior?.artigo);
      const ate = Number(numero.artigo);
      if (Number.isInteger(de) && Number.isInteger(ate) && ate > de && ate - de <= MAX_INTERVALO) {
        for (let n = de + 1; n < ate; n++) artigos.push({ artigo: String(n), detalhe: '', alternativaDaAnterior: false });
      }
    }
    artigos.push({ artigo: numero.artigo, detalhe, alternativaDaAnterior: conector === 'ou' });
    q = fim;

    if (diplomaAdiante(texto, q)) break;
    const cont = continuacao(texto, q, RE_CONTINUACAO);
    if (!cont) break;
    conector = cont.conector;
    q = cont.pos;
  }

  return { artigos, fim: q };
}

// ---------------------------------------------------------------------------
// Súmulas
// ---------------------------------------------------------------------------

const RE_SUMULA = new RegExp(
  INICIO_DE_PALAVRA
  + 's[úu]mula\\s+(vinculante\\s+)?(?:n(?:[º°o]|\\.\\s*[º°o]?)?\\s*)?(\\d+)'
  + '(?:\\s*,?\\s*(?:d[oa]\\s+)?(STJ|STF|TST|superior\\s+tribunal\\s+de\\s+justi[çc]a|supremo\\s+tribunal\\s+federal|tribunal\\s+superior\\s+do\\s+trabalho)'
  + FIM_DE_PALAVRA + ')?',
  'giu',
);

function tribunal(nome, vinculante) {
  if (vinculante) return 'STF';
  if (!nome) return null;
  const n = nome.toLowerCase();
  if (n === 'stj' || n.startsWith('superior')) return 'STJ';
  if (n === 'stf' || n.startsWith('supremo')) return 'STF';
  return 'TST';
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

function milhar(numero) {
  return numero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatarArtigo(artigo) {
  const [numero, letra] = String(artigo).split('-');
  const n = Number(numero);
  const base = n >= 1 && n <= 9 ? `${n}º` : milhar(numero);
  return letra ? `${base}-${letra}` : base;
}

function rotuloDe(citacao) {
  if (citacao.tipo === 'sumula') {
    const nome = citacao.vinculante ? 'Súmula Vinculante' : 'Súmula';
    return citacao.tribunal ? `${nome} ${citacao.numero} do ${citacao.tribunal}` : `${nome} ${citacao.numero}`;
  }
  const art = `Art. ${formatarArtigo(citacao.artigo)}`;
  if (!citacao.diploma) return art;
  const feminino = FEMININOS.has(citacao.diploma) || citacao.diploma.startsWith('Lei ');
  return `${art} ${feminino ? 'da' : 'do'} ${citacao.diploma}`;
}

function chaveDe(citacao) {
  if (citacao.tipo === 'sumula') {
    return `SUM:${citacao.vinculante ? 'V' : ''}${citacao.tribunal || '?'}:${citacao.numero}`;
  }
  return `${citacao.diploma || '?'}:${citacao.artigo}`;
}

// ---------------------------------------------------------------------------
// Extração
// ---------------------------------------------------------------------------

/**
 * As citações legais de um texto, na ordem em que aparecem.
 *
 * Cada uma: `{ tipo: 'artigo'|'sumula', chave, rotulo, detalhe, diploma,
 * artigo, inicio, fim, alternativaDaAnterior }`. `fim` é o fim do grupo
 * inteiro ("arts. 186 e 927 do CC" termina depois de "CC") — é por ele que
 * `esperadosDoGabarito` descobre um "ou" entre dois fundamentos.
 *
 * Número solto não é citação: sem "art."/"artigo"/"Súmula" antes, "1.659"
 * pode ser valor, prazo ou número de processo.
 */
export function extrairCitacoes(texto) {
  const fonte = String(texto || '');
  const citacoes = [];

  RE_ART.lastIndex = 0;
  let m;
  while ((m = RE_ART.exec(fonte))) {
    // O grupo 1 é o caractere antes da palavra (ver INICIO_DE_PALAVRA).
    let inicio = m.index + m[1].length;
    let pos = m.index + m[0].length;
    let conector = null;
    let herdado = null;
    let primeiro = true;

    // Um grupo, e os que vêm encadeados depois do diploma dele.
    for (;;) {
      const grupo = lerGrupoDeArtigos(fonte, pos);
      if (grupo.artigos.length === 0) break;

      let fim = grupo.fim;
      let diploma = null;
      const adiante = diplomaAdiante(fonte, grupo.fim);
      if (adiante) {
        fim = adiante.fim;
        const artigosAntes = citacoes.filter((c) => c.tipo === 'artigo');
        diploma = adiante.mesmo ? (artigosAntes[artigosAntes.length - 1]?.diploma ?? null) : adiante.id;
      } else {
        // "…do CC e 179": sem lei própria, é a do grupo de antes.
        diploma = primeiro ? diplomaAtras(fonte, inicio) : herdado;
      }

      grupo.artigos.forEach((a, i) => {
        const citacao = {
          tipo: 'artigo', diploma, artigo: a.artigo, detalhe: a.detalhe,
          alternativaDaAnterior: i === 0 && !primeiro ? conector === 'ou' : a.alternativaDaAnterior,
          inicio, fim,
        };
        citacoes.push({ ...citacao, chave: chaveDe(citacao), rotulo: rotuloDe(citacao) });
      });
      RE_ART.lastIndex = Math.max(RE_ART.lastIndex, fim);

      if (!adiante) break;
      const cont = continuacao(fonte, fim, RE_CONTINUACAO_DEPOIS_DO_DIPLOMA, true);
      if (!cont) break;
      conector = cont.conector;
      herdado = diploma;
      primeiro = false;
      inicio = cont.pos;
      pos = cont.pos;
    }
  }

  RE_SUMULA.lastIndex = 0;
  while ((m = RE_SUMULA.exec(fonte))) {
    const inicio = m.index + m[1].length;
    const citacao = {
      tipo: 'sumula', vinculante: Boolean(m[2]), numero: m[3], tribunal: tribunal(m[4], m[2]),
      detalhe: '', alternativaDaAnterior: false, inicio, fim: m.index + m[0].length,
    };
    citacoes.push({ ...citacao, chave: chaveDe(citacao), rotulo: rotuloDe(citacao) });
  }

  return resolverSemDiploma(citacoes.sort((a, b) => a.inicio - b.inicio));
}

// "…na forma do Art. 462 do CC. (…) o Art. 462 adota a liberdade formal…":
// o segundo é o mesmo artigo, só que sem a lei repetida. Se no mesmo texto o
// número aparece com um diploma só, é dele.
function resolverSemDiploma(citacoes) {
  return citacoes.map((c) => {
    if (c.tipo !== 'artigo' || c.diploma != null) return c;
    const diplomas = new Set(citacoes.filter((o) => o.tipo === 'artigo' && o.artigo === c.artigo && o.diploma).map((o) => o.diploma));
    if (diplomas.size !== 1) return c;
    const resolvida = { ...c, diploma: [...diplomas][0] };
    return { ...resolvida, chave: chaveDe(resolvida), rotulo: rotuloDe(resolvida) };
  });
}

// ---------------------------------------------------------------------------
// Gabarito × resposta
// ---------------------------------------------------------------------------

// "…do CC ou do Art. 125…", "…do CPC, ou da Súmula 537…"
const RE_OU_ENTRE = /^[\s,;()]*ou(?![\p{L}\d])/iu;

const opcao = (c) => ({ chave: c.chave, rotulo: c.rotulo, detalhe: c.detalhe });

/**
 * Os fundamentos que o padrão de resposta espera: `[{ rotulo, opcoes }]`.
 *
 * Citações ligadas por "ou" viram UM fundamento com várias opções, e
 * qualquer uma o satisfaz — é assim que a FGV escreve quando aceita mais de
 * um caminho ("Art. 787, §3º, do CC ou do Art. 125, inciso II, do CPC, ou da
 * Súmula 537 do STJ").
 */
export function esperadosDoGabarito(gabarito) {
  const fonte = String(gabarito || '');
  const citacoes = extrairCitacoes(fonte);
  const grupos = [];

  citacoes.forEach((c, i) => {
    const anterior = citacoes[i - 1];
    const ouNoTexto = anterior && anterior.fim <= c.inicio && RE_OU_ENTRE.test(fonte.slice(anterior.fim, c.inicio));
    if (grupos.length > 0 && (c.alternativaDaAnterior || ouNoTexto)) grupos[grupos.length - 1].push(c);
    else grupos.push([c]);
  });

  const esperados = [];
  const vistas = new Set();
  for (const grupo of grupos) {
    // O artigo que já é fundamento não volta como opção de outro. Sem isto,
    // "…conforme o Art. 464, parte final, do CC, ou se for do interesse da
    // credora, (…) na forma do Art. 465 do CC" (36º Exame) deixava o art. 465
    // dispensável para quem citou o 464 — que já tinha sido pedido antes.
    const opcoes = [];
    for (const c of grupo) {
      if (!vistas.has(c.chave) && !opcoes.some((o) => o.chave === c.chave)) opcoes.push(opcao(c));
    }
    if (opcoes.length === 0) continue;
    opcoes.forEach((o) => vistas.add(o.chave));
    esperados.push({ rotulo: opcoes.map((o) => o.rotulo).join(' ou '), opcoes });
  }
  return esperados;
}

const numeroDe = (chave) => chave.slice(chave.lastIndexOf(':') + 1);
const tipoDe = (chave) => (chave.startsWith('SUM:') ? 'sumula' : 'artigo');

// Quem escreveu "art. 1.659, I" sem dizer a lei citou o artigo certo; conta,
// mas a tela avisa (`semDiploma`). O inverso — "art. 186 do CP" quando o
// esperado é o do CC — não conta: é outro artigo.
function casa(citada, chaveEsperada) {
  if (citada.chave === chaveEsperada) return { semDiploma: false };
  if (tipoDe(chaveEsperada) !== citada.tipo) return null;
  if (numeroDe(chaveEsperada) !== numeroDe(citada.chave)) return null;

  if (citada.tipo === 'artigo') {
    if (citada.diploma == null) return { semDiploma: true };
    if (chaveEsperada.startsWith('?:')) return { semDiploma: false };
    return null;
  }
  // Súmula sem tribunal casa com a do tribunal esperado.
  if (citada.tribunal == null && citada.vinculante === chaveEsperada.startsWith('SUM:V')) return { semDiploma: true };
  return null;
}

/**
 * Compara a resposta de um item com o gabarito comentado dele.
 *
 * `{ esperados, atendidos, faltando, extras, caminhos, caminho }` —
 * `caminhos` é quantas respostas alternativas o padrão aceita (ver
 * `caminhosDoGabarito`) e `caminho`, qual delas foi usada: a que a resposta
 * mais atende. `atendidos` e `faltando`
 * são esperados (`{ rotulo, opcoes }`), com `citado` nos atendidos: o que a
 * pessoa escreveu que o satisfez. `extras` são citações da resposta que o
 * padrão não traz — não estão erradas por isso, só não estão no gabarito.
 */
export function compararFundamentos(resposta, gabarito) {
  const caminhos = caminhosDoGabarito(gabarito);
  const resultados = caminhos.map((caminho) => compararComCaminho(resposta, caminho));

  // O melhor caminho para esta resposta: maior proporção de fundamentos
  // citados; empatados, o que tem mais citados. Caminho sem artigo nenhum só
  // vence se nenhum tiver — senão ganharia sempre, com "0 de 0".
  let melhor = 0;
  const nota = (r) => (r.esperados.length === 0 ? -1 : r.atendidos.length / r.esperados.length);
  resultados.forEach((r, i) => {
    const atual = resultados[melhor];
    if (nota(r) > nota(atual) || (nota(r) === nota(atual) && r.atendidos.length > atual.atendidos.length)) melhor = i;
  });

  return { ...resultados[melhor], caminhos: caminhos.length, caminho: melhor };
}

// A FGV marca respostas alternativas com uma linha "OU" sozinha entre elas
// (43º Exame, Direito Civil, questão 1, item B: foro de Santos pelo art. 47
// do CPC OU foro de São Paulo pelo art. 46). Cada bloco é um caminho de
// resposta completo, com os fundamentos dele.
const LINHA_OU = /^[ \t]*OU[ \t]*$/gm;

export function caminhosDoGabarito(gabarito) {
  const blocos = String(gabarito || '').split(LINHA_OU).filter((b) => b.trim() !== '');
  return blocos.length > 0 ? blocos : [''];
}

function compararComCaminho(resposta, gabarito) {
  const esperados = esperadosDoGabarito(gabarito);
  const citadas = extrairCitacoes(resposta);

  const atendidos = [];
  const faltando = [];
  for (const esperado of esperados) {
    let achado = null;
    for (const c of citadas) {
      for (const o of esperado.opcoes) {
        const r = casa(c, o.chave);
        if (r && (!achado || (achado.semDiploma && !r.semDiploma))) {
          achado = { rotulo: c.rotulo, detalhe: c.detalhe, semDiploma: r.semDiploma };
        }
      }
    }
    if (achado) atendidos.push({ ...esperado, citado: achado });
    else faltando.push(esperado);
  }

  const extras = [];
  const vistas = new Set();
  for (const c of citadas) {
    if (vistas.has(c.chave)) continue;
    vistas.add(c.chave);
    const noGabarito = esperados.some((e) => e.opcoes.some((o) => casa(c, o.chave)));
    if (!noGabarito) extras.push({ chave: c.chave, rotulo: c.rotulo, detalhe: c.detalhe, semDiploma: c.tipo === 'artigo' && c.diploma == null });
  }

  return { esperados, atendidos, faltando, extras };
}

/**
 * A conferência da questão inteira: um resultado por item, e o total de
 * fundamentos citados e esperados — o `fundamentos` que vai para o servidor.
 */
export function conferirQuestao(itens, respostas) {
  const porItem = {};
  let citados = 0;
  let esperados = 0;
  for (const item of itens || []) {
    const r = compararFundamentos(respostas?.[item.letra] || '', item.gabarito);
    porItem[item.letra] = r;
    citados += r.atendidos.length;
    esperados += r.esperados.length;
  }
  return { porItem, citados, esperados };
}
