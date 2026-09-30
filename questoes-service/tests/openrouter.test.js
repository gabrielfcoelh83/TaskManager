// A lista fixa de modelos do classificar.js quebrou duas vezes porque ids da
// OpenRouter somem. openrouter.js troca a lista pela descoberta; este teste
// prova as regras dela sem rede: só entra modelo gratuito de verdade, a
// preferência só vale para o que existe, e a rede fora não derruba a rodada
// se já houver lista conhecida.

const { ehGratuito, ordenarModelos, criarDescoberta, MAX_TENTATIVAS } = require('../openrouter');

const gratis = (id, contexto = 8000) => ({ id, context_length: contexto, pricing: { prompt: '0', completion: '0' } });

const CATALOGO = [
  gratis('google/gemma-4-31b-it:free', 131072),
  gratis('nvidia/nemotron-3-ultra-550b-a55b:free', 262144),
  gratis('outro/pequeno:free', 4096),
  { id: 'pago/modelo', pricing: { prompt: '0.000001', completion: '0.000002' } },
  { id: 'enganoso/modelo:free', context_length: 999999, pricing: { prompt: '0', completion: '0.00001' } },
  { id: 'promo/modelo', context_length: 999999, pricing: { prompt: '0', completion: '0' } },
  { ...gratis('imagem/gerador:free', 999999), architecture: { output_modalities: ['image'] } },
];

// fetch de mentira: devolve o catálogo ou falha, e conta as chamadas.
function buscarFalso({ falhar = () => false } = {}) {
  const f = jest.fn(async () => {
    if (falhar(f.mock.calls.length)) throw new Error('ENOTFOUND');
    return { ok: true, json: async () => ({ data: CATALOGO }) };
  });
  return f;
}

describe('openrouter', () => {
  it('só conta como gratuito id :free com preço zero nos dois sentidos e saída de texto', () => {
    expect(CATALOGO.filter(ehGratuito).map((m) => m.id)).toEqual([
      'google/gemma-4-31b-it:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'outro/pequeno:free',
    ]);
  });

  it('usa só os preferidos que existem, na ordem dada', () => {
    const ordem = ordenarModelos(CATALOGO.filter(ehGratuito), [
      'openai/gpt-oss-20b:free', // o id que sumiu de verdade
      'google/gemma-4-31b-it:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
    ]);
    expect(ordem).toEqual(['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free']);
  });

  it('sem nenhum preferido existente, cai para os gratuitos de maior contexto', () => {
    const ordem = ordenarModelos(CATALOGO.filter(ehGratuito), ['sumiu/modelo:free']);
    expect(ordem).toEqual([
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'google/gemma-4-31b-it:free',
      'outro/pequeno:free',
    ]);
  });

  it('IA_MODELOS substitui a preferência do código', async () => {
    const d = criarDescoberta({ buscar: buscarFalso(), env: { IA_MODELOS: 'outro/pequeno:free, nao/existe:free' } });
    expect(await d.modelosEmOrdem(['google/gemma-4-31b-it:free'])).toEqual(['outro/pequeno:free']);
  });

  it('limita o número de modelos tentados por pedido', async () => {
    const muitos = Array.from({ length: 10 }, (_, i) => gratis(`m${i}:free`, i));
    const d = criarDescoberta({
      buscar: async () => ({ ok: true, json: async () => ({ data: muitos }) }),
      env: {},
    });
    expect(await d.modelosEmOrdem(['nenhum:free'])).toHaveLength(MAX_TENTATIVAS);
  });

  it('lista uma vez por TTL e usa o último cache quando a rede cai', async () => {
    let relogio = 1000;
    const buscar = buscarFalso({ falhar: (n) => n >= 2 });
    const d = criarDescoberta({ buscar, agora: () => relogio, env: {} });

    const primeira = await d.listarModelosGratuitos();
    await d.listarModelosGratuitos();
    expect(buscar).toHaveBeenCalledTimes(1);

    relogio += 2 * 60 * 60 * 1000;
    const depois = await d.listarModelosGratuitos();
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(depois).toEqual(primeira);
  });

  it('sem rede e sem cache, lança em vez de devolver lista vazia', async () => {
    const d = criarDescoberta({ buscar: buscarFalso({ falhar: () => true }), env: {} });
    await expect(d.listarModelosGratuitos()).rejects.toThrow(/listar os modelos/);
  });
});
