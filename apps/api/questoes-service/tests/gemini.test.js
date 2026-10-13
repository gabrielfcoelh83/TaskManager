// Descoberta dos modelos do Gemini (gemini.js) e identidade com provedor
// (provedores.js). Sem rede e sem banco: `buscar` é injetado.

const {
  URL_MODELOS_GEMINI,
  GEMINI_URL,
  ordemPadraoGemini,
  ordemPadraoConferentes,
  ordenarGemini,
  ordenarConferentesGemini,
  criarDescobertaGemini,
  montarPedidoGemini,
  semRaciocinio,
  timeoutDe,
  TIMEOUT_MS,
  TIMEOUT_GEMMA_MS,
  ocultarChave,
} = require('../gemini');
const { separar, normalizar, idBase, familia, exclui, excluido, ordenarConferentes } = require('../provedores');

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

describe('gemini.js: conferentes (Gemma primeiro)', () => {
  it('gemma -it por versão desc e tamanho desc, depois os flashes; pro fica de fora', () => {
    expect(ordemPadraoConferentes(LISTAGEM_REAL)).toEqual([
      'gemma-4-31b-it',
      'gemma-4-26b-a4b-it',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-flash-latest',
    ]);
  });

  it('versão maior vence tamanho maior; sem -it ou sem tamanho fica de fora', () => {
    expect(
      ordemPadraoConferentes(['gemma-3-27b-it', 'gemma-4-12b-it', 'gemma-4-31b', 'gemma-3n-e4b-it', 'gemma-4-31b-it'])
    ).toEqual(['gemma-4-31b-it', 'gemma-4-12b-it', 'gemma-3-27b-it']);
  });

  it('GEMINI_CONFERENTES substitui, na ordem dada, só com ids que existem', () => {
    const modelos = LISTAGEM_REAL.map((id) => ({ id, pensa: false }));
    expect(
      ordenarConferentesGemini(modelos, ['gemini-3.6-flash', 'nao-existe', 'gemma-4-26b-a4b-it']).map((m) => m.id)
    ).toEqual(['gemini-3.6-flash', 'gemma-4-26b-a4b-it']);
    expect(ordenarConferentesGemini(modelos, ['nao-existe'])[0].id).toBe('gemma-4-31b-it');
  });

  it('descoberta: conferentes sem corte e com GEMINI_CONFERENTES (com prefixo)', async () => {
    const buscar = jest.fn(async () => respostaJson({ models: LISTAGEM_REAL.map((id) => modeloApi(id)) }));
    const d = criarDescobertaGemini({ buscar, env: {} });
    expect((await d.conferentesGeminiEmOrdem(CHAVE)).map((m) => m.id)).toHaveLength(8);
    // Geradores continuam só flash, com o teto de tentativas.
    expect((await d.modelosGeminiEmOrdem(CHAVE)).map((m) => m.id)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ]);
    expect(buscar).toHaveBeenCalledTimes(1); // cache

    const fixa = criarDescobertaGemini({ buscar, env: { GEMINI_CONFERENTES: 'gemini:gemma-4-26b-a4b-it' } });
    expect((await fixa.conferentesGeminiEmOrdem(CHAVE)).map((m) => m.id)).toEqual(['gemma-4-26b-a4b-it']);
  });
});

