// Roda os testes de lib/: todo `tests/*.test.js`, menos os que precisam de
// servidor no ar.
//
// Um laço, e não uma lista no package.json, porque a lista foi o que deixou
// `test:estado` e `test:questoes` fora da CI desde que nasceram: cada teste
// novo precisava lembrar de entrar no script e no workflow, e nenhum entrou.
// Passavam na máquina de quem escreveu e nenhum PR os rodava. Com o laço,
// arquivo novo em tests/ roda na próxima CI sem ninguém lembrar de nada.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chamam o gateway, o dev-api e serviços pagos: rodam em passo próprio da CI,
// com o backend no ar (`test:api` no ci.yml).
const PRECISAM_DE_SERVIDOR = new Set(['api.test.js']);

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'tests');

const arquivos = readdirSync(pasta)
  .filter((f) => f.endsWith('.test.js') && !PRECISAM_DE_SERVIDOR.has(f))
  .sort();

// Zero arquivos é pasta renomeada ou filtro quebrado, não "tudo passou".
if (arquivos.length === 0) {
  console.error('Nenhum teste de lib encontrado em tests/.');
  process.exit(1);
}

// Um teste de lib termina em segundos. O teto existe para o que não termina —
// um `setInterval` esquecido, uma promessa que nunca resolve —, que sem ele
// prenderia o job por horas e, no ci.yml, o e2e, o build e o deploy atrás.
const TEMPO_MAXIMO_MS = 60_000;

// Roda todos antes de reprovar: quem abriu o PR vê de uma vez tudo o que
// quebrou, em vez de consertar um arquivo por rodada de CI.
const reprovados = [];
for (const arquivo of arquivos) {
  console.log(`\n▶ ${arquivo}`);
  const { status, signal, error } = spawnSync(process.execPath, [path.join(pasta, arquivo)], {
    stdio: 'inherit',
    cwd: raiz,
    timeout: TEMPO_MAXIMO_MS,
  });
  if (status !== 0) {
    // Sem isto, processo morto por sinal ou por tempo reprovava sem dizer
    // por quê: o log mostrava só o nome do arquivo e seguia para o próximo.
    const motivo = error?.code === 'ETIMEDOUT'
      ? `passou de ${TEMPO_MAXIMO_MS / 1000}s`
      : signal ? `morto por ${signal}` : `saiu com código ${status}`;
    console.error(`✖ ${arquivo}: ${motivo}`);
    reprovados.push(arquivo);
  }
}

if (reprovados.length > 0) {
  console.error(`\n❌ ${reprovados.length} de ${arquivos.length} arquivo(s) reprovado(s): ${reprovados.join(', ')}`);
  process.exit(1);
}

console.log(`\n✅ ${arquivos.length} arquivo(s) de teste de lib passaram.`);
