// A tabela de blocos vira `disciplina_fonte = 'prova'`, a fonte em que se
// confia sem olhar. Um bloco deslocado de uma posição gravaria a disciplina
// errada em todas as questões da fronteira, de todos os exames daquela
// tabela, com cara de fato da banca. Estes testes são a conferência mecânica
// do que a leitura dos cadernos conferiu à mão.

const { DISCIPLINAS, TABELAS_POR_EXAME, disciplinaPorPosicao } = require('../disciplinas');

describe('tabelas de blocos', () => {
  for (const [exame, { blocos, tipos }] of Object.entries(TABELAS_POR_EXAME)) {
    describe(`${exame}º Exame`, () => {
      it('cobre 1..80 sem buraco nem sobreposição', () => {
        // Contíguo: cada bloco começa logo depois do anterior. Isto pega ao
        // mesmo tempo buraco (questão sem disciplina) e sobreposição (questão
        // em dois blocos, e o `find` escolheria o primeiro em silêncio).
        let esperado = 1;
        for (const [nome, primeira, ultima] of blocos) {
          expect({ nome, primeira }).toEqual({ nome, primeira: esperado });
          expect(ultima).toBeGreaterThanOrEqual(primeira);
          esperado = ultima + 1;
        }
        expect(esperado).toBe(81);
      });

      it('soma 80 questões', () => {
        const soma = blocos.reduce((s, [, a, b]) => s + (b - a + 1), 0);
        expect(soma).toBe(80);
      });

      it('só usa disciplinas da lista oficial, cada uma num bloco só', () => {
        const nomes = blocos.map(([nome]) => nome);
        for (const nome of nomes) expect(DISCIPLINAS).toContain(nome);
        expect(new Set(nomes).size).toBe(nomes.length);
      });

      it('toda posição tem disciplina, em todo tipo listado', () => {
        // O tipo 1 é o que o acervo importa; uma tabela sem ele não serve.
        expect(tipos).toContain(1);
        for (const tipo of tipos) {
          for (let n = 1; n <= 80; n++) {
            expect(disciplinaPorPosicao(Number(exame), tipo, n)).not.toBeNull();
          }
        }
      });
    });
  }
});

describe('disciplinaPorPosicao — fronteiras conferidas no 44º e 45º', () => {
  // Última questão de cada bloco e primeira do seguinte. Cada par foi lido no
  // caderno; se alguém mexer na tabela, é aqui que a mudança aparece.
  const fronteiras = [
    [8, 'Ética Profissional'], [9, 'Filosofia do Direito'],
    [10, 'Filosofia do Direito'], [11, 'Direito Constitucional'],
    [16, 'Direito Constitucional'], [17, 'Direitos Humanos'],
    [18, 'Direitos Humanos'], [19, 'Direito Eleitoral'],
    [20, 'Direito Eleitoral'], [21, 'Direito Internacional'],
    [22, 'Direito Internacional'], [23, 'Direito Financeiro'],
    [24, 'Direito Financeiro'], [25, 'Direito Tributário'],
    [29, 'Direito Tributário'], [30, 'Direito Administrativo'],
    [34, 'Direito Administrativo'], [35, 'Direito Ambiental'],
    [36, 'Direito Ambiental'], [37, 'Direito Civil'],
    [42, 'Direito Civil'], [43, 'Direito da Criança e do Adolescente'],
    [44, 'Direito da Criança e do Adolescente'], [45, 'Direito do Consumidor'],
    [46, 'Direito do Consumidor'], [47, 'Direito Empresarial'],
    [50, 'Direito Empresarial'], [51, 'Direito Processual Civil'],
    [56, 'Direito Processual Civil'], [57, 'Direito Penal'],
    [62, 'Direito Penal'], [63, 'Direito Processual Penal'],
    [68, 'Direito Processual Penal'], [69, 'Direito Previdenciário'],
    [70, 'Direito Previdenciário'], [71, 'Direito do Trabalho'],
    [75, 'Direito do Trabalho'], [76, 'Direito Processual do Trabalho'],
    [1, 'Ética Profissional'], [80, 'Direito Processual do Trabalho'],
  ];

  for (const exame of [44, 45]) {
    it.each(fronteiras)(`${exame}º, questão %i → %s`, (numero, disciplina) => {
      expect(disciplinaPorPosicao(exame, 1, numero)).toBe(disciplina);
    });
  }

  it('aceita número vindo como string (o `pg` devolve SMALLINT como number, JSON às vezes não)', () => {
    expect(disciplinaPorPosicao('45', '1', '19')).toBe('Direito Eleitoral');
  });
});

describe('disciplinaPorPosicao — o que a tabela não conhece devolve null', () => {
  it('exame sem tabela conferida', () => {
    // Não existe "padrão para o resto": aplicar a tabela a um exame que
    // ninguém conferiu é gravar palpite com a marca de fato.
    expect(disciplinaPorPosicao(43, 1, 19)).toBeNull();
    expect(disciplinaPorPosicao(46, 1, 1)).toBeNull();
    expect(disciplinaPorPosicao(99, 1, 1)).toBeNull();
  });

  it('tipo de prova não conferido naquele exame', () => {
    // No 45º só o tipo 1 foi lido. Que os tipos do 44º preservem os blocos
    // é forte indício, não conferência.
    expect(disciplinaPorPosicao(45, 2, 19)).toBeNull();
    expect(disciplinaPorPosicao(45, 4, 1)).toBeNull();
  });

  it('tipos 2 a 4 do 44º usam a mesma tabela (embaralham só dentro do bloco)', () => {
    for (const tipo of [2, 3, 4]) {
      expect(disciplinaPorPosicao(44, tipo, 19)).toBe('Direito Eleitoral');
      expect(disciplinaPorPosicao(44, tipo, 63)).toBe('Direito Processual Penal');
    }
  });

  it('tipo fora de 1..4', () => {
    expect(disciplinaPorPosicao(44, 5, 1)).toBeNull();
  });

  it('número fora de 1..80', () => {
    expect(disciplinaPorPosicao(45, 1, 0)).toBeNull();
    expect(disciplinaPorPosicao(45, 1, 81)).toBeNull();
  });
});

describe('lista oficial', () => {
  it('inclui as disciplinas que a lista antiga da IA não tinha', () => {
    expect(DISCIPLINAS).toContain('Direito Eleitoral');
    expect(DISCIPLINAS).toContain('Direito Financeiro');
  });

  it('é a mesma que o classificar.js usa', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
    // Mesmo objeto, não só mesmo conteúdo: uma cópia poderia bater hoje e
    // divergir no próximo edital.
    expect(require('../classificar').DISCIPLINAS).toBe(DISCIPLINAS);
  });
});
