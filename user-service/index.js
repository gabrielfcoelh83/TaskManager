const { app, pool, escutarEventos } = require('./app');

const PORT = process.env.PORT || 3002;

escutarEventos().catch((err) => console.error('Falha ao escutar eventos:', err.message));

app.listen(PORT, () => {
  console.log(`👥 User Service rodando em http://localhost:${PORT}`);
  pool.query('SELECT NOW()', (err) => {
    if (err) console.error('Erro ao conectar ao BD:', err);
    else console.log('✅ Conectado ao banco de dados');
  });
});
