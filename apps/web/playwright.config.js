import { defineConfig, devices } from '@playwright/test';

// Em sandboxes com browser pré-instalado, aponte PW_CHROMIUM_PATH para o executável
// (ex.: /opt/pw-browsers/chromium) em vez de rodar "playwright install".
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  // Um worker, sempre — e não só no CI.
  //
  // A suíte inteira compartilha UMA conta no backend de testes, e vários
  // testes gravam tentativas nela. Contagem relativa ("tinha 8, agora tem 9")
  // é a única forma de provar que um clique gravou, e ela quebra assim que
  // dois testes escrevem ao mesmo tempo. Antes isto passava na máquina local
  // por sorte: o teste que gravava em paralelo não gravava nada de verdade.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
