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

    // 3. Responder o quiz inteiro, avançando pelo botão de próxima questão.
    //
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

      await expect(page.locator('[data-testid="veredito"]')).toBeVisible();
      await page.click('[data-testid="proxima-questao"]');
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
    await page.click('[data-testid="iniciar-simulado"]');
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

    // A origem é a procedência real do acervo; o rótulo antigo montado à mão
    // virava "PROVA-FGV-BR/undefined" com questão sem ano.
    await expect(page.locator('[data-testid="sim-q-0"] [data-testid="origem-da-questao"]')).not.toContainText(/undefined|null/);

    // 8. Finalizar → tela de resultado
    await page.click('[data-testid="finalizar-simulado"]');
    await expect(page.locator('text=Nota final').first()).toBeVisible();

    // 8b. Revisão questão a questão, com gabarito
    await expect(page.locator('[data-testid^="revisao-q-"]')).toHaveCount(questoes);
    await expect(page.locator('[data-testid="revisao-q-0"]')).toContainText('Gabarito');

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
// Sem VITE_GOOGLE_CLIENT_ID no build (como aqui, e em produção até o Client ID
// ser criado) o botão do Google não aparece e o script dele nem é carregado —
// a tela de login continua a de sempre. O login com o Google em si precisa do
// Google de verdade e não roda em e2e; quem confere o token é testado no
// auth-service.
test('sem Client ID, o login não mostra o Google nem carrega o script dele', async ({ page }) => {
  const pedidosAoGoogle = [];
  page.on('request', (r) => { if (r.url().includes('accounts.google.com')) pedidosAoGoogle.push(r.url()); });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('button[type="submit"]')).toBeVisible();
  await expect(page.locator('[data-testid="login-google"]')).toHaveCount(0);
  expect(pedidosAoGoogle).toEqual([]);
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

      await page.click('[data-testid="proxima-questao"]');
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

  // Token vencido no meio da sessão, descoberto numa gravação e não numa
  // carga. As cargas já levavam ao login; a gravação da meta só punha
  // "Sessão expirada" na faixa de erro e deixava a pessoa numa tela que não
  // salvava mais nada. O 401 aqui é forçado: esperar um token vencer de
  // verdade levaria dias.
  test('sessão que vence ao salvar a meta volta para o login', async ({ page }) => {
    await criarConta(page, 'Sessão Vencida');
    // Sem o perfil carregado a meta nem vai ao servidor — é ele que dá o id.
    await expect(page.locator('[data-testid="perfil-nome"]')).toHaveText('Sessão Vencida', { timeout: 10000 });

    await page.route(
      (url) => url.pathname.startsWith('/api/users/'),
      (rota) => (rota.request().method() === 'PUT'
        ? rota.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Token expirado' }) })
        : rota.continue())
    );

    await page.click('[data-testid="nav-configuracoes"]');
    await page.fill('[data-testid="campo-meta"]', '9');

    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="nav-questoes"]')).toHaveCount(0);
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
    await expect(page.locator('[data-testid="veredito"]')).toBeVisible();
    const acertou = (await page.locator('[data-testid="veredito"]').innerText()).includes('Acertou');

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
    await expect(page.locator('[data-testid="veredito"]')).toBeVisible();

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
// Foco do dia
// ---------------------------------------------------------------------------

test.describe('Foco do dia', () => {
  // O acervo de teste não tem disciplina em nenhuma questão — de propósito,
  // para exercitar o agrupamento por exame da barra lateral. Mas o "Foco de
  // hoje" só sugere matéria que exista classificada, então este cenário se
  // monta aqui, na resposta da API, em vez de no seed compartilhado.
  // Classificar uma linha no seed troca o agrupamento da barra para o app
  // inteiro e derruba dois testes que dependem do modo por exame.
  const ACERVO = [1, 2, 3].map((n) => ({
    id: 9000 + n,
    exame: 97,
    tipo_prova: 1,
    numero: n,
    banca: 'FGV',
    ano: 2025,
    enunciado: `Questão ${n} de ética profissional, montada para o teste do foco do dia.`,
    alternativas: [`q${n} A`, `q${n} B`, `q${n} C`, `q${n} D`],
    gabarito: 1,
    anulada: false,
    disciplina: 'Ética Profissional',
    tema: 'Sigilo profissional',
    explicacao: null,
    explicacao_fonte: null,
    revisada: false,
  }));

  test('o cartão nomeia a matéria e abre o quiz já filtrado nela', async ({ page }) => {
    await page.route('**/api/questoes*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACERVO) }));

    await entrar(page);

    const foco = page.locator('[data-testid="foco-do-dia"]');
    await expect(foco).toBeVisible();

    // O rótulo muda com a meta: 'Estudar X' antes de bater, 'Continuar em X'
    // depois. Os dois nomeiam a matéria, que é o que este teste verifica —
    // antes o cartão dizia só "faltam N questões" e não levava a lugar nenhum.
    const materia = (await foco.innerText()).match(/(?:Estudar|Continuar em) (.+)$/m)?.[1]?.trim();
    expect(materia, 'o cartão precisa nomear a matéria').toBe('Ética Profissional');

    await foco.click();

    // Abre o quiz montado, e não a tela de escolher fontes: a pergunta "qual
    // matéria" já foi respondida pelo plano do dia.
    await expect(page.locator('[data-testid="enunciado"]')).toBeVisible();
    await expect(page.locator('[data-testid="disciplina-da-questao"]')).toHaveText('Ética Profissional');
  });

  test('no dashboard o cartão encolhe, porque o card "Próximo passo" já diz o mesmo', async ({ page }) => {
    await page.route('**/api/questoes*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACERVO) }));

    await entrar(page);
    const foco = page.locator('[data-testid="foco-do-dia"]');

    // No dashboard fica só o caminho: o motivo já está no card central, com
    // mais espaço, e repeti-lo na mesma tela é ruído.
    // O rótulo alterna entre "Estudar X" e "Continuar em X" conforme a meta
    // do dia, e a suíte inteira compartilha a mesma conta — fixar uma das
    // variantes deixa o teste refém da ordem de execução.
    const rotulo = /(?:Estudar|Continuar em) Ética Profissional/;
    const noDashboard = (await foco.innerText()).trim();
    expect(noDashboard).toMatch(rotulo);

    // Fora dele o cartão volta inteiro — ali não há card nenhum dizendo isso.
    await page.click('[data-testid="nav-revisoes"]');
    const foraDoDashboard = (await foco.innerText()).trim();
    expect(foraDoDashboard).toMatch(rotulo);

    // Comparar o tamanho, e não uma frase: o motivo muda com o progresso do
    // dia — "Comece por X" antes da primeira questão, "Faltam N em X" depois —
    // e os testes da suíte dividem a mesma conta. O que a mudança faz é a
    // linha do motivo sumir no dashboard, e é isso que se verifica.
    expect(foraDoDashboard.length, 'fora do dashboard o cartão traz o motivo')
      .toBeGreaterThan(noDashboard.length);
  });
});

// ---------------------------------------------------------------------------
// Simulado por matéria (Disciplinas → "Vamos começar!")
// ---------------------------------------------------------------------------

test.describe('Simulado por matéria', () => {
  // Mesmo motivo do "Foco do dia": o seed não tem disciplina, e classificá-lo
  // mudaria o agrupamento das fontes para a suíte inteira.
  const ACERVO = [1, 2, 3].map((n) => ({
    id: 9100 + n,
    exame: 98,
    tipo_prova: 1,
    numero: n,
    banca: 'FGV',
    ano: null,
    enunciado: `Questão ${n} de direito penal, montada para o teste do simulado por matéria.`,
    alternativas: [`p${n} A`, `p${n} B`, `p${n} C`, `p${n} D`],
    gabarito: 2,
    anulada: false,
    disciplina: 'Direito Penal',
    tema: 'Crimes contra a pessoa',
    explicacao: 'Explicação de teste.',
    explicacao_fonte: 'ia',
    revisada: false,
  }));

  test('"Iniciar Simulado" em Disciplinas abre o formulário com a matéria escolhida', async ({ page }) => {
    await page.route('**/api/questoes*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACERVO) }));

    await entrar(page);
    await page.click('[data-testid="nav-disciplinas"]');
    await page.click('[data-testid="simular-disciplina"]');

    await expect(page.locator('text=Vamos começar!')).toBeVisible();
    await expect(page.locator('[data-testid="disciplina-simulado"]')).toHaveValue('Direito Penal');
    // Pediu 10 (o padrão), a matéria tem 3: a tela avisa em vez de abrir 3 calada.
    await expect(page.locator('[data-testid="aviso-quantidade"]')).toContainText('3 questões');

    await page.click('[data-testid="iniciar-simulado"]');
    await expect(page.locator('[data-testid^="sim-q-"]')).toHaveCount(3);
    // Sem feedback durante a prova: marcar registra a escolha e não revela
    // nada. Primeiro a marcação tem de ter pegado — sem ela, as checagens de
    // ausência abaixo passariam até com o clique perdido.
    await page.click('[data-testid="sim-q-0"] [data-testid="alt-0"]');
    const q0 = page.locator('[data-testid="sim-q-0"]');
    await expect(q0.locator('[data-testid="alt-0"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-testid="contador-respondidas"]')).toHaveText('1/3 respondidas');
    // Maiúscula, e não "gabarito": o cabeçalho da prova diz "o gabarito
    // aparece quando você finalizar", e esse texto pode (e deve) estar ali.
    await expect(q0).not.toContainText('Gabarito');
    await expect(q0).not.toContainText('Sua resposta');
    await expect(q0.locator('[data-testid="veredito"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="veredito"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="revisao-q-"]')).toHaveCount(0);

    // Finaliza sem mandar nada: responder aqui gravaria tentativa de questão
    // que só existe nesta resposta simulada. Desmarcar não existe, então
    // recomeça sem responder.
    await page.reload();
    await page.click('[data-testid="nav-simulados"]');
    // A pré-seleção vale para uma abertura: voltar a Simulados cai no hub.
    await expect(page.locator('[data-testid="hero-simulado-geral"]')).toBeVisible();
    await page.click('[data-testid="simular-materia"]');
    await page.click('[data-testid="iniciar-simulado"]');
    await page.click('[data-testid="finalizar-simulado"]');

    await expect(page.locator('[data-testid="nota-final"]')).toHaveText('0%');
    await expect(page.locator('[data-testid="revisao-q-0"]')).toContainText('Em branco');
    await expect(page.locator('[data-testid="revisao-q-0"] [data-testid="explicacao-nao-revisada"]')).toBeVisible();
  });

  test('"Praticar" abre o quiz da matéria a um clique, em Disciplinas e em Simulados', async ({ page }) => {
    await page.route('**/api/questoes*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACERVO) }));

    await entrar(page);
    await page.click('[data-testid="nav-disciplinas"]');
    await page.click('[data-testid="praticar-disciplina"]');
    await expect(page.locator('[data-testid="fonte-Direito Penal"]')).toBeVisible();
    await expect(page.locator('[data-testid="gerar-quiz"]')).toContainText('3 questões');

    await page.click('[data-testid="nav-simulados"]');
    await page.click('[data-testid="praticar-materia"]');
    await expect(page.locator('[data-testid="gerar-quiz"]')).toContainText('3 questões');
  });

  test('matéria pré-selecionada sem questões explica por que não dá para iniciar', async ({ page }) => {
    await page.route('**/api/questoes*', (rota) =>
      rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACERVO) }));

    await entrar(page);
    // O caminho real é Disciplinas → Simulado com uma matéria que depois some
    // do acervo; aqui a pré-seleção é posta direto no estado salvo.
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('ma-questoes-state-v1') || '{}');
      st.screen = 'simulados';
      st.simulados = { ...(st.simulados || {}), preDisciplina: 'Direito Tributário' };
      localStorage.setItem('ma-questoes-state-v1', JSON.stringify(st));
    });
    await page.reload();

    await expect(page.locator('text=Vamos começar!')).toBeVisible();
    await expect(page.locator('[data-testid="disciplina-simulado"]')).toHaveValue('Direito Tributário');
    await expect(page.locator('[data-testid="iniciar-simulado"]')).toBeDisabled();
    await expect(page.locator('[data-testid="motivo-desabilitado"]')).toContainText('Direito Tributário não tem questões');
  });
});

