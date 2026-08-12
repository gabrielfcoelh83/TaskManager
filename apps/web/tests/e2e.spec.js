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

    // 2. As fontes vêm do acervo do servidor, não de uma lista fixa no front:
    //    enquanto as questões não têm disciplina, elas são agrupadas por
    //    exame. Esperar a primeira aparecer é esperar o GET /api/questoes.
    const primeiraFonte = page.locator('[data-testid^="fonte-"]').first();
    await expect(primeiraFonte).toBeVisible();

    await page.click('[data-testid="gerar-quiz"]');

    // 3. Responder o quiz inteiro, passando pelo modal de feedback a cada
    //    questão.
    //
    // Fechar o modal não é detalhe de teste: ele cobre a tela inteira, e sem
    // responder "como você chegou nessa resposta" não existe próxima questão.
    // Este laço já passou verde sem clicar em nada — o quiz nunca começava, e
    // a contagem de alternativas era zero. As asserções abaixo são o que separa
    // "respondeu tudo" de "não fez nada em silêncio".
    //
    // Quantas questões o quiz tem não é chute: é o tamanho do acervo, e ele
    // vem do servidor. Fixar um número aqui amarraria o teste ao arquivo de
    // seed, que muda.
    const noAcervo = await page.evaluate(async () => {
      const token = localStorage.getItem('ma-questoes-token-v1');
      const res = await fetch('/api/questoes?limite=200', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return (await res.json()).length;
    });
    expect(noAcervo).toBeGreaterThan(0);

    let respondidas = 0;

    // O teto é uma trava contra laço infinito, não a quantidade esperada.
    for (let i = 0; i < noAcervo + 2; i++) {
      const alternativa = page.locator('[data-testid^="alt-"]').first();
      if (!(await alternativa.isVisible())) break;

      await alternativa.click();
      respondidas++;

      const opcao = page.locator('text=Foi chute');
      await expect(opcao).toBeVisible();
      await opcao.click();
    }

    expect(respondidas).toBe(noAcervo);
    await expect(page.locator('text=Quiz concluído!')).toBeVisible();

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

    // 2. Mexer na seleção de fontes — é o que este teste persiste
    const primeiraFonte = page.locator('[data-testid^="fonte-"]').first();
    await expect(primeiraFonte).toBeVisible();
    await primeiraFonte.click();
    await page.waitForTimeout(300);

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
    await page.click('[data-testid="gerar-quiz"]');

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

// Fora do describe acima de propósito: aquele `beforeEach` entra com o usuário
// semeado, e o assunto aqui é justamente não ter conta ainda.
test.describe('Criar conta', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('cria a conta e entra já logada, com histórico vazio', async ({ page }) => {
    // E-mail novo a cada execução: o cadastro grava de verdade, e reusar um
    // fixo faria o segundo `npm run test:e2e` falhar com 409 — teste que só
    // passa em banco limpo é teste que passa uma vez.
    const email = `e2e-${Date.now()}@exemplo.test`;

    await page.click('[data-testid="trocar-modo"]');
    await page.fill('[data-testid="campo-nome"]', 'Teste E2E');
    await page.fill('input[type="email"]', email);
    await page.fill('#campo-senha', 'senha-de-teste-123');
    await page.fill('[data-testid="campo-confirmacao"]', 'senha-de-teste-123');
    await page.click('button[type="submit"]');

    // Entrou sem passar pela tela de login: o /register já devolveu o token.
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();

    // A prova de que a conta é nova e o token é dela: o usuário semeado tem
    // tentativas dos outros testes, este tem zero. Se o cadastro tivesse
    // reaproveitado a sessão anterior, aqui viria um número maior.
    expect(await contarTentativas(page)).toBe(0);
  });

  test('recusa e-mail já cadastrado, e aponta o caminho', async ({ page }) => {
    await page.click('[data-testid="trocar-modo"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('#campo-senha', 'outra-senha-123');
    await page.fill('[data-testid="campo-confirmacao"]', 'outra-senha-123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toContainText('já tem conta');
    // E continua na tela, sem token: 409 não pode deixar sessão pela metade.
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('ma-questoes-token-v1'))).toBeNull();
  });

  test('senha e confirmação diferentes nem chegam ao servidor', async ({ page }) => {
    let chamou = false;
    await page.route('**/api/auth/register', (rota) => {
      chamou = true;
      return rota.continue();
    });

    await page.click('[data-testid="trocar-modo"]');
    await page.fill('input[type="email"]', `e2e-${Date.now()}@exemplo.test`);
    await page.fill('#campo-senha', 'senha-de-teste-123');
    await page.fill('[data-testid="campo-confirmacao"]', 'senha-diferente-123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toContainText('não são iguais');
    expect(chamou).toBe(false);
  });
});

// Fora do describe de "Criar conta": estes testes precisam de sessão ativa, e
// aquele beforeEach começa deslogado de propósito.
test.describe('Acervo vindo do servidor', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  // -------------------------------------------------------------------------
  // O acervo vem do servidor
  // -------------------------------------------------------------------------
  //
  // Estes testes existem porque a troca de mockData por API é invisível na
  // tela: as duas versões desenham uma questão com quatro alternativas. O que
  // muda é a origem — e a origem é justamente o que dá para verificar.

  test('a questão exibida é a que a API mandou, com o gabarito da API', async ({ page }) => {
    const doServidor = await page.evaluate(async () => {
      const token = localStorage.getItem('ma-questoes-token-v1');
      const res = await fetch('/api/questoes?limite=200', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    });

    expect(doServidor.length).toBeGreaterThan(0);

    await page.click('[data-testid="nav-questoes"]');
    await page.click('[data-testid="gerar-quiz"]');

    const alternativas = page.locator('[data-testid^="alt-"]');
    await expect(alternativas.first()).toBeVisible();

    // Casar pelo enunciado, que é único por questão. Casar pelo conjunto de
    // alternativas parece equivalente e não é: duas questões podem ter as
    // mesmas quatro alternativas com gabaritos diferentes, e o `find` traria a
    // errada — o teste então clicaria no índice de outra questão e acusaria um
    // erro de tradução que não existe.
    const enunciado = await page.locator('[data-testid="enunciado"]').innerText();
    const casada = doServidor.find((q) => q.enunciado.trim() === enunciado.trim());
    expect(casada, 'a questão da tela não corresponde a nenhuma questão da API').toBeTruthy();

    // Clicar exatamente na alternativa que a API diz ser a certa. Se a tela
    // usasse outro índice — o erro que a tradução gabarito→correta pode
    // introduzir — o app diria "Errou" para a resposta oficialmente correta.
    await alternativas.nth(casada.gabarito).click();
    await expect(page.locator('text=Acertou!')).toBeVisible();
  });

  test('explicação não revisada aparece etiquetada como tal', async ({ page }) => {
    await page.click('[data-testid="nav-questoes"]');
    await page.click('[data-testid="gerar-quiz"]');

    // O acervo de teste tem uma questão com explicação gerada por IA e não
    // revisada. O quiz é embaralhado, então o teste avança até chegar nela.
    for (let i = 0; i < 12; i++) {
      const alternativa = page.locator('[data-testid="alt-0"]');
      if (!(await alternativa.isVisible())) break;
      await alternativa.click();

      const etiqueta = page.locator('[data-testid="explicacao-nao-revisada"]');
      if (await etiqueta.isVisible()) {
        await expect(etiqueta).toContainText('não revisada');
        return;
      }

      // O modal de feedback cobre a tela entre uma questão e outra.
      const opcao = page.locator('text=Foi chute');
      if (await opcao.isVisible()) await opcao.click();
    }

    throw new Error('nenhuma questão com explicação não revisada apareceu no quiz');
  });

  test('acervo fora do ar vira aviso com botão, não tela vazia', async ({ page }) => {
    // Sem tratamento, uma falha aqui deixaria a tela de questões em branco com
    // um botão "Gerar quiz (0 questões)" desabilitado — o que parece acervo
    // vazio, e não servidor fora do ar.
    await page.route('**/api/questoes*', (rota) => rota.fulfill({ status: 500, body: '{}' }));

    await page.reload();
    await page.click('[data-testid="nav-questoes"]');

    await expect(page.locator('text=O acervo não carregou')).toBeVisible();

    // O botão precisa funcionar de verdade: liberada a rota, tentar de novo
    // tem de trazer o acervo sem recarregar a página.
    await page.unroute('**/api/questoes*');
    await page.click('button:has-text("Tentar de novo")');

    await expect(page.locator('[data-testid="gerar-quiz"]')).toBeVisible();
  });
});
