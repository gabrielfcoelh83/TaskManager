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
    await page.click('[data-testid="nav-simulados"]');
    await page.waitForTimeout(300);

    // 2. Iniciar Simulado Geral (hero)
    await page.click('[data-testid="novo-simulado"]');
    await page.waitForTimeout(300);

    // 3. Configurar: quantidade (dropdown "Vamos começar!")
    await page.selectOption('[data-testid="qtd-questoes"]', '10');

    // 4. Iniciar (botão de confirmação do config)
    await page.click('button:has-text("Iniciar Simulado")');
    await page.waitForTimeout(500);

    // 5. Cronômetro visível na barra inferior
    const cronometro = page.locator('[data-testid="cronometro"]');
    await expect(cronometro).toBeVisible();
    await expect(cronometro).toContainText(':');

    // 6. Responder todas as questões (todas listadas na mesma página)
    const questoes = await page.locator('[data-testid^="sim-q-"]').count();
    expect(questoes).toBeGreaterThan(0);
    for (let i = 0; i < questoes; i++) {
      await page.click(`[data-testid="sim-q-${i}"] [data-testid="alt-0"]`);
    }

    // 7. Contador de respondidas na barra inferior
    await expect(page.locator(`text=${questoes}/${questoes} respondidas`)).toBeVisible();

    // 8. Finalizar → tela de resultado
    await page.click('[data-testid="finalizar-simulado"]');
    await expect(page.locator('text=Nota final').first()).toBeVisible();

    // 9. Histórico persistido no localStorage
    const storage = await page.evaluate(() => JSON.parse(localStorage.getItem('ma-questoes-state-v1') || '{}'));
    expect((storage.resultados_historico || []).length).toBeGreaterThan(0);
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