test.describe('Simulados com o acervo fora do ar', () => {
  test('erro de carga vira aviso com botão, não "acervo sem questões"', async ({ page }) => {
    let falhar = true;
    await page.route('**/api/questoes*', (rota) => (falhar
      ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'falha simulada' }) })
      : rota.continue()));

    await entrar(page);
    await page.click('[data-testid="nav-simulados"]');

    await expect(page.locator('[data-testid="simulados-acervo-erro"]')).toBeVisible();
    await expect(page.locator('text=O acervo ainda não tem questões carregadas')).toHaveCount(0);
    await expect(page.locator('[data-testid="novo-simulado"]')).toBeDisabled();

    falhar = false;
    await page.click('[data-testid="simulados-acervo-erro"] button:has-text("Tentar de novo")');
    await expect(page.locator('[data-testid="simulados-acervo-erro"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="novo-simulado"]')).toBeEnabled();
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
    const verTemas = page.locator('[data-testid="ver-temas"]').first();
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

  // Duas abas da mesma conta: a nota criada numa aparece na outra sem
  // recarregar, e a outra — que não sabia dela — não a apaga ao editar.
  // Antes, cada aba seguia com o que leu ao abrir, e a primeira edição na
  // desatualizada regravava a chave da conta sem a nota nova.
  test('duas abas da mesma conta veem as anotações uma da outra', async ({ page, context }) => {
    await entrar(page);
    const outra = await context.newPage();
    await outra.goto('/');
    await expect(outra.locator('[data-testid="nav-questoes"]')).toBeVisible();
    await outra.click('[data-testid="nav-anotacoes"]');

    // Tecla por tecla: cada uma é uma gravação, e é aí que um eco atrasado
    // da outra aba faria o texto voltar atrás.
    const texto = `Nota da primeira aba ${Date.now()}`;
    await page.click('[data-testid="nav-anotacoes"]');
    await page.click('[data-testid="nova-anotacao"]');
    await page.locator('textarea').pressSequentially(texto, { delay: 15 });
    await expect(page.locator('textarea')).toHaveValue(texto);

    // A outra aba recebe pelo evento `storage`, sem recarregar.
    await expect(outra.locator('textarea')).toHaveValue(texto, { timeout: 10000 });

    // E editar nela não apaga o que veio da primeira.
    await outra.click('[data-testid="nova-anotacao"]');
    await outra.locator('textarea').fill('Nota da segunda aba');
    await expect(outra.locator('textarea')).toHaveValue('Nota da segunda aba');
    await page.reload();
    await page.click('[data-testid="nav-anotacoes"]');
    await expect(page.locator(`text=Minhas anotações (2)`)).toBeVisible({ timeout: 10000 });
    // As duas estão inteiras na chave da conta, sem eco que tenha cortado o
    // texto digitado tecla por tecla. (Qual nota abre selecionada depende de
    // qual aba gravou a tela por último — não é o que este teste mede.)
    await expect.poll(() => page.evaluate(() => {
      const chave = Object.keys(localStorage).find((k) => k.startsWith('ma-questoes-conta-v1:'));
      return JSON.parse(localStorage.getItem(chave)).anotacoes.itens.map((n) => n.conteudo);
    }), { timeout: 10000 }).toEqual(['Nota da segunda aba', texto]);
  });

  // "Sair" apagava favoritos e anotações de vez: eles só existem neste
  // navegador, e o logout zerava o localStorage para a próxima pessoa não os
  // encontrar. Os dois lados têm de valer juntos — quem volta encontra o que
  // deixou, quem chega depois no mesmo navegador não encontra nada.
  test('sair não apaga as anotações, e outra conta não as vê', async ({ page }) => {
    const texto = `Anotação que sobrevive ao logout ${Date.now()}`;
    await entrar(page);

    await page.click('[data-testid="nav-anotacoes"]');
    await page.click('[data-testid="nova-anotacao"]');
    await page.locator('textarea').fill(texto);

    await page.click('[data-testid="sair"]');
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SENHA);
    await page.click('button[type="submit"]');
    await page.click('[data-testid="nav-anotacoes"]');
    await expect(page.locator('textarea')).toHaveValue(texto);

    // Outra conta, no mesmo navegador, logo em seguida: caderno vazio.
    await page.click('[data-testid="sair"]');
    await page.click('[data-testid="trocar-modo"]');
    await page.fill('[data-testid="campo-nome"]', 'Outra Pessoa');
    await page.fill('input[type="email"]', `e2e-${Date.now()}@exemplo.test`);
    await page.fill('#campo-senha', 'senha-de-teste-123');
    await page.fill('[data-testid="campo-confirmacao"]', 'senha-de-teste-123');
    await page.click('button[type="submit"]');
    await page.click('[data-testid="nav-anotacoes"]');
    await expect(page.locator('text=Crie uma com o botão')).toBeVisible();
    await expect(page.locator(`text=${texto}`)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 2ª fase: questões discursivas
// ---------------------------------------------------------------------------
//
// Os três primeiros testes simulam as rotas /api/discursivas no navegador: o
// acervo da 2ª fase só existe no backend a partir da versão que criou a
// tabela, e o que eles medem — o seletor, os avisos, a conferência — é do
// front. O último usa o backend de verdade e se pula quando ele ainda não tem
// a rota ou o acervo semeado (tests/e2e-discursivas.sql).

// Trechos reais: o item A é do 44º Exame (questão 1), com a distribuição
// dos pontos; o B é o do 43º (questão 1) em que a FGV aceita duas respostas,
// separadas por uma linha "OU".
const QUESTAO_DISCURSIVA = {
  id: 9901,
  exame: 99,
  numero: 1,
  area: 'civil',
  fonte: 'Teste e2e (trechos do 43º e do 44º Exame)',
  enunciado: 'Guilherme ingressou com uma ação de execução de título extrajudicial em face de Fabiano.\nAo longo do processo de execução, houve a penhora de um automóvel, fruto de herança recebida por Fabiano.\nDiante do caso narrado, responda aos itens a seguir.',
  itens: [
    {
      letra: 'A',
      pergunta: 'O automóvel penhorado entra na comunhão de bens de Maria e Fabiano? Justifique.',
      valor: 0.6,
      gabarito: 'Não. Tendo em vista que o bem móvel penhorado foi adquirido por Fabiano em razão de herança recebida na constância do casamento, ele estará excluído da comunhão, nos termos do Art. 1.659, inciso I, do CC.',
      distribuicao: 'A. Não, pois foi adquirido por Fabiano em razão de herança recebida na constância do casamento e estará excluído da comunhão (0,50), nos termos do Art. 1.659, inciso I, do CC (0,10).',
    },
    {
      letra: 'B',
      pergunta: 'Em que foro deve ser proposta a ação? Justifique.',
      valor: 0.65,
      gabarito: 'Camila e seus demais filhos deverão propor ação de anulação do negócio jurídico em Santos, SP, por ser o foro de localização do imóvel objeto da lide, conforme o Art. 47 do CPC.\nOU\nEm São Paulo, SP, o foro do domicílio do réu, entendendo ser obrigação pessoal, conforme Art. 46 do CPC.',
    },
  ],
};

// `alvo`: a página, ou o contexto inteiro quando o teste abre duas abas.
async function simularDiscursivas(alvo, { lista = [], questao = null, falharGravacao = false, atrasoGravacaoMs = 0 } = {}) {
  const gravadas = [];
  const enviadas = [];
  const consultas = { respostas: 0 };

  await alvo.route(/\/api\/discursivas(?:[/?]|$)/, async (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());

    if (url.pathname === '/api/discursivas/respostas') {
      if (pedido.method() === 'POST') {
        const corpo = pedido.postDataJSON();
        enviadas.push(corpo);
        if (atrasoGravacaoMs) await new Promise((r) => setTimeout(r, atrasoGravacaoMs));
        if (falharGravacao) return rota.fulfill({ status: 500, json: { error: 'banco fora do ar' } });
        const linha = { id: gravadas.length + 1, ...corpo, criada_em: new Date().toISOString() };
        gravadas.unshift(linha);
        return rota.fulfill({ status: 201, json: linha });
      }
      consultas.respostas += 1;
      return rota.fulfill({
        json: gravadas.filter((r) => String(r.questao_id) === url.searchParams.get('questao_id')),
      });
    }

    if (url.pathname === '/api/discursivas') return rota.fulfill({ json: lista });
    if (questao && url.pathname === `/api/discursivas/${questao.id}`) return rota.fulfill({ json: questao });
    return rota.fulfill({ status: 404, json: { error: 'Questão não encontrada' } });
  });

  return { enviadas, consultas };
}

const RESUMO_DISCURSIVA = {
  id: QUESTAO_DISCURSIVA.id, exame: 99, numero: 1, area: 'civil', resumo: 'Bem herdado e foro competente',
};

test.describe('2ª fase: questões discursivas', () => {
  test('o seletor troca de fase, e o acervo vazio vira aviso sem erro no console', async ({ page }) => {
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') erros.push(msg.text());
    });
    await simularDiscursivas(page, { lista: [] });
    await entrar(page);

    const seletor = page.locator('[data-testid="seletor-fase"]');
    await expect(seletor).toHaveValue('objetiva');
    await seletor.selectOption('discursiva-civil');

    await expect(page.locator('[data-testid="discursivas-vazio"]')).toBeVisible();
    await expect(page.locator('text=As questões discursivas estão chegando')).toBeVisible();
    // A 2ª fase é outra página: o menu e o dashboard da 1ª saem.
    await expect(page.locator('[data-testid="nav-questoes"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="nav-discursivas"]')).toBeVisible();

    // A fase é estado da interface: recarregar volta a ela.
    await page.reload();
    await expect(page.locator('[data-testid="discursivas-vazio"]')).toBeVisible();

    // Pelo teclado, como qualquer <select>.
    await seletor.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-testid="nav-questoes"]')).toBeVisible();
    await expect(seletor).toHaveValue('objetiva');

    expect(erros).toEqual([]);
  });

  test('responder, corrigir e reabrir mostra a última resposta e a conferência dela', async ({ page }) => {
    const { enviadas } = await simularDiscursivas(page, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');

    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await expect(page.locator('[data-testid="enunciado"]')).toContainText('Fabiano');
    await expect(page.locator('[data-testid="item-A"]')).toContainText('(Valor: 0,60)');

    // Sem texto não há o que conferir.
    await expect(page.locator('[data-testid="corrigir"]')).toBeDisabled();
    await expect(page.locator('[data-testid="resposta-A"]')).toHaveAttribute('maxlength', '6000');

    const respostaA = 'Não. O bem herdado não se comunica (art. 1659, I, CC).';
    await page.fill('[data-testid="resposta-A"]', respostaA);
    // Segue o segundo caminho do padrão ("OU"): tem de valer como completo.
    await page.fill('[data-testid="resposta-B"]', 'Em São Paulo, domicílio do réu (art. 46 do CPC).');
    await page.click('[data-testid="corrigir"]');

    await expect(page.locator('[data-testid="fundamentos-A"]')).toHaveText('Fundamentos: 1 de 1');
    await expect(page.locator('[data-testid="fundamentos-B"]')).toHaveText('Fundamentos: 1 de 1');
    await expect(page.locator('[data-testid="item-B"]')).toContainText('A banca aceita 2 respostas');
    await expect(page.locator('[data-testid="gabarito-A"]')).toContainText('Art. 1.659, inciso I, do CC');
    await expect(page.locator('[data-testid="distribuicao-A"]')).toContainText('(0,50)');
    await expect(page.locator('[data-testid="resumo-conferencia"]')).toContainText('citar o artigo sozinho não pontua');
    await expect(page.locator('[data-testid="resposta-salva"]')).toBeVisible();

    expect(enviadas).toHaveLength(1);
    expect(enviadas[0].questao_id).toBe(QUESTAO_DISCURSIVA.id);
    expect(enviadas[0].respostas.A).toBe(respostaA);
    expect(enviadas[0].fundamentos).toEqual({ citados: 2, esperados: 2 });

    // Voltar e reabrir: a última resposta vem do servidor, já conferida.
    await page.click('[data-testid="voltar-lista"]');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await expect(page.locator('[data-testid="sua-resposta-A"]')).toHaveText(respostaA);
    await expect(page.locator('[data-testid="fundamentos-A"]')).toHaveText('Fundamentos: 1 de 1');

    // E dá para responder de novo, partindo do texto anterior.
    await page.click('[data-testid="responder-de-novo"]');
    await expect(page.locator('[data-testid="resposta-A"]')).toHaveValue(respostaA);
  });

  test('gravação recusada avisa, e o rascunho sobrevive ao recarregar', async ({ page }) => {
    await simularDiscursivas(page, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA, falharGravacao: true });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);

    await page.fill('[data-testid="resposta-A"]', 'Art. 1.659, I, do CC.');
    await page.click('[data-testid="corrigir"]');

    // A conferência aparece mesmo assim; o que falhou foi só a gravação.
    await expect(page.locator('[data-testid="erro-gravacao"]')).toContainText('banco fora do ar');
    await expect(page.locator('[data-testid="fundamentos-A"]')).toHaveText('Fundamentos: 1 de 1');

    await page.reload();
    await expect(page.locator('[data-testid="resposta-A"]')).toHaveValue('Art. 1.659, I, do CC.');
  });

  test('o rascunho é da conta: sair e entrar de novo o traz de volta', async ({ page }) => {
    await simularDiscursivas(page, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await page.fill('[data-testid="resposta-A"]', 'Rascunho que sobrevive ao sair');

    await page.click('[data-testid="sair"]');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', SENHA);
    await page.click('button[type="submit"]');

    // "Sair" zera a interface (a fase volta à 1ª), não o rascunho.
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await expect(page.locator(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`)).toContainText('Rascunho');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await expect(page.locator('[data-testid="resposta-A"]')).toHaveValue('Rascunho que sobrevive ao sair');
  });

  test('sair da questão com a gravação no ar não deixa o rascunho para trás', async ({ page }) => {
    const { enviadas } = await simularDiscursivas(page, {
      lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA, atrasoGravacaoMs: 1500,
    });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await page.fill('[data-testid="resposta-A"]', 'Art. 1.659, I, do CC.');
    await page.click('[data-testid="corrigir"]');
    await page.click('[data-testid="voltar-lista"]');

    // Na lista, enquanto o POST não volta, o rascunho ainda existe…
    const item = page.locator(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await expect(item).toContainText('Rascunho');
    // …e sai quando a resposta é salva, com a questão já fechada.
    await expect(item).not.toContainText('Rascunho', { timeout: 5000 });
    expect(enviadas).toHaveLength(1);
    const naChave = await page.evaluate(() => {
      const chave = Object.keys(localStorage).find((k) => k.startsWith('ma-questoes-conta-v1:'));
      return JSON.parse(localStorage.getItem(chave) || '{}').segundaFase?.rascunhos || {};
    });
    expect(naChave).toEqual({});
  });

  test('reabrir a questão com a gravação no ar mostra a resposta salva quando ela volta', async ({ page }) => {
    await simularDiscursivas(page, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA, atrasoGravacaoMs: 1500 });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    const item = page.locator(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await item.click();
    await page.fill('[data-testid="resposta-A"]', 'Art. 1.659, I, do CC.');
    await page.click('[data-testid="corrigir"]');
    await page.click('[data-testid="voltar-lista"]');
    await item.click();

    // A carga desta abertura saiu antes do POST voltar; quando ele volta, a
    // questão mostra a resposta salva — não um campo vazio.
    await expect(page.locator('[data-testid="sua-resposta-A"]')).toHaveText('Art. 1.659, I, do CC.', { timeout: 5000 });
    await expect(page.locator('[data-testid="fundamentos-A"]')).toHaveText('Fundamentos: 1 de 1');
  });

  test('a outra aba, com a mesma questão aberta, passa a mostrar a resposta salva', async ({ page, context }) => {
    await simularDiscursivas(context, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await page.fill('[data-testid="resposta-A"]', 'Resposta escrita na primeira aba, art. 1.659 do CC.');

    // Mesma questão aberta na outra aba, com o rascunho vindo da chave da conta.
    const outra = await context.newPage();
    await outra.goto('/');
    await expect(outra.locator('[data-testid="resposta-A"]')).toHaveValue('Resposta escrita na primeira aba, art. 1.659 do CC.');

    await page.click('[data-testid="corrigir"]');
    await expect(page.locator('[data-testid="resposta-salva"]')).toBeVisible();

    // A remoção do rascunho chega pelo evento `storage`; a outra aba busca a
    // última resposta no servidor em vez de ficar com o campo vazio.
    await expect(outra.locator('[data-testid="sua-resposta-A"]')).toHaveText('Resposta escrita na primeira aba, art. 1.659 do CC.', { timeout: 5000 });
  });

  test('descartar o rascunho volta à última correção sem ir ao servidor', async ({ page }) => {
    const { consultas } = await simularDiscursivas(page, { lista: [RESUMO_DISCURSIVA], questao: QUESTAO_DISCURSIVA });
    await entrar(page);
    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${QUESTAO_DISCURSIVA.id}"]`);
    await page.fill('[data-testid="resposta-A"]', 'Primeira, art. 1.659 do CC.');
    await page.click('[data-testid="corrigir"]');
    await expect(page.locator('[data-testid="resposta-salva"]')).toBeVisible();

    await page.click('[data-testid="responder-de-novo"]');
    await page.fill('[data-testid="resposta-A"]', 'Segunda, que vou descartar.');
    // Espera a busca disparada pelo salvamento assentar antes de contar: a
    // contagem tem de ficar parada entre duas leituras.
    await expect.poll(async () => {
      const agora = consultas.respostas;
      await page.waitForTimeout(250);
      return consultas.respostas === agora;
    }, { timeout: 10000 }).toBe(true);
    const antes = consultas.respostas;
    await page.click('button:has-text("Descartar e ver a última correção")');

    await expect(page.locator('[data-testid="sua-resposta-A"]')).toHaveText('Primeira, art. 1.659 do CC.');
    await page.waitForTimeout(500);
    expect(consultas.respostas).toBe(antes);
  });

  test('com o acervo semeado, a resposta vai para o servidor e volta ao reabrir', async ({ page }) => {
    await entrar(page);
    const lista = await page.evaluate(async () => {
      const token = localStorage.getItem('ma-questoes-token-v1');
      const res = await fetch('/api/discursivas?area=civil', { headers: { Authorization: `Bearer ${token}` } });
      return res.ok ? res.json() : null;
    });
    const semeada = (lista || []).find((q) => q.exame === 99);
    test.skip(!semeada, 'backend sem /api/discursivas ou sem o seed de tests/e2e-discursivas.sql');

    await page.locator('[data-testid="seletor-fase"]').selectOption('discursiva-civil');
    await page.click(`[data-testid="discursiva-${semeada.id}"]`);

    const texto = `Não, art. 1.659, I, do CC. (${Date.now()})`;
    await page.fill('[data-testid="resposta-A"]', texto);
    await page.click('[data-testid="corrigir"]');
    await expect(page.locator('[data-testid="resposta-salva"]')).toBeVisible();

    // Recarregar zera tudo o que é da tela; a resposta tem de vir do banco.
    await page.reload();
    await expect(page.locator('[data-testid="sua-resposta-A"]')).toHaveText(texto);
  });
});
