const { app, pool, escutarEventos } = require('./app');
const { migrate } = require('./migrate');

const PORT = process.env.PORT || 3002;

// Migrations antes de aceitar tráfego. Se falharem, o processo morre: o
// smoke test não passa, e o rollback devolve a versão anterior. Subir com
// schema errado seria pior — a aplicação responderia dando erro em cada
// requisição, e o pipeline consideraria o deploy bem-sucedido.
migrate(pool)
  .then(() => {
    escutarEventos().catch((err) => console.error('Falha ao escutar eventos:', err.message));

    app.listen(PORT, () => {
      console.log(`👥 User Service rodando em http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Falha nas migrations:', err.message);
    process.exit(1);
  });