describe('gemini.js: pedido de chat', () => {
  const params = { prompt: 'PERGUNTA', sistema: 'SISTEMA', temperatura: 0, maxTokens: 1000 };

  it('gemma que pensa: folga no teto, mas sem reasoning_effort (a API recusa com 400)', () => {
    const { corpo } = montarPedidoGemini(
      { id: 'gemma-4-31b-it', chave: 'k', pensa: true },
      { prompt: 'p', sistema: 's', temperatura: 0, maxTokens: 100 }
    );
    expect(corpo.reasoning_effort).toBeUndefined();
    expect(corpo.max_tokens).toBeGreaterThan(100);
    expect(corpo.messages).toEqual([{ role: 'user', content: 's\n\np' }]);
  });

  it('gemini: system + user, Bearer, rota compatível; reasoning_effort e folga só para quem pensa', () => {
    const p = montarPedidoGemini({ id: 'gemini-3.8-flash', chave: CHAVE, pensa: true }, params);
    expect(p.url).toBe(GEMINI_URL);
    expect(p.url).not.toContain(CHAVE);
    expect(p.headers.Authorization).toBe(`Bearer ${CHAVE}`);
    expect(p.corpo.messages).toEqual([
      { role: 'system', content: 'SISTEMA' },
      { role: 'user', content: 'PERGUNTA' },
    ]);
    expect(p.corpo).toMatchObject({ reasoning_effort: 'low', temperature: 0 });
    expect(p.corpo.max_tokens).toBeGreaterThan(1000);

    const semPensar = montarPedidoGemini({ id: 'gemini-3.7-flash', chave: CHAVE, pensa: false }, params).corpo;
    expect(semPensar.reasoning_effort).toBeUndefined();
    expect(semPensar.max_tokens).toBe(1000);
  });

  it('gemma: sem mensagem system — o sistema vai no começo da mensagem do usuário', () => {
    const { corpo } = montarPedidoGemini({ id: 'gemma-4-31b-it', chave: CHAVE, pensa: false }, params);
    expect(corpo.messages).toEqual([{ role: 'user', content: 'SISTEMA\n\nPERGUNTA' }]);
    expect(corpo.reasoning_effort).toBeUndefined();
  });
});

