import { test, expect } from '@playwright/test';

// As tentativas passaram a morar no servidor, então a suíte deixou de rodar
// só com o navegador: precisa da plataforma no ar (docker compose up) e de um
// usuário cadastrado. É o mesmo princípio dos testes de integração do backend
// — mockar a API esconderia justamente o que estas telas agora dependem.
const EMAIL = process.env.E2E_EMAIL || 'maria.lais@email.com';
const SENHA = process.env.E2E_SENHA || 'senha-de-teste-123';

// Lê direto da API, com o token que o app guardou: mede o que está gravado,
// não o que a tela desenhou.
function contarTentativas(page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('ma-questoes-token-v1');
    if (!token) return -1;
    const res = await fetch('/api/tentativas?limite=1000', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return -1;
    return (await res.json()).length;
  });
}

async function entrar(page) {
  await page.goto('/');
  // Limpar antes de logar: a sessão não pode vazar de um teste para o outro.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SENHA);
  await page.click('button[type="submit"]');

  await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();
}

test.describe('MA Questões E2E', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
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

  // O critério de pronto da fatia 1, tal como escrito em "Arquitetura da
  // fusão": responder, apagar o localStorage, recarregar, e a tentativa
  // continuar lá. Apagar o localStorage derruba a sessão junto, então o
  // teste loga de novo — é justamente isso que prova que o dado veio do
  // servidor, e não de algum resto guardado no navegador.
  test('a tentativa sobrevive ao localStorage apagado', async ({ page }) => {
    // Contagem relativa, não absoluta: os outros testes desta suíte também
    // respondem questões e deixam linhas no banco do mesmo usuário. Afirmar
    // "existe pelo menos uma tentativa" passaria mesmo que este clique não
    // gravasse nada.
    const inicial = await contarTentativas(page);

    await page.click('[data-testid="nav-questoes"]');
    await page.click('button:has-text("Gerar quiz")');

    const alternativa = page.locator('[data-testid="alt-0"]');
    await expect(alternativa).toBeVisible();
    await alternativa.click();

    // poll em vez de timeout fixo: espera o POST que a tela disparou, sem
    // inventar um número de milissegundos que ora sobra, ora falta.
    await expect.poll(() => contarTentativas(page)).toBe(inicial + 1);

    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Sem token o app volta para o login: nada do histórico sobrou local.
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SENHA);
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();

    // A tentativa continua lá, e veio do servidor.
    expect(await contarTentativas(page)).toBe(inicial + 1);

    // A outra metade da afirmação: o estado salvo no navegador não carrega
    // mais tentativa nenhuma, então a sobrevivência não pode ser mérito dele.
    const salvoLocal = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('ma-questoes-state-v1') || '{}')
    );
    expect(salvoLocal.usuarioTentativas).toBeUndefined();
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
