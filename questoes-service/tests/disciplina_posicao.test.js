// Disciplina pela posição na prova: a carga grava, o backfill corrige, e
// nenhum dos dois passa por cima de uma pessoa.
//
// A tabela real (disciplinas.js) só conhece exames de verdade, e a suíte
// apaga o que cria — rodar contra o 45º arriscaria levar acervo junto. Por
// isso `porPosicao` é injetado com uma tabela de brinquedo para um exame
// fictício. O que se testa aqui é a REGRA de gravação; a tabela tem teste
// próprio em disciplinas.test.js.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { pool } = require('../app');
const { migrate } = require('../migrate');
const { carregar } = require('../carregar');
const { aplicarDisciplinaPosicao, decidir } = require('../aplicar_disciplina_posicao');
const { classificar } = require('../classificar');

const EXAME_TESTE = 96;

// 1..2 Penal, 3..4 Processual Penal, só no tipo 1 do exame de teste.
const porPosicao = (exame, tipo, numero) => {
  if (exame !== EXAME_TESTE || tipo !== 1) return null;
  if (numero <= 2) return 'Direito Penal';
  if (numero <= 4) return 'Direito Processual Penal';
  return null;
};

const limpar = () => pool.query('DELETE FROM questoes WHERE exame = $1', [EXAME_TESTE]);
const silencio = () => {};

const questao = (numero, tipo = 1) => ({
  exame: EXAME_TESTE,
  tipo_prova: tipo,
  numero,
  ano: 2025,
  enunciado: `Enunciado da questão ${numero}, com texto suficiente para passar.`,
  alternativas: ['alfa', 'beta', 'gama', 'delta'],
  gabarito: 2,
  anulada: false,
});

