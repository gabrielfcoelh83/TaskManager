// Identidade de modelo com PROVEDOR, para o explicar.js.
//
// Com dois provedores (OpenRouter e Gemini), "conferente ≠ gerador" e o
// `explicacao_modelo` gravado precisam dizer de ONDE é o modelo: o id
// qualificado é "<provedor>:<id>", ex. "gemini:gemini-3.8-flash" ou
// "openrouter:nvidia/nemotron-3-ultra-550b-a55b:free".
//
// COMPATIBILIDADE: o que já está gravado em `explicacao_modelo` (e o que se
// passa em --excluir / IA_MODELOS) não tem prefixo e é da OpenRouter — até
// aqui ela era o único provedor. Então id sem prefixo conhecido = OpenRouter.
// Os ids da OpenRouter têm ":" ("...:free"), por isso só "openrouter:" e
// "gemini:" no começo contam como prefixo.
//
// EXCLUSÃO (--excluir, autor gravado, gerador do lote): entrada COM prefixo
// exclui só aquele modelo daquele provedor; entrada SEM prefixo exclui o id
// em QUALQUER provedor. Excluir a mais custa no máximo um modelo a menos;
// excluir a menos deixaria o autor conferir a si mesmo.
//
// FABRICANTE: a conferência prefere um modelo de fabricante diferente dos
// excluídos (o gerador entre eles). Tudo o que vem do Gemini é Google — e o
// gemma servido pela OpenRouter ("google/gemma-...") TAMBÉM é Google: é o
// mesmo modelo, com os mesmos vieses, então não conta como "outro
// fabricante". Na OpenRouter o fabricante é o que vem antes da "/"; id sem
// "/" (só em teste) é o próprio id, a não ser que comece com gemini/gemma.

const PROVEDORES = ['openrouter', 'gemini'];

function separar(id) {
  const s = String(id ?? '');
  for (const p of PROVEDORES) {
    if (s.startsWith(`${p}:`)) return { provedor: p, id: s.slice(p.length + 1), prefixado: true };
  }
  return { provedor: 'openrouter', id: s, prefixado: false };
}

const qualificar = (provedor, id) => `${provedor}:${id}`;

function normalizar(id) {
  const { provedor, id: cru } = separar(id);
  return qualificar(provedor, cru);
}

const provedorDe = (id) => separar(id).provedor;

function fabricante(id) {
  const { provedor, id: cru } = separar(id);
  if (provedor === 'gemini') return 'google';
  const barra = cru.indexOf('/');
  if (barra > 0) return cru.slice(0, barra).toLowerCase();
  if (/^(gemini|gemma)/i.test(cru)) return 'google';
  return cru;
}

// A `entrada` (de --excluir, do banco ou o gerador) exclui `modelo`?
function exclui(entrada, modelo) {
  const e = separar(entrada);
  const m = separar(modelo);
  if (e.prefixado) return e.provedor === m.provedor && e.id === m.id;
  return e.id === m.id;
}

const excluido = (modelo, excluir) => excluir.some((e) => exclui(e, modelo));

// Candidatos da conferência, em ordem: os não excluídos, primeiro os de
// fabricante diferente de TODOS os excluídos, depois os demais (mesmo
// fabricante, mas nunca um excluído). Ordem estável dentro de cada grupo.
// `candidatos`: ids qualificados (ou objetos com `.qualificado`).
function ordenarConferentes(candidatos, excluir = []) {
  const chave = (c) => (typeof c === 'string' ? c : c.qualificado);
  const fabricantesFora = new Set(excluir.map(fabricante));
  const livres = candidatos.filter((c) => !excluido(chave(c), excluir));
  return [
    ...livres.filter((c) => !fabricantesFora.has(fabricante(chave(c)))),
    ...livres.filter((c) => fabricantesFora.has(fabricante(chave(c)))),
  ];
}

module.exports = {
  PROVEDORES,
  separar,
  qualificar,
  normalizar,
  provedorDe,
  fabricante,
  exclui,
  excluido,
  ordenarConferentes,
};
