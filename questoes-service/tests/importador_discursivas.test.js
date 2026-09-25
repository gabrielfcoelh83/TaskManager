// Ponte entre o `npm test` e os testes do parser, que é Python.
//
// O parser das discursivas vive em importador/ (Python, como o importar.py)
// e seus testes são unittest contra recortes reais dos PDFs da FGV. Rodá-los
// daqui é o que os coloca no CI, que só executa `npm test`.
//
// Sem python3 na máquina (a imagem node:*-alpine não tem), a suíte é pulada
// com aviso — MENOS no CI, onde a ausência vira falha: o runner do GitHub
// tem Python, e um parser sem teste passando por verde seria pior que um
// vermelho explicando o porquê.

const { spawnSync } = require('child_process');
const path = require('path');

const DIR = path.join(__dirname, '..', 'importador');
const temPython = spawnSync('python3', ['--version']).status === 0;
const noCI = process.env.CI === 'true';

const descrever = temPython || noCI ? describe : describe.skip;

if (!temPython && !noCI) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  python3 ausente: testes do parser das discursivas PULADOS');
}

descrever('importador de discursivas (python)', () => {
  it('passa nos testes do parser contra os recortes reais da FGV', () => {
    const r = spawnSync(
      'python3',
      ['-B', '-m', 'unittest', '-v', 'test_importar_discursivas'],
      { cwd: DIR, encoding: 'utf8' }
    );
    if (r.status !== 0) {
      // A saída do unittest diz qual caso falhou; sem ela o jest só mostraria
      // "expected 0, received 1".
      throw new Error(`unittest falhou:\n${r.stderr}\n${r.stdout}`);
    }
    expect(r.status).toBe(0);
  });
});
