// Aplica a disciplina pela posição na prova às questões já carregadas.
//
//   node aplicar_disciplina_posicao.js                 # mostra o que mudaria
//   node aplicar_disciplina_posicao.js --aplicar       # grava
//   node aplicar_disciplina_posicao.js --exame 45 --aplicar
//
// O carregar.js já grava a disciplina da prova em toda carga nova. Este
// script é para o acervo que entrou ANTES disso, classificado pela IA, e
// para quando a tabela de disciplinas.js ganhar um exame ou for corrigida:
// ele reaplica a tabela sem precisar recarregar o JSON.
//
// O QUE ELE TOCA
// Só `disciplina` e `disciplina_fonte`, e só em questão cuja fonte é NULL,
// 'ia' ou 'prova'. 'humano' nunca: alguém olhou e decidiu, e uma tabela não
// desfaz isso. O tema fica como está — ele descreve o assunto da questão, que
// não muda quando a gaveta muda, e refazê-lo gastaria cota de IA à toa.
//
// Questão de exame ou tipo sem tabela conferida fica como está, com a
// disciplina que tiver. "Não sei" não apaga o palpite de ninguém.

const { pool } = require('./app');
const { migrate } = require('./migrate');
const { disciplinaPorPosicao } = require('./disciplinas');

// Separado da leitura e da escrita para o teste exercitar a decisão sem banco.
// Devolve null quando não há o que mudar.
function decidir(q, porPosicao = disciplinaPorPosicao) {
  if (q.disciplina_fonte === 'humano') return null;

  const pela = porPosicao(q.exame, q.tipo_prova, q.numero);
  if (!pela) return null;

  if (q.disciplina === pela && q.disciplina_fonte === 'prova') return null;

  // `confirmada` separa "a IA tinha acertado, só muda a fonte" de "a IA
  // tinha errado". É essa contagem que diz quanto a classificação por modelo
  // valia — e se vale a pena mantê-la para os exames sem tabela.
  const tipo =
    q.disciplina == null ? 'preenchida' : q.disciplina === pela ? 'confirmada' : 'corrigida';

  return { id: q.id, de: q.disciplina, fonteAntes: q.disciplina_fonte, para: pela, tipo };
}

async function aplicarDisciplinaPosicao({
  exame = null,
  aplicar = false,
  porPosicao = disciplinaPorPosicao,
  log = console.log,
} = {}) {
  const cliente = await pool.connect();
  const resumo = { lidas: 0, preenchida: 0, confirmada: 0, corrigida: 0, gravadas: 0, mudancas: [] };

  try {
    const valores = [];
    let filtro = '';
    if (exame != null) {
      valores.push(exame);
      filtro = 'AND exame = $1';
    }

    // 'humano' já sai na consulta; `decidir` repete a checagem para a regra
    // não depender de quem monta o SELECT.
    const { rows } = await cliente.query(
      `SELECT id, exame, tipo_prova, numero, disciplina, disciplina_fonte
         FROM questoes
        WHERE disciplina_fonte IS DISTINCT FROM 'humano' ${filtro}
        ORDER BY exame DESC, tipo_prova, numero`,
      valores
    );
    resumo.lidas = rows.length;

    for (const q of rows) {
      const m = decidir(q, porPosicao);
      if (!m) continue;
      resumo[m.tipo]++;
      resumo.mudancas.push({ ...m, exame: q.exame, tipo_prova: q.tipo_prova, numero: q.numero });
    }

    for (const m of resumo.mudancas.filter((x) => x.tipo !== 'confirmada')) {
      log(`  ${m.exame}º/t${m.tipo_prova}/${m.numero}  ${m.de ?? '(sem)'} [${m.fonteAntes ?? '-'}] → ${m.para}`);
    }

    if (aplicar && resumo.mudancas.length > 0) {
      // Tudo ou nada, como a carga: meio acervo com a fonte trocada deixaria
      // a contagem de 'ia' × 'prova' mentindo sobre o que foi conferido.
      await cliente.query('BEGIN');
      try {
        for (const m of resumo.mudancas) {
          // O WHERE repete a exclusão de 'humano': entre a leitura e a escrita
          // alguém pode ter corrigido a questão à mão.
          const { rowCount } = await cliente.query(
            `UPDATE questoes
                SET disciplina       = $2,
                    disciplina_fonte = 'prova',
                    atualizada_em    = NOW()
              WHERE id = $1 AND disciplina_fonte IS DISTINCT FROM 'humano'`,
            [m.id, m.para]
          );
          resumo.gravadas += rowCount;
        }
        await cliente.query('COMMIT');
      } catch (err) {
        await cliente.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    cliente.release();
  }

  return resumo;
}

module.exports = { aplicarDisciplinaPosicao, decidir };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--exame');
  const exame = i === -1 ? null : Number(argv[i + 1]);
  const aplicar = argv.includes('--aplicar');

  if (!aplicar) {
    console.log('🔍 Modo de conferência: nada será gravado. Use --aplicar para valer.\n');
  }

  migrate(pool)
    .then(() => aplicarDisciplinaPosicao({ exame, aplicar }))
    .then((r) => {
      console.log(
        `\n${r.lidas} lida(s) (fora 'humano'): ${r.preenchida} sem disciplina → preenchida, ` +
          `${r.corrigida} com disciplina diferente → corrigida, ` +
          `${r.confirmada} já certa → só a fonte vira 'prova'`
      );
      if (aplicar) console.log(`${r.gravadas} gravada(s) no banco`);
      return pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
