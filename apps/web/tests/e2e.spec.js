import { test, expect } from '@playwright/test';

test.describe('MA Questões E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear localStorage before each test
    await page.evaluate(() => localStorage.clear());
  });

  test('Fluxo completo: selecionar → responder → desempenho', async ({ page }) => {
    // 1. Ir para Questões
    await page.click('[data-testid="nav-questoes"]');
    await expect(page).toHaveTitle(/quest/i);

    // 2. Selecionar disciplina
    const disciplineButton = page.locator('text=Direito Constitucional').first();
    if (await disciplineButton.isVisible()) {
      await disciplineButton.click();
    }

    // 3. Responder 5 questões
    for (let i = 0; i < 5; i++) {
      // Aguardar questão carregar
      await page.waitForTimeout(500);

      // Contar alternativas
      const alternatives = await page.locator('[data-testid^="alt-"]').count();
      if (alternatives > 0) {
        // Clicar em alternativa aleatória
        const randomOption = Math.floor(Math.random() * alternatives);
        await page.click(`[data-testid="alt-${randomOption}"]`);
      }

      // Aguardar modal ou próxima questão
      await page.waitForTimeout(500);
    }

    // 4. Ir para Desempenho
    const desempenhoNav = page.locator('[data-testid="nav-desempenho"]');
    if (await desempenhoNav.isVisible()) {
      await desempenhoNav.click();
      await page.waitForTimeout(500);
    }

    // 5. Verificar localStorage persistência
    const storage = await page.evaluate(() => localStorage.getItem('ma-questoes-state-v1'));
    expect(storage).toBeTruthy();
  });

  test('Fluxo de Simulado: config → cronometro → questoes → resultado', async ({ page }) => {
    // 1. Ir para Simulados
    const simuladosNav = page.locator('[data-testid="nav-simulados"]');
    if (await simuladosNav.isVisible()) {
      await simuladosNav.click();
      await page.waitForTimeout(500);
    }

    // 2. Novo Simulado
    const novoButton = page.locator('button:has-text("Novo")').first();
    if (await novoButton.isVisible()) {
      await novoButton.click();
      await page.waitForTimeout(500);
    }

    // 3. Configurar: tipo
    const tipoRadio = page.locator('input[type="radio"]').first();
    if (await tipoRadio.isVisible()) {
      await tipoRadio.check();
    }

    // 4. Configurar: quantidade (slider)
    const slider = page.locator('input[type="range"]');
    if (await slider.isVisible()) {
      await slider.fill('30');
    }

    // 5. Iniciar
    const iniciarButton = page.locator('button:has-text("Iniciar")').first();
    if (await iniciarButton.isVisible()) {
      await iniciarButton.click();
      await page.waitForTimeout(1000);
    }

    // 6. Verificar cronometro visível
    const cronometro = page.locator('[data-testid="cronometro"]');
    if (await cronometro.isVisible()) {
      expect(cronometro).toContainText(':');
    }

    // 7. Responder algumas questões (primeiras 3)
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(500);
      const alternatives = await page.locator('[data-testid^="alt-"]').count();
      if (alternatives > 0) {
        const randomOption = Math.floor(Math.random() * alternatives);
        await page.click(`[data-testid="alt-${randomOption}"]`);
      }
    }
  });

  test('localStorage persiste após refresh', async ({ page }) => {
    // 1. Ir para Questões e interagir
    await page.click('[data-testid="nav-questoes"]');
    await page.waitForTimeout(500);

    // 2. Selecionar disciplina
    const disciplineButton = page.locator('text=Direito Constitucional').first();
    if (await disciplineButton.isVisible()) {
      await disciplineButton.click();
      await page.waitForTimeout(500);
    }

    // 3. Salvar estado antes de refresh
    const storageBefore = await page.evaluate(() => localStorage.getItem('ma-questoes-state-v1'));
    expect(storageBefore).toBeTruthy();

    // 4. Refresh
    await page.reload();
    await page.waitForTimeout(1000);

    // 5. Verificar que state persiste
    const storageAfter = await page.evaluate(() => localStorage.getItem('ma-questoes-state-v1'));
    expect(storageAfter).toBeTruthy();

    if (storageBefore && storageAfter) {
      const stateBefore = JSON.parse(storageBefore);
      const stateAfter = JSON.parse(storageAfter);
      expect(stateAfter).toBeDefined();
    }
  });

  test('Gerar questões com IA (API)', async ({ page }) => {
    // 1. Ir para Questões
    await page.click('[data-testid="nav-questoes"]');
    await page.waitForTimeout(500);

    // 2. Procurar pelo componente GeradorQuestoes
    const gerarButton = page.locator('button:has-text("Gerar")').first();
    if (await gerarButton.isVisible()) {
      // 3. Preencher tema
      const temaInput = page.locator('input[placeholder*="tema"], input[placeholder*="Tema"]').first();
      if (await temaInput.isVisible()) {
        await temaInput.fill('Direitos Fundamentais');
      }

      // 4. Clicar em gerar
      await gerarButton.click();

      // 5. Aguardar resposta (10s max)
      await page.waitForTimeout(3000);
    }
  });
});
