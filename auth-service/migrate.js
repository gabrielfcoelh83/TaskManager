const fs = require('fs');
const path = require('path');

// Chave arbitrária, mas igual em todos os serviços que migram o mesmo banco.
const LOCK_ID = 72727201;

// Aplica os arquivos .sql de migrations/ em ordem, uma única vez cada.
// O controle fica no próprio banco, em schema_migrations — é a única fonte
// de verdade que sobrevive a redeploy, rollback e troca de container.
async function migrate(pool) {
  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) return;

  const client = await pool.connect();
  try {
    // Sem o lock, duas réplicas subindo juntas aplicariam a mesma migration
    // em paralelo. A segunda espera aqui e depois encontra tudo aplicado.
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const aplicadas = new Set(rows.map((r) => r.version));

    const arquivos = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // a ordem vem do prefixo numérico do nome

    let novas = 0;
    for (const arquivo of arquivos) {
      if (aplicadas.has(arquivo)) continue;

      const sql = fs.readFileSync(path.join(dir, arquivo), 'utf8');

      // Cada migration numa transação: ou aplica inteira, ou não aplica nada.
      // Um schema meio migrado é pior que um schema antigo.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [arquivo]);
        await client.query('COMMIT');
        console.log(`🔼 migration aplicada: ${arquivo}`);
        novas++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`falha na migration ${arquivo}: ${err.message}`);
      }
    }

    console.log(novas === 0 ? '✅ schema já atualizado' : `✅ ${novas} migration(s) aplicada(s)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };
