// Carrega no banco o JSON produzido pelo importador.
//
//   node carregar.js oab45.json
//
// Separado do importador de propósito: a extração precisa de poppler e
// tesseract, que não têm por que existir na imagem do serviço. Aqui só
// entra JSON já validado.
//
// A carga é IDEMPOTENTE. Rodar de novo corrige o que mudou em vez de
// duplicar — é o que permite reimportar um exame depois de a FGV publicar
// retificação de gabarito, que acontece todo exame.
//
// A DISCIPLINA também entra aqui, quando a tabela de disciplinas.js conhece o
// exame e o tipo: ela vem da posição da questão no caderno, que é decisão da
// banca, e sai marcada `disciplina_fonte = 'prova'`. Exame sem tabela
// conferida entra sem disciplina e fica para a IA (classificar.js).

const fs = require('fs');
const { pool } = require('./app');
const { migrate } = require('./migrate');
const { disciplinaPorPosicao } = require('./disciplinas');

const CAMPOS_OBRIGATORIOS = ['exame', 'tipo_prova', 'numero', 'enunciado', 'alternativas', 'gabarito'];

// `porPosicao` é injetável para o teste usar um exame fictício: os exames que
// a tabela real conhece são acervo de verdade, e a suíte apaga o que cria.
async function carregar(caminho, { porPosicao = disciplinaPorPosicao, log = console.log } = {}) {
  const questoes = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  if (!Array.isArray(questoes) || questoes.length === 0) {
    throw new Error('arquivo vazio ou não é uma lista');
  }

  // Conferência antes de abrir transação: o schema recusaria de qualquer
  // forma, mas errar aqui dá mensagem que diz qual questão está torta.
  questoes.forEach((q, i) => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (q[campo] === undefined || q[campo] === null) {
        throw new Error(`questão ${i}: falta ${campo}`);
      }
    }
    if (!Array.isArray(q.alternativas) || q.alternativas.length !== 4) {
      throw new Error(`questão ${q.numero}: precisa de 4 alternativas`);
    }
    if (!Number.isInteger(q.gabarito) || q.gabarito < 0 || q.gabarito > 3) {
      throw new Error(`questão ${q.numero}: gabarito ${q.gabarito} fora da faixa`);
    }
  });

  const client = await pool.connect();
  try {
    // Um exame inteiro entra ou não entra. Meio exame carregado é pior que
    // exame nenhum, porque o app mostraria um simulado incompleto sem
    // nenhum sinal de que falta algo.
    await client.query('BEGIN');

    let inseridas = 0;
    let atualizadas = 0;
    let comDisciplina = 0;

    for (const q of questoes) {
      const disciplina = porPosicao(q.exame, q.tipo_prova, q.numero);

      // Sobre a disciplina, no ON CONFLICT:
      //  - tabela sem resposta (null) → mantém o que já havia; "não sei" não
      //    apaga classificação de ninguém;
      //  - fonte 'humano' → mantém; alguém olhou e decidiu, e uma recarga de
      //    rotina não pode desfazer isso;
      //  - fonte NULL, 'ia' ou 'prova' → a posição vale. 'prova' entra na
      //    lista para que uma correção da tabela chegue às questões já
      //    carregadas.
      // As duas colunas repetem a mesma condição porque, no SET, cada
      // expressão enxerga a linha ANTIGA — é o que garante que a fonte e o
      // nome mudem juntos ou não mudem.
      const { rows } = await client.query(
        `INSERT INTO questoes
           (exame, tipo_prova, numero, banca, ano, enunciado, alternativas, gabarito, anulada,
            disciplina, disciplina_fonte)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text,
                 CASE WHEN $10::text IS NULL THEN NULL ELSE 'prova' END)
         ON CONFLICT (exame, tipo_prova, numero) DO UPDATE SET
           enunciado     = EXCLUDED.enunciado,
           alternativas  = EXCLUDED.alternativas,
           gabarito      = EXCLUDED.gabarito,
           anulada       = EXCLUDED.anulada,
           disciplina    = CASE
             WHEN EXCLUDED.disciplina IS NOT NULL
              AND questoes.disciplina_fonte IS DISTINCT FROM 'humano'
             THEN EXCLUDED.disciplina ELSE questoes.disciplina END,
           disciplina_fonte = CASE
             WHEN EXCLUDED.disciplina IS NOT NULL
              AND questoes.disciplina_fonte IS DISTINCT FROM 'humano'
             THEN 'prova' ELSE questoes.disciplina_fonte END,
           atualizada_em = NOW()
         RETURNING (xmax = 0) AS nova`,
        [q.exame, q.tipo_prova, q.numero, q.banca || 'FGV', q.ano || null,
         q.enunciado, JSON.stringify(q.alternativas), q.gabarito, q.anulada === true,
         disciplina]
      );
      if (disciplina) comDisciplina++;
      // xmax = 0 distingue INSERT de UPDATE no ON CONFLICT — sem isso não
      // dá para saber se a carga acrescentou ou só reescreveu.
      rows[0].nova ? inseridas++ : atualizadas++;
    }

    await client.query('COMMIT');
    log(`✅ ${inseridas} inserida(s), ${atualizadas} atualizada(s)`);
    // Dizer quantas ficaram sem disciplina da prova é o que avisa que o
    // exame não tem tabela conferida e vai depender da IA.
    log(`   ${comDisciplina} com disciplina pela posição na prova, ` +
        `${questoes.length - comDisciplina} sem tabela para (exame, tipo)`);
    return { inseridas, atualizadas, comDisciplina };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { carregar };

if (require.main === module) {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('uso: node carregar.js <arquivo.json>');
    process.exit(1);
  }

  migrate(pool)
    .then(() => carregar(caminho))
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
