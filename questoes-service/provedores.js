// Identidade de modelo para o explicar.js: id qualificado com o provedor e
// FAMÍLIA do modelo.
//
// O único provedor é o Gemini (Google AI Studio). O id qualificado é
// "gemini:<id>", ex. "gemini:gemini-3.8-flash" ou "gemini:gemma-4-31b-it", e é
// assim que o gerador vai para `explicacao_modelo`.
//
// COMPATIBILIDADE com o que já está gravado: houve explicações escritas por
// modelos de outro provedor (que saiu: aprovava erro jurídico conhecido e
// respondia fora do formato), gravadas sem prefixo ("nvidia/...:free") ou
// com o prefixo daquele provedor ("<provedor>:..."). Elas continuam sendo
// LIDAS sem quebrar: qualquer prefixo "<nome>:" no começo é reconhecido como
// provedor, e esses ids simplesmente não casam com nenhum modelo Gemini (o
// autor antigo nunca é candidato a conferir).
// Id SEM prefixo vale como Gemini — é o que se espera em --excluir
// ("--excluir gemini-3.8-flash"); um id antigo sem prefixo vira
// "gemini:nvidia/...", que não existe, e não exclui nada que exista.
//
// EXCLUSÃO (--excluir, autor gravado, gerador do lote): pelo ID-BASE, sem
// provedor, sem "models/", sem o dono antes da "/" e sem ":free", em
// minúsculas. Assim um gemma antigo gravado como "google/gemma-4-31b-it:free"
// (ou "<provedor antigo>:google/gemma-4-31b-it:free") exclui
// "gemini:gemma-4-31b-it": são os MESMOS pesos, e o autor não pode conferir
// a si mesmo só porque mudou de provedor. "--excluir models/gemini-3.8-flash"
// e "Gemini:gemini-3.8-flash" também valem. Excluir a mais custa no máximo
// um conferente a menos; excluir a menos deixaria o autor conferir a si
// mesmo.
//
// FAMÍLIA: a conferência prefere um modelo de família diferente da dos
// excluídos (o gerador entre eles). 'gemma' se o id começa com gemma, senão
// 'gemini'. Para ids antigos de outro fabricante a família é o que vem antes
// da "/" ("nvidia/..." → 'nvidia') ou, sem "/", o prefixo antigo — só para o
// resumo não dizer "mesma família" de um conferente Gemini que conferiu texto
// de outro fabricante.

const PROVEDORES = ['gemini'];

// "<nome>:" no começo, antes de qualquer "/": "gemini:x", e prefixos antigos
// gravados. Os ids antigos sem prefixo têm ":" só DEPOIS da "/"
// ("nvidia/x:free"), e não casam.
const PREFIXO = /^([a-z][a-z0-9_-]*):(.*)$/i;

function separar(id) {
  const s = String(id ?? '').trim();
  const m = PREFIXO.exec(s);
  if (m) return { provedor: m[1].toLowerCase(), id: m[2].replace(/^models\//, ''), prefixado: true };
  return { provedor: 'gemini', id: s.replace(/^models\//, ''), prefixado: false };
}

// "gemini:models/Gemma-4-31B-it" → "gemma-4-31b-it";
// "google/gemma-4-31b-it:free" → "gemma-4-31b-it"; "nvidia/x:free" → "nvidia/x"
// (o dono só sai quando é o Google: outro fabricante continua distinto).
function idBase(id) {
  return separar(id)
    .id.toLowerCase()
    .replace(/:free$/, '')
    .replace(/^google\//, '');
}

const qualificar = (provedor, id) => `${provedor}:${id}`;

function normalizar(id) {
  const { provedor, id: cru } = separar(id);
  return qualificar(provedor, cru);
}

const provedorDe = (id) => separar(id).provedor;

function familia(id) {
  const { provedor, id: cru } = separar(id);
  const nome = cru.toLowerCase();
  const final = nome.slice(nome.lastIndexOf('/') + 1); // "google/gemma-..." → "gemma-..."
  if (final.startsWith('gemma')) return 'gemma';
  if (final.startsWith('gemini')) return 'gemini';
  const barra = nome.indexOf('/');
  if (barra > 0) return nome.slice(0, barra); // id antigo "nvidia/..."
  return provedor === 'gemini' ? 'gemini' : provedor; // id antigo "<outro>:modelo"
}

// A `entrada` (de --excluir, do banco ou o gerador) exclui `modelo`?
const exclui = (entrada, modelo) => idBase(entrada) === idBase(modelo);

const excluido = (modelo, excluir) => excluir.some((e) => exclui(e, modelo));

// Candidatos da conferência, em ordem: os não excluídos, primeiro os de
// família diferente de TODOS os excluídos, depois os demais (mesma família,
// mas nunca um excluído). Ordem estável dentro de cada grupo.
// `candidatos`: ids qualificados (ou objetos com `.qualificado`).
function ordenarConferentes(candidatos, excluir = []) {
  const chave = (c) => (typeof c === 'string' ? c : c.qualificado);
  const familiasFora = new Set(excluir.map(familia));
  const livres = candidatos.filter((c) => !excluido(chave(c), excluir));
  return [
    ...livres.filter((c) => !familiasFora.has(familia(chave(c)))),
    ...livres.filter((c) => familiasFora.has(familia(chave(c)))),
  ];
}

module.exports = {
  PROVEDORES,
  separar,
  qualificar,
  normalizar,
  idBase,
  provedorDe,
  familia,
  exclui,
  excluido,
  ordenarConferentes,
};
