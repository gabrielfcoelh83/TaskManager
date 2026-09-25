// Carrega no banco o JSON produzido por importador/importar_discursivas.py.
//
//   node carregar_discursivas.js civil44.json [civil45.json ...]
//
// Arquivo separado do carregar.js porque o formato e a tabela são outros, e
// misturar os dois num script com "modo" faria um erro de parâmetro gravar
// discursiva como objetiva — ou o contrário.
//
// A carga é IDEMPOTENTE: upsert por (exame, area, numero). Rodar de novo
// corrige o que mudou — é o que permite trocar o padrão preliminar pelo
// definitivo quando a FGV publicar o segundo.

const fs = require('fs');

const AREAS = ['civil', 'penal', 'trabalho', 'administrativo',
  'constitucional', 'empresarial', 'tributario'];

const naoVazio = (s) => typeof s === 'string' && s.trim() !== '';

// Conferência antes de abrir transação. O schema recusaria boa parte disto,
// mas errar aqui diz QUAL questão está torta, e o schema não olha dentro do
// JSONB dos itens.
function validarDiscursivas(questoes) {
  if (!Array.isArray(questoes) || questoes.length === 0) {
    throw new Error('arquivo vazio ou não é uma lista');
  }

  questoes.forEach((q, i) => {
    const rot = `questão ${i} (exame ${q && q.exame}, nº ${q && q.numero})`;
    if (!q || typeof q !== 'object') throw new Error(`${rot}: não é objeto`);
    if (!Number.isInteger(q.exame) || q.exame < 1) throw new Error(`${rot}: exame inválido`);
    if (!AREAS.includes(q.area)) throw new Error(`${rot}: area "${q.area}" desconhecida`);
    if (!Number.isInteger(q.numero) || q.numero < 1 || q.numero > 4) {
      throw new Error(`${rot}: numero deve ser 1..4`);
    }
    if (!naoVazio(q.enunciado)) throw new Error(`${rot}: enunciado vazio`);
    if (!Array.isArray(q.itens) || q.itens.length < 2 || q.itens.length > 5) {
      throw new Error(`${rot}: precisa de 2 a 5 itens`);
    }
    q.itens.forEach((item, j) => {
      const esperada = 'ABCDE'[j];
      if (!item || item.letra !== esperada) {
        throw new Error(`${rot}: item ${j} deveria ser ${esperada}`);
      }
      if (!naoVazio(item.pergunta)) throw new Error(`${rot}: item ${esperada} sem pergunta`);
      if (typeof item.valor !== 'number' || !(item.valor > 0)) {
        throw new Error(`${rot}: item ${esperada} com valor inválido`);
      }
      if (!naoVazio(item.gabarito)) throw new Error(`${rot}: item ${esperada} sem gabarito`);
    });
  });

  const chaves = questoes.map((q) => `${q.exame}/${q.area}/${q.numero}`);
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) throw new Error(`questão repetida no arquivo: ${repetida}`);
}

// Grava as questões, uma transação por exame. Devolve a contagem.
async function carregarDiscursivas(pool, questoes) {
  validarDiscursivas(questoes);

  const porExame = new Map();
  for (const q of questoes) {
    if (!porExame.has(q.exame)) porExame.set(q.exame, []);
    porExame.get(q.exame).push(q);
  }

  let inseridas = 0;
  let atualizadas = 0;

  for (const [exame, lote] of porExame) {
    const client = await pool.connect();
    try {
      // O exame entra inteiro ou não entra. Três questões de quatro na tela
      // parecem o exame completo, sem sinal nenhum de que falta uma.
      await client.query('BEGIN');
      for (const q of lote) {
        // Só os campos conhecidos vão para o banco: um campo a mais vindo
        // do importador não vira coluna fantasma dentro do JSONB.
        const itens = q.itens.map(({ letra, pergunta, valor, gabarito, distribuicao }) => ({
          letra, pergunta, valor, gabarito,
          ...(naoVazio(distribuicao) ? { distribuicao } : {}),
        }));
        const { rows } = await client.query(
          `INSERT INTO questoes_discursivas (exame, area, numero, enunciado, itens, fonte)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (exame, area, numero) DO UPDATE SET
             enunciado     = EXCLUDED.enunciado,
             itens         = EXCLUDED.itens,
             fonte         = EXCLUDED.fonte,
             atualizada_em = NOW()
           RETURNING (xmax = 0) AS nova`,
          [q.exame, q.area, q.numero, q.enunciado, JSON.stringify(itens), q.fonte || null]
        );
        // xmax = 0 distingue INSERT de UPDATE no ON CONFLICT.
        if (rows[0].nova) inseridas++;
        else atualizadas++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`exame ${exame}: ${err.message}`);
    } finally {
      client.release();
    }
  }

  return { inseridas, atualizadas };
}

module.exports = { validarDiscursivas, carregarDiscursivas };

if (require.main === module) {
  const arquivos = process.argv.slice(2);
  if (arquivos.length === 0) {
    console.error('uso: node carregar_discursivas.js <arquivo.json> [...]');
    process.exit(1);
  }

  // Carregados só aqui: importar ./app exige JWT_SECRET e abre pool, o que
  // os testes de validação não precisam.
  const { pool } = require('./app');
  const { migrate } = require('./migrate');

  (async () => {
    await migrate(pool);
    // Tudo lido e validado antes de gravar qualquer coisa: um arquivo torto
    // no fim da lista não deixa os anteriores carregados pela metade do
    // lote que a pessoa pediu.
    const lotes = arquivos.map((a) => {
      const questoes = JSON.parse(fs.readFileSync(a, 'utf8'));
      try {
        validarDiscursivas(questoes);
      } catch (err) {
        throw new Error(`${a}: ${err.message}`);
      }
      return questoes;
    });
    const { inseridas, atualizadas } = await carregarDiscursivas(pool, lotes.flat());
    console.log(`✅ ${inseridas} inserida(s), ${atualizadas} atualizada(s)`);
  })()
    .then(() => pool.end())
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
