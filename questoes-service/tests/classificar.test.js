// A classificação é a única coisa neste serviço que um modelo escreve no
// banco. O teste existe para provar que ela não consegue escrever mais do que
// disciplina e tema, e que só escreve rótulo de uma lista fechada.
//
// Nenhuma chamada de rede: `chamarModelo` é injetado, e cada teste devolve a
// resposta que quer exercitar — inclusive as respostas ruins, que são o motivo
// do arquivo.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const { pool } = require('../app');
const { migrate } = require('../migrate');
const { classificar, interpretarResposta } = require('../classificar');

const EXAME_TESTE = 97;

const limpar = () => pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);

async function inserir(numero, campos = {}) {
  const { rows } = await pool.query(
    `INSERT INTO questoes
       (exame, tipo_prova, numero, ano, enunciado, alternativas, gabarito, disciplina, tema, disciplina_fonte)
     VALUES ($1,1,$2,2025,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      EXAME_TESTE,
      numero,
      campos.enunciado || `Enunciado da questão ${numero}, com texto suficiente.`,
      JSON.stringify(['alfa', 'beta', 'gama', 'delta']),
      campos.gabarito ?? 1,
      campos.disciplina ?? null,
      campos.tema ?? null,
      campos.disciplina_fonte ?? null,
    ]
  );
  return rows[0].id;
}

const buscar = async (id) => {
  const { rows } = await pool.query(
    'SELECT disciplina, tema, disciplina_fonte, revisada, gabarito, enunciado, alternativas FROM questoes WHERE id = $1',
    [id]
  );
  return rows[0];
};

// Devolve sempre a mesma resposta, e registra quantas vezes foi chamado.
const modeloQueResponde = (texto) => {
  const espiao = jest.fn(async () => ({ conteudo: texto, modelo: 'teste' }));
  return espiao;
};

beforeAll(async () => {
  await migrate(pool);
  await limpar();
});

afterEach(limpar);

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('interpretarResposta', () => {
  const lote = [{ id: 1 }, { id: 2 }];

  it('aceita disciplina copiada da lista', () => {
    const { aceitas, recusadas } = interpretarResposta(
      '[{"id":1,"disciplina":"Direito Penal","tema":"Furto"}]',
      lote
    );
    expect(recusadas).toHaveLength(0);
    expect(aceitas).toEqual([{ id: 1, disciplina: 'Direito Penal', tema: 'Furto' }]);
  });

  it('recusa disciplina que não está na lista', () => {
    for (const inventada of ['Direito Civil e Empresarial', 'D. Penal', 'direito penal', 'Direito Espacial']) {
      const { aceitas, recusadas } = interpretarResposta(
        `[{"id":1,"disciplina":${JSON.stringify(inventada)},"tema":"x"}]`,
        lote
      );
      expect(aceitas).toHaveLength(0);
      expect(recusadas[0].motivo).toMatch(/fora da lista/);
    }
  });

  it('recusa id que não estava no lote', () => {
    const { aceitas, recusadas } = interpretarResposta(
      '[{"id":999,"disciplina":"Direito Penal","tema":"x"}]',
      lote
    );
    expect(aceitas).toHaveLength(0);
    expect(recusadas[0].motivo).toMatch(/fora do lote/);
  });

  it('aceita o modelo dizendo que não sabe', () => {
    const { aceitas, recusadas } = interpretarResposta('[{"id":1,"disciplina":null}]', lote);
    expect(aceitas).toHaveLength(0);
    expect(recusadas[0].motivo).toMatch(/não soube/);
  });

  it('sobrevive a cerca de markdown em volta do JSON', () => {
    const { aceitas } = interpretarResposta(
      '```json\n[{"id":2,"disciplina":"Direito Civil","tema":"Mora"}]\n```',
      lote
    );
    expect(aceitas).toEqual([{ id: 2, disciplina: 'Direito Civil', tema: 'Mora' }]);
  });

  it('lança quando não há JSON nenhum, em vez de devolver lista vazia', () => {
    // Vazio silencioso viraria "nenhuma questão classificada" e a rodada
    // seguiria como se o modelo tivesse recusado tudo — escondendo que ele
    // na verdade respondeu qualquer coisa.
    expect(() => interpretarResposta('Desculpe, não posso ajudar.', lote)).toThrow();
    expect(() => interpretarResposta('[{"id":1,', lote)).toThrow();
  });
});

describe('classificar', () => {
  it('grava disciplina, tema e a marca de origem — e nada além disso', async () => {
    const id = await inserir(1);
    const antes = await buscar(id);

    const resumo = await classificar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: () => {},
      chamarModelo: modeloQueResponde(
        `[{"id":${id},"disciplina":"Direito Tributário","tema":"Imunidade"}]`
      ),
    });

    expect(resumo.gravadas).toBe(1);

    const depois = await buscar(id);
    expect(depois.disciplina).toBe('Direito Tributário');
    expect(depois.tema).toBe('Imunidade');
    expect(depois.disciplina_fonte).toBe('ia');

    // A metade da tabela que é fato da FGV não pode ter sido tocada.
    expect(depois.gabarito).toBe(antes.gabarito);
    expect(depois.enunciado).toBe(antes.enunciado);
    expect(depois.alternativas).toEqual(antes.alternativas);

    // E a questão continua não revisada: classificar não é conferir.
    expect(depois.revisada).toBe(false);
  });

  it('não grava nada sem --aplicar', async () => {
    const id = await inserir(1);

    const resumo = await classificar({
      exame: EXAME_TESTE,
      aplicar: false,
      log: () => {},
      chamarModelo: modeloQueResponde(`[{"id":${id},"disciplina":"Direito Penal","tema":"Furto"}]`),
    });

    expect(resumo.aceitas).toBe(1);
    expect(resumo.gravadas).toBe(0);
    expect((await buscar(id)).disciplina).toBeNull();
  });

  it('não toca em questão já classificada', async () => {
    const jaFeita = await inserir(1, { disciplina: 'Direito Civil', tema: 'Posse', disciplina_fonte: 'humano' });
    const pendente = await inserir(2);

    const espiao = modeloQueResponde(
      `[{"id":${pendente},"disciplina":"Direito Penal","tema":"Roubo"}]`
    );

    await classificar({ exame: EXAME_TESTE, aplicar: true, log: () => {}, chamarModelo: espiao });

    // O prompt enviado não pode nem ter mencionado a questão já classificada.
    expect(espiao.mock.calls[0][0]).not.toContain(String(jaFeita));

    const intacta = await buscar(jaFeita);
    expect(intacta.disciplina).toBe('Direito Civil');
    expect(intacta.disciplina_fonte).toBe('humano');
  });

  it('um lote que falha não derruba a rodada', async () => {
    await inserir(1);
    await inserir(2);

    const resumo = await classificar({
      exame: EXAME_TESTE,
      lote: 1,
      aplicar: true,
      log: () => {},
      chamarModelo: jest.fn(async () => {
        throw new Error('503 do provedor');
      }),
    });

    expect(resumo.lotesComErro).toBe(2);
    expect(resumo.gravadas).toBe(0);
  });

  it('resposta com disciplina inventada deixa a questão pendente para a próxima rodada', async () => {
    const id = await inserir(1);

    await classificar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: () => {},
      chamarModelo: modeloQueResponde(`[{"id":${id},"disciplina":"Direito Digital","tema":"LGPD"}]`),
    });

    // Fica NULL: o próximo `classificar` a pega de novo. Uma disciplina
    // inventada gravada seria permanente, porque ninguém releria o que já
    // tem rótulo.
    expect((await buscar(id)).disciplina).toBeNull();
  });

  it('classifica em lotes até acabar a fila', async () => {
    const ids = [];
    for (let n = 1; n <= 5; n++) ids.push(await inserir(n));

    const chamarModelo = jest.fn(async (prompt) => {
      const doLote = ids.filter((id) => prompt.includes(`"id": ${id}`));
      return {
        conteudo: JSON.stringify(
          doLote.map((id) => ({ id, disciplina: 'Direito Ambiental', tema: 'Licenciamento' }))
        ),
        modelo: 'teste',
      };
    });

    const resumo = await classificar({ exame: EXAME_TESTE, lote: 2, aplicar: true, log: () => {}, chamarModelo });

    expect(resumo.gravadas).toBe(5);
    // 5 questões em lotes de 2: três chamadas, e não uma só com tudo.
    expect(chamarModelo).toHaveBeenCalledTimes(3);
  });
});