function arquivo(questoes) {
  const caminho = path.join(os.tmpdir(), `carga-teste-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(caminho, JSON.stringify(questoes));
  return caminho;
}

const linha = async (numero, tipo = 1) => {
  const { rows } = await pool.query(
    `SELECT id, disciplina, disciplina_fonte, tema, tema_fonte, gabarito, enunciado
       FROM questoes WHERE exame = $1 AND tipo_prova = $2 AND numero = $3`,
    [EXAME_TESTE, tipo, numero]
  );
  return rows[0];
};

const marcar = (numero, campos) =>
  pool.query(
    `UPDATE questoes SET disciplina = $2, disciplina_fonte = $3, tema = $4, tema_fonte = $5
      WHERE exame = $1 AND tipo_prova = 1 AND numero = $6`,
    [EXAME_TESTE, campos.disciplina, campos.disciplina_fonte, campos.tema ?? null, campos.tema_fonte ?? null, numero]
  );

beforeAll(async () => {
  await migrate(pool);
  await limpar();
});

afterEach(limpar);

afterAll(async () => {
  await limpar();
  await pool.end();
});

describe('migration 004', () => {
  it("aceita 'prova' como fonte da disciplina e recusa o que não conhece", async () => {
    await carregar(arquivo([questao(5)]), { porPosicao, log: silencio });
    await expect(marcar(5, { disciplina: 'Direito Penal', disciplina_fonte: 'prova' })).resolves.toBeDefined();
    await expect(marcar(5, { disciplina: 'Direito Penal', disciplina_fonte: 'posicao' })).rejects.toThrow(
      /disciplina_fonte_valida/
    );
  });

  it("não aceita 'prova' como fonte do tema: a banca não dá tema", async () => {
    await carregar(arquivo([questao(5)]), { porPosicao, log: silencio });
    await expect(
      marcar(5, { disciplina: null, disciplina_fonte: null, tema: 'Furto', tema_fonte: 'prova' })
    ).rejects.toThrow(/tema_fonte_valida/);
  });
});

describe('carregar', () => {
  it("grava a disciplina da posição com fonte 'prova' quando a tabela conhece o exame", async () => {
    const r = await carregar(arquivo([questao(1), questao(3), questao(5)]), { porPosicao, log: silencio });

    expect(r.comDisciplina).toBe(2);
    expect(await linha(1)).toMatchObject({ disciplina: 'Direito Penal', disciplina_fonte: 'prova' });
    expect(await linha(3)).toMatchObject({ disciplina: 'Direito Processual Penal', disciplina_fonte: 'prova' });
    // Posição que a tabela não conhece entra sem disciplina e sem fonte.
    expect(await linha(5)).toMatchObject({ disciplina: null, disciplina_fonte: null });
  });

  it('tipo de prova sem tabela entra sem disciplina', async () => {
    await carregar(arquivo([questao(1, 2)]), { porPosicao, log: silencio });
    expect(await linha(1, 2)).toMatchObject({ disciplina: null, disciplina_fonte: null });
  });

  it("recarga corrige disciplina da IA, mas NUNCA a de uma pessoa", async () => {
    const caminho = arquivo([questao(1), questao(2), questao(3)]);
    await carregar(caminho, { porPosicao, log: silencio });

    await marcar(1, { disciplina: 'Direito Civil', disciplina_fonte: 'ia', tema: 'Posse', tema_fonte: 'ia' });
    await marcar(2, { disciplina: 'Direito Constitucional', disciplina_fonte: 'humano' });
    await marcar(3, { disciplina: null, disciplina_fonte: null });

    await carregar(caminho, { porPosicao, log: silencio });

    // IA errada → posição, e o tema dela fica, com a fonte dele intacta.
    expect(await linha(1)).toMatchObject({
      disciplina: 'Direito Penal', disciplina_fonte: 'prova', tema: 'Posse', tema_fonte: 'ia',
    });
    // Pessoa → intocada, mesmo discordando da tabela.
    expect(await linha(2)).toMatchObject({ disciplina: 'Direito Constitucional', disciplina_fonte: 'humano' });
    // Vazia → preenchida.
    expect(await linha(3)).toMatchObject({ disciplina: 'Direito Processual Penal', disciplina_fonte: 'prova' });
  });

  it('recarga sem tabela para o exame não apaga a disciplina que já existia', async () => {
    const caminho = arquivo([questao(5)]);
    await carregar(caminho, { porPosicao, log: silencio });
    await marcar(5, { disciplina: 'Direito Civil', disciplina_fonte: 'ia' });

    await carregar(caminho, { porPosicao, log: silencio });

    expect(await linha(5)).toMatchObject({ disciplina: 'Direito Civil', disciplina_fonte: 'ia' });
  });
});

describe('aplicar_disciplina_posicao', () => {
  beforeEach(async () => {
    // Carga SEM tabela, para simular o acervo que entrou antes dela.
    await carregar(arquivo([1, 2, 3, 4, 5].map((n) => questao(n))), {
      porPosicao: () => null,
      log: silencio,
    });
    await marcar(1, { disciplina: 'Direito Penal', disciplina_fonte: 'ia', tema: 'Furto', tema_fonte: 'ia' });
    await marcar(2, { disciplina: 'Direito Civil', disciplina_fonte: 'ia' });
    await marcar(3, { disciplina: 'Direito Penal', disciplina_fonte: 'humano' });
    // 4 fica NULL; 5 não tem posição na tabela.
    await marcar(5, { disciplina: 'Direito Civil', disciplina_fonte: 'ia' });
  });

  it('em conferência mostra o que mudaria e não grava nada', async () => {
    const r = await aplicarDisciplinaPosicao({ exame: EXAME_TESTE, porPosicao, log: silencio });

    expect({ preenchida: r.preenchida, corrigida: r.corrigida, confirmada: r.confirmada }).toEqual({
      preenchida: 1, corrigida: 1, confirmada: 1,
    });
    expect(r.gravadas).toBe(0);
    expect(r.mudancas.find((m) => m.numero === 2)).toMatchObject({
      de: 'Direito Civil', para: 'Direito Penal', tipo: 'corrigida',
    });
    expect(await linha(2)).toMatchObject({ disciplina: 'Direito Civil', disciplina_fonte: 'ia' });
  });

  it("com --aplicar grava, e deixa 'humano' e posição desconhecida como estavam", async () => {
    const r = await aplicarDisciplinaPosicao({ exame: EXAME_TESTE, porPosicao, aplicar: true, log: silencio });
    expect(r.gravadas).toBe(3);

    // IA certa: só a fonte muda. O tema e a fonte do tema ficam.
    expect(await linha(1)).toMatchObject({
      disciplina: 'Direito Penal', disciplina_fonte: 'prova', tema: 'Furto', tema_fonte: 'ia',
    });
    expect(await linha(2)).toMatchObject({ disciplina: 'Direito Penal', disciplina_fonte: 'prova' });
    // 'humano' discorda da tabela (3 é Processual Penal) e continua valendo.
    expect(await linha(3)).toMatchObject({ disciplina: 'Direito Penal', disciplina_fonte: 'humano' });
    expect(await linha(4)).toMatchObject({ disciplina: 'Direito Processual Penal', disciplina_fonte: 'prova' });
    expect(await linha(5)).toMatchObject({ disciplina: 'Direito Civil', disciplina_fonte: 'ia' });
  });

  it('rodar de novo não muda nada', async () => {
    await aplicarDisciplinaPosicao({ exame: EXAME_TESTE, porPosicao, aplicar: true, log: silencio });
    const r = await aplicarDisciplinaPosicao({ exame: EXAME_TESTE, porPosicao, aplicar: true, log: silencio });
    expect(r.mudancas).toHaveLength(0);
    expect(r.gravadas).toBe(0);
  });

  it("decidir recusa 'humano' mesmo que a consulta o traga", () => {
    const q = { id: 1, exame: EXAME_TESTE, tipo_prova: 1, numero: 3, disciplina: 'Direito Penal', disciplina_fonte: 'humano' };
    expect(decidir(q, porPosicao)).toBeNull();
  });
});

describe('classificar com disciplina da prova', () => {
  it('pede só o tema e não deixa o modelo trocar a disciplina', async () => {
    await carregar(arquivo([questao(3)]), { porPosicao, log: silencio });
    const { id } = await linha(3);
    const antes = await linha(3);

    const chamarModelo = jest.fn(async () => ({
      // O modelo "discorda" da prova. Tem de ser ignorado.
      conteudo: JSON.stringify([{ id: Number(id), disciplina: 'Direito Penal', tema: 'Cadeia de custódia' }]),
      modelo: 'teste',
    }));

    const r = await classificar({ exame: EXAME_TESTE, aplicar: true, log: silencio, chamarModelo });

    expect(r.gravadas).toBe(1);
    // O prompt levou a disciplina pronta.
    expect(chamarModelo.mock.calls[0][0]).toContain('"disciplina": "Direito Processual Penal"');

    const depois = await linha(3);
    expect(depois).toMatchObject({
      disciplina: 'Direito Processual Penal',
      disciplina_fonte: 'prova',
      tema: 'Cadeia de custódia',
      tema_fonte: 'ia',
    });
    expect(depois.gabarito).toBe(antes.gabarito);
    expect(depois.enunciado).toBe(antes.enunciado);
  });

  it("questão sem disciplina continua recebendo disciplina da lista fechada, com fonte 'ia'", async () => {
    await carregar(arquivo([questao(5)]), { porPosicao, log: silencio });
    const { id } = await linha(5);

    await classificar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: async () => ({
        conteudo: JSON.stringify([{ id: Number(id), disciplina: 'Direito Eleitoral', tema: 'Propaganda' }]),
        modelo: 'teste',
      }),
    });

    expect(await linha(5)).toMatchObject({
      disciplina: 'Direito Eleitoral', disciplina_fonte: 'ia', tema: 'Propaganda', tema_fonte: 'ia',
    });
  });

  it("não escreve tema se, entre a leitura e a escrita, a disciplina mudou", async () => {
    await carregar(arquivo([questao(5)]), { porPosicao, log: silencio });
    const { id } = await linha(5);

    const r = await classificar({
      exame: EXAME_TESTE,
      aplicar: true,
      log: silencio,
      chamarModelo: async () => {
        // Uma pessoa classifica enquanto o modelo pensa.
        await marcar(5, { disciplina: 'Direito Civil', disciplina_fonte: 'humano' });
        return {
          conteudo: JSON.stringify([{ id: Number(id), disciplina: 'Direito Penal', tema: 'Furto' }]),
          modelo: 'teste',
        };
      },
    });

    expect(r.gravadas).toBe(0);
    expect(await linha(5)).toMatchObject({ disciplina: 'Direito Civil', disciplina_fonte: 'humano', tema: null });
  });
});
