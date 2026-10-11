// Descoberta dos modelos do Gemini (gemini.js) e identidade com provedor
// (provedores.js). Sem rede e sem banco: `buscar` é injetado.

const {
  URL_MODELOS_GEMINI,
  ordemPadraoGemini,
  ordenarGemini,
  criarDescobertaGemini,
  ocultarChave,
} = require('../gemini');
const { separar, normalizar, fabricante, exclui, excluido, ordenarConferentes } = require('../provedores');

// Formato novo de chave (não começa com "AIza"): nada valida prefixo.
const CHAVE = 'gk-teste-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHI';

// A listagem real (out/2026), resumida: o que serve e o que não serve.
const LISTAGEM_REAL = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-pro-latest',
  'gemini-3.1-pro-preview',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-image',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-preview-09-2025',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-3.1-flash-live-preview',
  'gemini-3.5-transcribe',
  'gemini-omni-flash',
  'nano-banana-2.1',
  'lyria-3.5',
  'gemini-robotics-er-2-preview',
  'gemini-2.5-computer-use-preview-10-2025',
  'antigravity-preview-09-2026',
  'deep-research-pro-preview-12-2025',
];

const modeloApi = (id, extra = {}) => ({
  name: `models/${id}`,
  supportedGenerationMethods: ['generateContent', 'countTokens'],
  thinking: true,
  ...extra,
});

const respostaJson = (corpo) => ({ ok: true, status: 200, json: async () => corpo });

describe('gemini.js: regra padrão de modelos', () => {
  it('só flash estável, maior versão primeiro, depois gemini-flash-latest', () => {
    expect(ordemPadraoGemini(LISTAGEM_REAL)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ]);
  });

  it('versão com mais dígitos compara como número (3.10 > 3.9)', () => {
    expect(ordemPadraoGemini(['gemini-3.9-flash', 'gemini-3.10-flash', 'gemini-4-flash'])).toEqual([
      'gemini-4-flash',
      'gemini-3.10-flash',
      'gemini-3.9-flash',
    ]);
  });

  it('GEMINI_MODELOS substitui, na ordem dada, só com ids que existem', () => {
    const modelos = LISTAGEM_REAL.map((id) => ({ id, pensa: true }));
    expect(ordenarGemini(modelos, ['gemini-2.5-flash', 'nao-existe', 'gemini-3.6-flash']).map((m) => m.id)).toEqual([
      'gemini-2.5-flash',
      'gemini-3.6-flash',
    ]);
    // Nenhum existe: volta à regra padrão.
    expect(ordenarGemini(modelos, ['nao-existe'])[0].id).toBe('gemini-3.8-flash');
  });
});

