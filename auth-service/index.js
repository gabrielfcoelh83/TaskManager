const { app, pool } = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🔐 Auth Service rodando em http://localhost:${PORT}`);
  // Teste de conexão com BD
  pool.query('SELECT NOW()', (err) => {
    if (err) console.error('Erro ao conectar ao BD:', err);
    else console.log('✅ Conectado ao banco de dados');
  });
});
