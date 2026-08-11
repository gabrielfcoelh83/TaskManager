const { app, pool } = require('./app');
const { migrate } = require('./migrate');

const PORT = process.env.PORT || 3004;

// Migrations antes de aceitar tráfego. Se falharem, o processo morre: o
// smoke test não passa e o rollback devolve a versão anterior. Subir com
// schema errado seria pior — responderia erro em cada requisição e o
// pipeline consideraria o deploy bem-sucedido.
migrate(pool)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`📚 Estudo Service rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Falha nas migrations:', err.message);
    process.exit(1);
  });
