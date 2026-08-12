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

// A tentativa mais recente do usuário, direto da API. O GET já devolve da
// mais nova para a mais antiga, então a primeira linha é a que acabou de ser
// respondida.
function ultimaTentativa(page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('ma-questoes-token-v1');
    if (!token) return null;
    const res = await fetch('/api/tentativas?limite=1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json())[0] || null;
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

  // O critério de pronto da fatia 2. Mesma forma do teste acima, porque o
  // dado é o mesmo tipo de dado: coletado na tela, gravado no servidor, e a
  // prova é ele continuar lá depois de o navegador ser esvaziado.
  test('o "foi chute" sobrevive ao localStorage apagado', async ({ page }) => {
    // Segura o POST da tentativa por 1,5s. Sem este atraso o teste não
    // exerce o problema que a ADR-001 existe para resolver: em localhost o
    // POST volta em milissegundos, muito antes de o Playwright conseguir
    // clicar no feedback, e a janela em que o `id` ainda não chegou nunca
    // se abre. Com o atraso, ler o id do estado (a alternativa rejeitada
    // pela ADR) falha aqui, e segurar a promessa passa.
    // Casa por `pathname` e não por glob: `**/api/tentativas` só não pega os
    // GETs porque eles levam `?limite=`, o que é precisão por acidente — no
    // dia em que um GET vier sem query, o teste passaria a segurar a leitura
    // também e ninguém entenderia por quê.
    await page.route(
      (url) => url.pathname === '/api/tentativas',
      async (route) => {
        if (route.request().method() === 'POST') {
          await new Promise((r) => setTimeout(r, 1500));
        }
        await route.continue();
      }
    );

    // Contagem antes, como no teste da fatia 1: sem isto o teste se contenta
    // com "existe uma tentativa marcada como chute", e a das execuções
    // anteriores serve. Foi assim que uma primeira versão deste teste passou
    // com o feedback indo parar na tentativa errada.
    const inicial = await contarTentativas(page);

    await page.click('[data-testid="nav-questoes"]');
    await page.click('button:has-text("Gerar quiz")');

    const alternativa = page.locator('[data-testid="alt-0"]');
    await expect(alternativa).toBeVisible();
    await alternativa.click();

    // O modal abre no mesmo instante em que o POST sai, então este clique
    // acontece com a gravação ainda em voo — que é o ponto.
    await page.click('button:has-text("Foi chute")');

    // Primeiro espera a tentativa NOVA existir. Enquanto o POST atrasado não
    // chega, a "mais recente" ainda é a de antes — e cobrar o feedback dela
    // aprovaria justamente o bug que a ADR-001 evita.
    await expect.poll(() => contarTentativas(page), { timeout: 15000 }).toBe(inicial + 1);

    // Só agora, e sobre ela: o feedback tem de estar na tentativa desta
    // resposta, não em alguma outra do histórico.
    await expect.poll(() => ultimaTentativa(page), { timeout: 15000 }).toMatchObject({
      tipo: 'chute',
      certeza: 30,
    });

    const nova = await ultimaTentativa(page);
    const questaoId = nova.questao_id;

    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SENHA);
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();

    // A segunda metade da afirmação, e a que faltava: não basta o dado
    // estar no servidor, o front tem de ler. Chamar `listarTentativas` do
    // módulo real exercita `paraFormatoLocal` — que antes desta fatia
    // devolvia `tipo: null` fixo e passaria por qualquer asserção feita
    // com `fetch` direto na API.
    // Depende do dev server do Vite servir o fonte cru em /src — que é como
    // o `webServer` do playwright.config sobe o app. Se um dia a suíte passar
    // a rodar contra o build, este import precisa virar outra coisa (expor a
    // função no `window` em modo de teste, por exemplo) em vez de sumir.
    const doFront = await page.evaluate(async ({ qId, id }) => {
      const api = await import('/src/lib/api.js');
      const porQuestao = await api.listarTentativas();
      const tentativas = porQuestao[qId]?.tentativas || [];
      // Pela id, não pela posição: a questão pode ter histórico anterior.
      return tentativas.find((t) => String(t.id) === String(id)) || null;
    }, { qId: questaoId, id: nova.id });

    expect(doFront).toMatchObject({ tipo: 'chute', certeza: 30 });
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

// ---------------------------------------------------------------------------
// Quem está usando o app, e o que é preferência da conta
// ---------------------------------------------------------------------------
//
// Até esta fatia o front respondia "quem é você?" com uma linha de código:
//
//   configuracoes: { name: 'Maria Laís', email: 'maria.lais@email.com', ... }
//
// Todo mundo que entrava virava Maria Laís, e a data da prova era uma
// constante ('2027-02-28') sem nenhum campo que a editasse. Estes testes
// existem porque nada disso quebrava a tela: o app ficava verde mostrando o
// nome de outra pessoa.
test.describe('Perfil e preferências', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  // Conta nova a cada execução: o nome tem de vir do servidor, e reusar uma
  // conta fixa esconderia um front que só lê o que ele mesmo salvou antes.
  async function criarConta(page, nome) {
    const email = `perfil-${Date.now()}@exemplo.test`;
    await page.click('[data-testid="trocar-modo"]');
    await page.fill('[data-testid="campo-nome"]', nome);
    await page.fill('input[type="email"]', email);
    await page.fill('#campo-senha', 'senha-de-teste-123');
    await page.fill('[data-testid="campo-confirmacao"]', 'senha-de-teste-123');
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();
    return email;
  }

  test('a tela mostra o nome de quem entrou, não um nome fixo', async ({ page }) => {
    await criarConta(page, 'Joana Ribeiro');

    // O perfil vem do user-service, criado pelo evento `user.registered`, e
    // pode demorar um instante depois do cadastro.
    await expect(page.locator('[data-testid="perfil-nome"]')).toHaveText('Joana Ribeiro', { timeout: 10000 });

    // A saudação usa só o primeiro nome, e o avatar as iniciais do primeiro e
    // do último — "JR", não "JO".
    await expect(page.locator('text=Olá, Joana!')).toBeVisible();
    await expect(page.locator('[data-testid="avatar"]')).toHaveText('JR');

    // A afirmação que pega a regressão inteira: o nome que estava escrito no
    // código não pode aparecer em lugar nenhum desta sessão.
    await expect(page.locator('body')).not.toContainText('Maria Laís');
  });

  test('meta e data da prova ficam na conta, não no navegador', async ({ page }) => {
    const email = await criarConta(page, 'Preferências');

    await page.click('[data-testid="nav-configuracoes"]');

    // O e-mail é o do cadastro e não é editável: trocá-lo aqui mudaria só o
    // user-service, e o login continuaria com o antigo.
    await expect(page.locator('input[readonly]')).toHaveValue(email);

    await page.fill('[data-testid="campo-meta"]', '7');
    await page.fill('[data-testid="campo-data-prova"]', '2030-03-10');

    // Espera a preferência chegar ao servidor antes de apagar o navegador —
    // é justamente o que o teste quer provar que aconteceu.
    await expect.poll(async () => page.evaluate(async () => {
      const token = localStorage.getItem('ma-questoes-token-v1');
      const id = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id;
      const res = await fetch(`/api/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      return (await res.json())?.profile_data?.meta ?? null;
    }), { timeout: 10000 }).toBe(7);

    // Navegador zerado: só sobrevive o que está na conta.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.fill('input[type="email"]', email);
    await page.fill('#campo-senha', 'senha-de-teste-123');
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();

    // A meta voltou: o dashboard mostra 0/7, e não o padrão 0/20.
    await expect(page.locator('text=0/7 questões')).toBeVisible({ timeout: 10000 });

    // E a data também: o topo conta os dias em vez de pedir a data.
    await expect(page.locator('text=para a prova da OAB')).toBeVisible();
    await expect(page.locator('text=Definir data')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Revisões: as abas que não filtravam
// ---------------------------------------------------------------------------
//
// O código era `let filtered = all` com dois `if` que quase nunca casavam:
// clicar em "Errei" listava o acervo inteiro, com a etiqueta vermelha "Errei"
// colada até em questão acertada. Um teste que só contasse linhas continuaria
// verde; por isso estes cobram a MESMA questão em duas abas diferentes.
test.describe('Revisões', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test('a questão respondida sai de "nunca respondi" e cai na aba certa', async ({ page }) => {
    await page.click('[data-testid="nav-questoes"]');
    await page.click('[data-testid="gerar-quiz"]');

    const enunciado = await page.locator('[data-testid="enunciado"]').innerText();
    await page.click('[data-testid="alt-0"]');

    // A própria tela diz se foi acerto ou erro; o teste não precisa conhecer o
    // gabarito do acervo de teste para saber onde a questão deve aparecer.
    const acertou = await page.locator('text=Acertou!').isVisible();
    await page.click('text=Foi chute');

    await page.click('[data-testid="nav-revisoes"]');

    // Respondida é respondida: não pode continuar em "Nunca respondi".
    await page.click('[data-testid="aba-aberto"]');
    await expect(page.locator('body')).not.toContainText(enunciado);

    await page.click('[data-testid="aba-errei"]');
    if (acertou) {
      // O bug antigo aparecia exatamente aqui: acertada listada em "Errei".
      await expect(page.locator('body')).not.toContainText(enunciado);
    } else {
      await expect(page.locator('body')).toContainText(enunciado);
    }
  });

  test('"Revisar agora" abre um quiz com a questão escolhida', async ({ page }) => {
    // Responde uma questão aqui mesmo em vez de contar com o que outro teste
    // deixou: a aba "Nunca respondi" fica vazia depois que a suíte percorre o
    // acervo de teste, e um teste que depende da ordem de execução é um teste
    // que quebra sozinho.
    await page.click('[data-testid="nav-questoes"]');
    await page.click('[data-testid="gerar-quiz"]');
    await expect(page.locator('[data-testid="alt-0"]')).toBeVisible();
    await page.click('[data-testid="alt-0"]');
    await page.click('text=Foi chute');

    await page.click('[data-testid="nav-revisoes"]');
    await page.click('[data-testid="aba-menor"]');

    const primeiroItem = page.locator('[data-testid^="revisao-item-"]').first();
    await expect(primeiroItem).toBeVisible();

    const id = (await primeiroItem.getAttribute('data-testid')).replace('revisao-item-', '');
    const naLista = await page.locator(`[data-testid="revisao-enunciado-${id}"]`).innerText();

    // O botão existia e não fazia nada: era um `<button>` sem onClick.
    await page.click(`[data-testid="revisar-${id}"]`);

    const enunciado = page.locator('[data-testid="enunciado"]');
    await expect(enunciado).toBeVisible();

    // A questão aberta tem de ser AQUELA, e não uma qualquer do acervo.
    expect(await enunciado.innerText()).toBe(naLista);
  });
});

// ---------------------------------------------------------------------------
// Todas as telas abrem
// ---------------------------------------------------------------------------
//
// Metade das telas do menu não aparecia em teste nenhum — e são justamente as
// que passaram a calcular tudo a partir do histórico. Um `undefined.map()` em
// qualquer uma delas apaga a página inteira (o React desmonta a árvore) e o
// resto da suíte continua verde, porque ninguém clica ali.
//
// Este teste não verifica conteúdo: verifica que a tela monta, que o título
// dela aparece e que nada explodiu no console.
test.describe('Todas as telas', () => {
  const TELAS = [
    ['dashboard', 'Vamos continuar rumo'],
    ['cronograma', 'Uma sugestão de semana'],
    ['questoes', 'gabarito oficial da FGV'],
    ['simulados', 'condições reais de prova'],
    ['revisoes', 'O que você errou'],
    ['desempenho', 'Acompanhe sua evolução'],
    ['estatisticas', 'Números detalhados'],
    ['favoritos', 'marcou como favoritas'],
    ['disciplinas', 'aproveitamento em cada matéria'],
    ['anotacoes', 'guardados neste navegador'],
    ['configuracoes', 'Preferências da sua conta'],
  ];

  test('cada item do menu abre a tela correspondente, sem erro no console', async ({ page }) => {
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') erros.push(msg.text());
    });

    await entrar(page);

    for (const [tela, marca] of TELAS) {
      await page.click(`[data-testid="nav-${tela}"]`);
      await expect(page.locator(`text=${marca}`).first()).toBeVisible({ timeout: 5000 });
      // A barra lateral tem de continuar de pé: se a tela quebrou, o React
      // desmonta a árvore inteira e nem o menu sobra.
      await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();
    }

    // Um erro no console aqui costuma ser exatamente o `undefined.map()` que
    // este teste existe para pegar.
    expect(erros).toEqual([]);
  });

  test('as telas de detalhe também abrem: disciplina e anotação', async ({ page }) => {
    await entrar(page);

    await page.click('[data-testid="nav-disciplinas"]');
    const verTemas = page.locator('button:has-text("Ver temas")').first();
    if (await verTemas.isVisible()) {
      await verTemas.click();
      await expect(page.locator('text=Temas')).toBeVisible();
      await page.click('text=Voltar às disciplinas');
    }

    // O caderno começa vazio: criar e apagar é o ciclo inteiro da tela.
    await page.click('[data-testid="nav-anotacoes"]');
    await page.click('[data-testid="nova-anotacao"]');
    await expect(page.locator('textarea')).toBeVisible();
    await page.locator('textarea').fill('Anotação de teste');
    await page.click('[data-testid="apagar-anotacao"]');
    await expect(page.locator('text=Crie uma com o botão')).toBeVisible();
  });
});