describe('gemini.js: listagem (fetch simulado)', () => {
  it('chave no header x-goog-api-key, nunca na URL; filtra generateContent e tira "models/"', async () => {
    const buscar = jest.fn(async () =>
      respostaJson({
        models: [
          modeloApi('gemini-3.8-flash'),
          modeloApi('gemini-3.7-flash', { thinking: false }),
          modeloApi('gemini-embedding-2', { supportedGenerationMethods: ['embedContent'] }),
          modeloApi('gemini-3.8-flash-tts'),
        ],
      })
    );
    const d = criarDescobertaGemini({ buscar, env: {} });

    expect(await d.modelosGeminiEmOrdem(CHAVE)).toEqual([
      { id: 'gemini-3.8-flash', pensa: true },
      { id: 'gemini-3.7-flash', pensa: false },
    ]);
    const [url, opts] = buscar.mock.calls[0];
    expect(url.startsWith(URL_MODELOS_GEMINI)).toBe(true);
    expect(url).not.toContain(CHAVE);
    expect(url).not.toMatch(/[?&]key=/);
    expect(opts.headers).toEqual({ 'x-goog-api-key': CHAVE });
  });

  it('segue nextPageToken e usa GEMINI_MODELOS (com e sem prefixo)', async () => {
    const buscar = jest
      .fn()
      .mockResolvedValueOnce(respostaJson({ models: [modeloApi('gemini-3.8-flash')], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(respostaJson({ models: [modeloApi('gemini-2.5-flash')] }));
    const d = criarDescobertaGemini({
      buscar,
      env: { GEMINI_MODELOS: 'gemini:gemini-2.5-flash, models/gemini-3.8-flash' },
    });
    expect((await d.modelosGeminiEmOrdem(CHAVE)).map((m) => m.id)).toEqual(['gemini-2.5-flash', 'gemini-3.8-flash']);
    expect(buscar.mock.calls[1][0]).toContain('pageToken=p2');
  });

  it('erro da listagem não mostra a chave, nem quando o erro de rede a contém', async () => {
    const buscar = jest.fn(async () => {
      throw new Error(`falha em https://exemplo/?key=${CHAVE} (x-goog-api-key: ${CHAVE})`);
    });
    const d = criarDescobertaGemini({ buscar, env: {} });
    const err = await d.listarModelosGemini(CHAVE).catch((e) => e);
    expect(err.message).toMatch(/não foi possível listar os modelos do Gemini/);
    expect(err.message).not.toContain(CHAVE);
  });

  it('HTTP de erro (chave inválida) vira mensagem com o status, sem a chave', async () => {
    const d = criarDescobertaGemini({ buscar: async () => ({ ok: false, status: 400 }), env: {} });
    const err = await d.listarModelosGemini(CHAVE).catch((e) => e);
    expect(err.message).toMatch(/HTTP 400/);
    expect(err.message).not.toContain(CHAVE);
  });

  it('sem chave não chama a rede', async () => {
    const buscar = jest.fn();
    await expect(criarDescobertaGemini({ buscar }).listarModelosGemini('')).rejects.toThrow(/GEMINI_API_KEY/);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('ocultarChave troca todas as ocorrências', () => {
    expect(ocultarChave(`a ${CHAVE} b ${CHAVE}`, CHAVE)).toBe('a [chave oculta] b [chave oculta]');
  });
});

describe('provedores.js: identidade com provedor', () => {
  it('sem prefixo = OpenRouter (compatível com o que já está gravado)', () => {
    expect(separar('nvidia/nemotron-3-ultra-550b-a55b:free')).toEqual({
      provedor: 'openrouter',
      id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      prefixado: false,
    });
    expect(normalizar('nvidia/x:free')).toBe('openrouter:nvidia/x:free');
    expect(normalizar('gemini:gemini-3.8-flash')).toBe('gemini:gemini-3.8-flash');
    expect(normalizar('openrouter:google/gemma-4-31b-it:free')).toBe('openrouter:google/gemma-4-31b-it:free');
  });

  it('fabricante: Gemini e gemma da OpenRouter são todos Google', () => {
    expect(fabricante('gemini:gemini-3.8-flash')).toBe('google');
    expect(fabricante('gemini:gemma-4-31b-it')).toBe('google');
    expect(fabricante('google/gemma-4-31b-it:free')).toBe('google');
    expect(fabricante('openrouter:nvidia/nemotron-3-ultra-550b-a55b:free')).toBe('nvidia');
  });

  it('--excluir com prefixo exclui só naquele provedor; sem prefixo, em qualquer um', () => {
    expect(exclui('gemini:gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    expect(exclui('openrouter:gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(false);
    expect(exclui('gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    expect(exclui('nvidia/x:free', 'openrouter:nvidia/x:free')).toBe(true);
    expect(exclui('nvidia/x:free', 'nvidia/x:free')).toBe(true);
    expect(excluido('gemini:gemini-3.7-flash', ['gemini:gemini-3.8-flash'])).toBe(false);
  });

  it('conferentes: outro fabricante primeiro, o gerador nunca', () => {
    const candidatos = [
      'openrouter:nvidia/ultra:free',
      'openrouter:google/gemma-4-31b-it:free',
      'openrouter:nvidia/super:free',
      'gemini:gemini-3.8-flash',
      'gemini:gemini-3.7-flash',
    ];
    expect(ordenarConferentes(candidatos, ['gemini:gemini-3.8-flash'])).toEqual([
      'openrouter:nvidia/ultra:free',
      'openrouter:nvidia/super:free',
      'openrouter:google/gemma-4-31b-it:free',
      'gemini:gemini-3.7-flash',
    ]);
  });
});