describe('provedores.js: identidade e família', () => {
  it('sem prefixo = Gemini; "gemini:" é o prefixo do único provedor', () => {
    expect(separar('gemini-3.8-flash')).toEqual({ provedor: 'gemini', id: 'gemini-3.8-flash', prefixado: false });
    expect(normalizar('gemini-3.8-flash')).toBe('gemini:gemini-3.8-flash');
    expect(normalizar('gemini:gemma-4-31b-it')).toBe('gemini:gemma-4-31b-it');
  });

  it('ids antigos (prefixo de outro provedor, ou sem prefixo com "/") são lidos sem quebrar', () => {
    expect(separar('openrouter:nvidia/x:free')).toEqual({ provedor: 'openrouter', id: 'nvidia/x:free', prefixado: true });
    expect(separar('anthropic:claude-x')).toMatchObject({ provedor: 'anthropic', id: 'claude-x' });
    // ":" depois da "/" não é prefixo.
    expect(separar('nvidia/nemotron-3-ultra-550b-a55b:free')).toEqual({
      provedor: 'gemini',
      id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      prefixado: false,
    });
    // Outro fabricante não casa com modelo Gemini.
    for (const antigo of ['anthropic:x', 'nvidia/x:free']) {
      expect(excluido('gemini:gemini-3.8-flash', [antigo])).toBe(false);
      expect(excluido('gemini:gemma-4-31b-it', [antigo])).toBe(false);
    }
  });

  it('mesmos pesos por outro provedor contam como o mesmo modelo (o autor não confere a si mesmo)', () => {
    expect(idBase('openrouter:google/gemma-4-31b-it:free')).toBe('gemma-4-31b-it');
    expect(idBase('gemini:models/Gemma-4-31B-it')).toBe('gemma-4-31b-it');
    expect(idBase('nvidia/x:free')).toBe('nvidia/x');
    expect(exclui('google/gemma-4-31b-it:free', 'gemini:gemma-4-31b-it')).toBe(true);
    expect(exclui('openrouter:google/gemma-4-31b-it:free', 'gemini:gemma-4-31b-it')).toBe(true);
    expect(exclui('models/gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    expect(exclui('Gemini:gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    // Lote misto (gemma antigo + flash novo): nenhum dos dois autores confere.
    const ordem = ordenarConferentes(
      ['gemini:gemma-4-31b-it', 'gemini:gemma-4-26b-a4b-it', 'gemini:gemini-3.8-flash', 'gemini:gemini-flash-latest'],
      ['google/gemma-4-31b-it:free', 'gemini:gemini-3.8-flash']
    );
    expect(ordem).not.toContain('gemini:gemma-4-31b-it');
    expect(ordem).not.toContain('gemini:gemini-3.8-flash');
  });

  it('família: gemma ou gemini; ids antigos de outro fabricante têm família própria', () => {
    expect(familia('gemini:gemini-3.8-flash')).toBe('gemini');
    expect(familia('gemini-flash-latest')).toBe('gemini');
    expect(familia('gemini:gemma-4-31b-it')).toBe('gemma');
    expect(familia('gemma-4-26b-a4b-it')).toBe('gemma');
    expect(familia('modelo-teste')).toBe('gemini');
    expect(familia('openrouter:google/gemma-4-31b-it:free')).toBe('gemma');
    expect(familia('nvidia/nemotron-3-ultra-550b-a55b:free')).toBe('nvidia');
    expect(familia('anthropic:claude-x')).toBe('anthropic');
  });

  it('--excluir: com ou sem "gemini:" é o mesmo modelo', () => {
    expect(exclui('gemini:gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    expect(exclui('gemini-3.8-flash', 'gemini:gemini-3.8-flash')).toBe(true);
    expect(exclui('gemini-3.8-flash', 'gemini-3.8-flash')).toBe(true);
    expect(excluido('gemini:gemini-3.7-flash', ['gemini:gemini-3.8-flash'])).toBe(false);
  });

  it('conferentes: outra família primeiro, o gerador nunca', () => {
    const candidatos = [
      'gemini:gemma-4-31b-it',
      'gemini:gemma-4-26b-a4b-it',
      'gemini:gemini-3.8-flash',
      'gemini:gemini-3.7-flash',
    ];
    expect(ordenarConferentes(candidatos, ['gemini:gemini-3.8-flash'])).toEqual([
      'gemini:gemma-4-31b-it',
      'gemini:gemma-4-26b-a4b-it',
      'gemini:gemini-3.7-flash',
    ]);
    // Gerador gemma (GEMINI_MODELOS apontando para um gemma): flash primeiro.
    expect(ordenarConferentes(candidatos, ['gemma-4-31b-it'])).toEqual([
      'gemini:gemini-3.8-flash',
      'gemini:gemini-3.7-flash',
      'gemini:gemma-4-26b-a4b-it',
    ]);
  });
});

describe('gemini.js: raciocínio do gemma no texto e tempo limite', () => {
  // Formato real do gemma-4 pela rota compatível (out/2026): o raciocínio
  // vem em `content`, com rascunhos de lista, antes da resposta.
  const real =
    '<thought>*   Constraint: Respond ONLY in JSON: `[{"id": 123, "aprovada": false, "problemas": ["..."]}]`.\n' +
    '    *   Item 7: `aprovada: true`.</thought>```json\n[\n  {"id": 7, "aprovada": true, "problemas": []}\n]\n```';

  it('tira o bloco <thought> e deixa só a resposta', () => {
    expect(semRaciocinio(real)).toBe('```json\n[\n  {"id": 7, "aprovada": true, "problemas": []}\n]\n```');
  });

  it('sem bloco: devolve o texto como veio (aparado)', () => {
    expect(semRaciocinio('  [{"id": 1}]  ')).toBe('[{"id": 1}]');
  });

  it('bloco aberto e nunca fechado (resposta cortada): não sobra resposta', () => {
    expect(semRaciocinio('<thought>pensando [{"id": 7, "aprovada": true}]')).toBe('');
  });

  it('maiúsculas, espaço antes, atributo na tag e bloco fechado seguido de um aberto', () => {
    expect(semRaciocinio('\n  <THOUGHT>a [1]</Thought>[2]')).toBe('[2]');
    expect(semRaciocinio('<thought type="x">a [1]</thought >[2]')).toBe('[2]');
    expect(semRaciocinio('< thought>a [1]')).toBe('');
    expect(semRaciocinio('<think>a</think><thought>b [{"id": 1}]')).toBe('');
  });

  it('<think> e <thinking> também saem; texto nulo vira vazio', () => {
    expect(semRaciocinio('<think>a</think><thinking>b</thinking>ok')).toBe('ok');
    expect(semRaciocinio(null)).toBe('');
  });

  it('gemma tem tempo limite maior que os flash', () => {
    expect(timeoutDe('gemini-3.8-flash')).toBe(TIMEOUT_MS);
    expect(timeoutDe('gemma-4-31b-it')).toBe(TIMEOUT_GEMMA_MS);
    expect(TIMEOUT_GEMMA_MS).toBeGreaterThan(TIMEOUT_MS);
  });
});
