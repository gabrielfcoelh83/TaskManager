// Repetir um pedido que o nginx recusou por excesso (429).
//
// O 429 vem do `limit_req` do nginx, antes de o pedido chegar a qualquer
// serviço — nenhum serviço da plataforma responde 429 por conta própria. Por
// isso repetir é seguro até num POST: o primeiro não foi gravado.
//
// Mora fora de `api.js` para rodar no `node`, como `paginas.js`.

export const ESPERAS_429_MS = [500, 1000, 2000];

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Chama `fazer()` (que devolve uma Response) e, enquanto vier 429, espera e
 * repete — uma vez por item de `esperas`. Depois disso devolve a última
 * resposta como veio, 429 inclusive: quem chama trata como erro comum.
 */
export async function repetirEm429(fazer, { esperas = ESPERAS_429_MS, esperar = dormir } = {}) {
  for (let tentativa = 0; ; tentativa += 1) {
    const res = await fazer();
    if (res.status !== 429 || tentativa >= esperas.length) return res;
    await esperar(esperas[tentativa]);
  }
}
