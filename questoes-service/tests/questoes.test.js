const request = require('supertest');

// A verificação do token é local, então o teste assina JWT de verdade em
// vez de simular o auth-service — exercita o mesmo caminho da produção.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const jwt = require('jsonwebtoken');
const { app, pool } = require('../app');
const { migrate } = require('../migrate');

// Exame fictício, fora da faixa dos exames reais (que vão até o 46º), para
// que a suíte possa apagar tudo dele sem risco de levar acervo junto.
const EXAME_TESTE = 99;

const como = (id) =>
  `Bearer ${jwt.sign({ id, email: `u${id}@exemplo.local` }, process.env.JWT_SECRET)}`;

const TOKEN = como(2001);

const limpar = () => pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);

async function inserir(campos = {}) {
  const q = {
    exame: EXAME_TESTE,
    tipo_prova: 1,
    numero: 1,
    ano: 2025,
    enunciado: 'Enunciado de teste',
    alternativas: ['alfa', 'beta', 'gama', 'delta'],
    gabarito: 1,
    anulada: false,
    disciplina: 'Direito Constitucional',
    tema: 'Direitos Fundamentais',
    explicacao: null,
    explicacao_fonte: null,
    revisada: false,
    ...campos,
  };

  const { rows } = await pool.query(
    `INSERT INTO questoes
       (exame, tipo_prova, numero, ano, enunciado, alternativas, gabarito,
        anulada, disciplina, tema, explicacao, explicacao_fonte, revisada)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [q.exame, q.tipo_prova, q.numero, q.ano, q.enunciado,
     JSON.stringify(q.alternativas), q.gabarito, q.anulada, q.disciplina,
     q.tema, q.explicacao, q.explicacao_fonte, q.revisada]
  );

  return rows[0].id;
}

beforeAll(async () => {
  await migrate(pool); // o teste também exercita as migrations
  await limpar();
});

afterEach(limpar);

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('autenticação', () => {
  it('recusa sem token', async () => {
    const res = await request(app).get('/questoes');
    expect(res.status).toBe(401);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forjado = jwt.sign({ id: 2001 }, 'outro-segredo-qualquer');
    const res = await request(app).get('/questoes').set('Authorization', `Bearer ${forjado}`);
    expect(res.status).toBe(401);
  });
});

describe('GET /questoes', () => {
  it('devolve a questão com o gabarito da FGV', async () => {
    const id = await inserir({ gabarito: 2 });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&paginado=1`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    const q = res.body.questoes.find((x) => x.id === id);
    expect(q.alternativas).toEqual(['alfa', 'beta', 'gama', 'delta']);
    // O índice é o contrato com o front: ele compara com o clique.
    expect(q.gabarito).toBe(2);
    expect(q.alternativas[q.gabarito]).toBe('gama');
  });

  it('omite questões anuladas', async () => {
    const viva = await inserir({ numero: 1 });
    const morta = await inserir({ numero: 2, anulada: true });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&paginado=1`)
      .set('Authorization', TOKEN);

    const ids = res.body.questoes.map((q) => q.id);
    expect(ids).toContain(viva);
    expect(ids).not.toContain(morta);
  });

  it('filtra por disciplina', async () => {
    const consti = await inserir({ numero: 1, disciplina: 'Direito Constitucional' });
    const penal = await inserir({ numero: 2, disciplina: 'Direito Penal' });

    const res = await request(app)
      .get('/questoes?disciplina=Direito Penal&paginado=1')
      .set('Authorization', TOKEN);

    const ids = res.body.questoes.map((q) => q.id);
    expect(ids).toContain(penal);
    expect(ids).not.toContain(consti);
  });

  it('respeita o limite', async () => {
    for (let n = 1; n <= 5; n++) await inserir({ numero: n });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&limite=3&paginado=1`)
      .set('Authorization', TOKEN);

    expect(res.body.questoes).toHaveLength(3);
  });

  it('recusa limite inválido em vez de cair no default', async () => {
    for (const limite of ['abc', '0', '201', '-1']) {
      const res = await request(app)
        .get(`/questoes?limite=${limite}`)
        .set('Authorization', TOKEN);
      expect(res.status).toBe(400);
    }
  });

  it('marca a explicação não revisada, para a tela poder avisar', async () => {
    await inserir({ explicacao: 'texto gerado', explicacao_fonte: 'ia', revisada: false });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&paginado=1`)
      .set('Authorization', TOKEN);

    expect(res.body.questoes[0].explicacao_fonte).toBe('ia');
    expect(res.body.questoes[0].revisada).toBe(false);
  });

  it('sem paginado devolve array puro, como o contrato antigo', async () => {
    await inserir({ numero: 1 });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}`)
      .set('Authorization', TOKEN);

    // O front publicado faz `(resposta || []).map(...)`. Um objeto aqui
    // derruba a tela de questões — foi o que aconteceu quando o envelope
    // entrou sem retrocompatibilidade.
    expect(Array.isArray(res.body)).toBe(true);
    expect(typeof res.body.map).toBe('function');
  });

  it('informa o total do filtro, não o tamanho da página', async () => {
    for (let n = 1; n <= 5; n++) await inserir({ numero: n });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&limite=2&paginado=1`)
      .set('Authorization', TOKEN);

    // É esta diferença que impede uma lista truncada de passar por completa.
    expect(res.body.questoes).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.limite).toBe(2);
    expect(res.body.offset).toBe(0);
  });

  it('pagina sem repetir nem pular questão', async () => {
    for (let n = 1; n <= 5; n++) await inserir({ numero: n });

    const vistos = [];
    for (let offset = 0; offset < 5; offset += 2) {
      const res = await request(app)
        .get(`/questoes?exame=${EXAME_TESTE}&limite=2&offset=${offset}&paginado=1`)
        .set('Authorization', TOKEN);
      expect(res.status).toBe(200);
      vistos.push(...res.body.questoes.map((q) => q.id));
    }

    expect(vistos).toHaveLength(5);
    expect(new Set(vistos).size).toBe(5);
  });

  it('offset além do fim devolve página vazia com o total certo', async () => {
    for (let n = 1; n <= 3; n++) await inserir({ numero: n });

    const res = await request(app)
      .get(`/questoes?exame=${EXAME_TESTE}&limite=10&offset=50&paginado=1`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.questoes).toEqual([]);
    // Sem linha nenhuma não há janela de onde tirar o total: ele vem de uma
    // contagem própria, e precisa continuar correto.
    expect(res.body.total).toBe(3);
  });

  it('recusa offset inválido', async () => {
    for (const offset of ['abc', '-1', '1.5']) {
      const res = await request(app)
        .get(`/questoes?offset=${offset}`)
        .set('Authorization', TOKEN);
      expect(res.status).toBe(400);
    }
  });

  it('recusa offset com aleatorio, que devolveria sorteio e não página', async () => {
    const res = await request(app)
      .get('/questoes?aleatorio=1&offset=10')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/aleatorio/);
  });
});

describe('GET /questoes/:id', () => {
  it('devolve a questão', async () => {
    const id = await inserir();
    const res = await request(app).get(`/questoes/${id}`).set('Authorization', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('404 para id inexistente', async () => {
    const res = await request(app).get('/questoes/99999999').set('Authorization', TOKEN);
    expect(res.status).toBe(404);
  });

  it('400 — e não 500 — para id não numérico', async () => {
    const res = await request(app).get('/questoes/abc').set('Authorization', TOKEN);
    expect(res.status).toBe(400);
  });
});

describe('GET /questoes/disciplinas', () => {
  it('conta por disciplina e não confunde com a rota de :id', async () => {
    await inserir({ numero: 1, disciplina: 'Direito Penal' });
    await inserir({ numero: 2, disciplina: 'Direito Penal' });
    await inserir({ numero: 3, disciplina: 'Direito Civil' });

    const res = await request(app).get('/questoes/disciplinas').set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    const penal = res.body.find((d) => d.disciplina === 'Direito Penal');
    expect(penal.total).toBeGreaterThanOrEqual(2);
  });
});

// As checagens abaixo moram no schema, não no código. São a rede que impede
// uma importação quebrada de virar questão sem resposta certa — o defeito
// que motivou este serviço.
describe('o banco recusa questão malformada', () => {
  it('gabarito fora da faixa das alternativas', async () => {
    await expect(inserir({ gabarito: 4 })).rejects.toThrow();
    await expect(inserir({ gabarito: -1 })).rejects.toThrow();
  });

  it('número de alternativas diferente de quatro', async () => {
    await expect(inserir({ alternativas: ['a', 'b', 'c'] })).rejects.toThrow();
    await expect(inserir({ alternativas: ['a', 'b', 'c', 'd', 'e'] })).rejects.toThrow();
  });

  it('a mesma questão duas vezes no mesmo exame e tipo', async () => {
    await inserir({ numero: 7 });
    await expect(inserir({ numero: 7 })).rejects.toThrow();
  });

  it('mas a mesma numeração em OUTRO tipo de prova é válida', async () => {
    await inserir({ numero: 7, tipo_prova: 1 });
    await expect(inserir({ numero: 7, tipo_prova: 2 })).resolves.toBeDefined();
  });

  it('fonte de explicação fora do vocabulário', async () => {
    await expect(inserir({ explicacao_fonte: 'chute' })).rejects.toThrow();
  });
});
