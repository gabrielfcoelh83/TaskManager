# Arquitetura do Frontend - MlDireito

SPA em React 18 + Vite, publicada na Vercel. Não usa React Router nem
biblioteca de estado: a navegação é um campo do estado (`state.screen`) e tudo
desce de `App.jsx` por props.

Os dados vêm de dois lugares diferentes, e a distinção importa em todo o resto
deste documento:

- **Gateway da plataforma de microserviços** — login, perfil, tentativas e
  acervo de questões. Em produção fica em outro domínio (`VITE_API_URL`).
- **Rotas serverless em `api/`** — geração de questões por IA, enriquecimento
  de questão e consulta ao DataJud. Rodam na própria Vercel.

---

## Estrutura de pastas

```
src/
├── main.jsx              # Entry point (StrictMode + App)
├── App.jsx               # Estado global, carga de dados, layout e navegação
├── index.css             # Estilos globais e animações
├── screens/              # Uma tela por arquivo (13, contando o Login e a SegundaFase)
├── components/ui/        # Componentes extraídos das telas
│   ├── SeletorDeFase.jsx    # Topo da barra lateral: marca + <select> 1ª/2ª fase
│   ├── ConfigSimulado.jsx   # Formulário de configuração do simulado (Simulados)
│   ├── Cronometro.jsx       # Timer do simulado (Simulados)
│   ├── BotaoGoogle.jsx      # "Fazer login com o Google" (Login)
│   └── GeradorQuestoes.jsx  # Gerador por IA — NÃO está em uso (ver Pendências)
└── lib/                  # Lógica sem tela; a maior parte roda no `node` (ver "Rodar e testar")
    ├── api/api.js        # Único cliente HTTP do gateway
    ├── api/paginas.js    # Laço de páginas e tradução array/envelope (puro, testado)
    ├── api/retentativa.js  # Repete pedido recusado com 429 pelo nginx (puro, testado)
    ├── questions/acervo.js  # Tradução acervo → tela, embaralhar, fontes do quiz
    ├── historico.js      # Mescla a carga do histórico com o que foi respondido durante ela
    ├── fila.js           # Envio um a um, que para quando a sessão acaba (respostas do simulado)
    ├── storage.js        # localStorage: estado da interface e dados por conta
    ├── metrics.js        # Meta diária, sequência, taxas, evolução, estatísticas
    ├── revisao.js        # O que está errado / não respondido / favoritado
    ├── disciplinas.js    # Disciplinas derivadas do acervo, cores, prioridade
    ├── agenda.js         # Plano da semana e calendário do Cronograma
    ├── perfil.js         # Payload do JWT, nome de exibição, saudação
    ├── navegacao.js      # Menu, fases (FASES), título/subtítulo das telas, ícones, tags
    ├── fundamentos.js    # 2ª fase: extrai citações legais e compara resposta × padrão da FGV
    ├── discursivas.js    # 2ª fase: agrupar por exame, "0,60", itens preenchidos
    ├── theme.js          # Temas (rosa, azul, verde) e buildStyles()
    ├── icons.jsx         # Ícones SVG (<Icon name=... />)
    └── charts.jsx        # Sparkline, MiniBars, AreaLine, LabeledBars

api/                      # Funções serverless (Vercel)
├── gerar-questoes.js     # OpenRouter
├── enriquecer-questao.js
├── buscar-datajud.js     # DataJud (CNJ)
└── _lib/                 # auth.js (exige login), datajud.js

server/dev-api.js         # Serve as rotas de api/ em dev (o Vite não serve)
scripts/testes-lib.js     # Roda os testes de lib/ (npm run test:lib)
tests/                    # Testes unitários da lib/, de API e e2e (Playwright)
```

Os `index.js` de `lib/api/` e `lib/questions/` exportam o módulo como
`default` e ninguém os importa: importe direto do arquivo
(`./lib/api/api`, `./lib/questions/acervo`).

`App.jsx` também desenha o layout — barra lateral, topo, sino de avisos e o
cartão "Foco de hoje". Não existem pastas `layout/`, `hooks/` nem `contexts/`.

---

## Fases

O topo da barra lateral é um `<select>` com `<optgroup>` (`SeletorDeFase`),
no lugar do antigo logo "ma. questões" — a marca ficou, menor, em cima dele:

```
1ª FASE
   Questões objetivas      ← o app de sempre: menu, dashboard, telas abaixo
2ª FASE
   Direito Civil           ← SegundaFase.jsx, página própria
```

A fase escolhida fica em `state.fase` (`'objetiva'` | `'discursiva-civil'`),
e `FASES` em `lib/navegacao.js` lista as opções — área nova da 2ª fase entra
ali, com a `area` que o servidor usa. `faseValida` devolve a padrão quando o
valor salvo não existe mais. É `<select>` nativo de propósito: teclado, leitor
de tela e a roda de opções do celular vêm do navegador.

Na 2ª fase o `App` desenha outro layout: sem menu, dashboard, cartão de foco,
contagem da prova nem sino — tudo isso mede a 1ª fase. Fica o seletor, a
linha do perfil ("Ver perfil" volta à 1ª fase, nas Configurações) e a faixa
de erro. Em tela estreita (`max-width: 760px`) a barra lateral vira uma
faixa no topo. As cargas da 1ª fase (acervo, tentativas, perfil) continuam
rodando por trás, para a troca de volta ser imediata.

### SegundaFase.jsx

Questões discursivas de uma área — só as 4 questões de cada exame; a peça
não entra. Duas vistas:

- **Lista**, agrupada por exame (mais recente primeiro). Acervo vazio — ou a
  rota ainda ausente no gateway (404) — vira o aviso "As questões
  discursivas estão chegando", não tela em branco. Erro de rede vira aviso
  com "Tentar de novo". Questão com rascunho ganha a etiqueta "Rascunho".
- **Questão aberta**: enunciado (`pre-line`: o texto vem com `\n` entre
  parágrafos), cada item com "(Valor: 0,60)" e um campo de até 6000
  caracteres (o limite do servidor), e o botão "Corrigir".

"Corrigir" confere no navegador (`conferirQuestao`) e grava no servidor.
Depois dela, por item: "Fundamentos: X de Y", o que faltou citar, o que a
pessoa citou (e o que ela citou que não está no padrão), o padrão de
resposta da FGV, a distribuição dos pontos quando a FGV publicou e o valor
do item. Um aviso fixo diz que **não é nota**: só confere a citação dos
fundamentos, e a banca também avalia a fundamentação. Correção por IA é
etapa futura.

Ao reabrir a questão aparece a última resposta salva
(`GET /api/discursivas/respostas`), já conferida, com "Responder de novo".
Vale a mais recente entre essa carga e a que o `App` gravou nesta sessão
(`salvasNaSessao`, só em memória): reaberta com o POST no ar, a carga sai
antes dele e viria vazia. Quando o rascunho some — salvo aqui ou noutra aba,
que o apaga da chave da conta —, a questão aberta busca de novo a última
resposta, sem esqueleto ("Descartar" não busca: nada foi salvo). As duas
cargas se juntam por `maisRecente`, para a que voltar por último não trazer
de volta uma resposta mais velha.
Gravação recusada mostra o erro junto da resposta, com "Tentar de novo", e o
rascunho continua salvo. Falha só na carga das respostas antigas não impede
responder: um aviso diz que a última resposta não apareceu.

### Conferência dos fundamentos (`lib/fundamentos.js`)

Pura, testada em `tests/fundamentos.test.js` com trechos reais dos padrões
de resposta do 36º ao 45º Exame.

- `extrairCitacoes(texto)` reconhece artigos ("Art. 1.659, inciso I, do
  CC", "arts. 186 e 927 do CC", "CC, art. 186", "Lei nº 8.078/90, art. 14",
  "artigo 1.228 do Código Civil", "art. 186 do CC c/c art. 927 do mesmo
  diploma") e súmulas ("Súmula 537 do STJ", "Súmula Vinculante 25"). 1.659 e
  1659 são o mesmo artigo; lei pelo número vira a sigla quando existe (8.078
  → CDC, 13.709 → LGPD). Encadeamentos: "art. 186 C/C 927 do CC", "artigo
  496 do Código Civil e 179 do CC" e intervalos ("arts. 186 a 188", que
  conta o 187; "arts. 186, 187 a 190"). Intervalo de parágrafos ou incisos
  ("§ 1º a 3º", "incisos I a III") é detalhe do artigo, não artigo novo.
  Depois de o diploma fechar o grupo, número sem "art." só continua se vier
  seguido de fim de frase, detalhe, outro diploma ou outro artigo ("do CC e
  2 dos réus" não cita art. 2) — ou de vírgula/parêntese, se o número tem
  dois dígitos ou mais ("do CC e 927, o réu…" cita; "do CC e 3, conforme…"
  não). Em "§ 1º e 1.229" o "1" é do art. 1.229, não um parágrafo. Número sem "art."/"artigo"/"Súmula" antes não é citação.
  Siglas em maiúsculas, ou minúsculas logo depois de "do/da/no/na" ("do
  cc"): solto no texto, "cf." não é Constituição.
- Sem lookbehind nas expressões regulares nem `.at(-n)`: o primeiro é
  SyntaxError no Safari antes do 16.4 (o módulo é importado pelo App — o app
  inteiro não carregaria), o segundo não existe antes do 15.4. Um teste
  varre `src/` e `api/`.
- A comparação é por **diploma + artigo**; parágrafo, inciso e alínea são
  detalhe exibido. Artigo citado sem a lei atende, com o aviso "diga de qual
  lei é o artigo"; artigo de outra lei não atende.
- No padrão, citações ligadas por "ou" são **um** fundamento com várias
  opções. Uma linha "OU" sozinha separa **caminhos** de resposta inteiros
  (43º Exame, questão 1, item B): cada caminho é conferido à parte e vale o
  que a resposta mais atende.
- `conferirQuestao(itens, respostas)` devolve o resultado por item e os
  totais `{ citados, esperados }` — o `fundamentos` gravado no servidor.

## Telas

`NAV` em `lib/navegacao.js` define o menu da 1ª fase; `App.jsx` renderiza a tela cuja
chave está em `state.screen`. Como a tela atual é salva no localStorage,
recarregar a página volta para ela — mas não há URL por tela.

| Chave | Arquivo | O que faz | Props além das comuns |
|---|---|---|---|
| — | `Login.jsx` | Entrar e criar conta | só `theme`, `s` e `onEntrar` — não recebe as comuns |
| `dashboard` | `Dashboard.jsx` | Resumo do dia, próximo passo, evolução | `dash`, `setDash`, `acervo` |
| `cronograma` | `Cronograma.jsx` | Sugestão de semana e calendário do mês | — |
| `questoes` | `Questoes.jsx` | Escolha de fonte e quiz | `quest`, `setQuest`, `registrar`, `acervo`, `recarregarAcervo` |
| `simulados` | `Simulados.jsx` | Configurar, cronometrar e corrigir simulado | `sim`, `setSim`, `setResultadosHistorico`, `registrarRespostas` |
| `revisoes` | `Revisoes.jsx` | Erradas, favoritas, menor desempenho | `rev`, `setRev`, `favoritos`, `toggleFavorito` |
| `desempenho` | `Desempenho.jsx` | Evolução ao longo do tempo | `perf`, `setPerf` |
| `estatisticas` | `Estatisticas.jsx` | Números por período e disciplina | `filtros`, `setFiltros` |
| `favoritos` | `Favoritos.jsx` | Questões marcadas com estrela | `toggleFavorito` (recebe `favoritos` mas não usa; lê de `revisao`) |
| `disciplinas` | `Disciplinas.jsx` | Aproveitamento por matéria e tema | `disc`, `setDisc` |
| `anotacoes` | `Anotacoes.jsx` | Notas com pastas e tags | `notas`, `setNotas` |
| `configuracoes` | `Configuracoes.jsx` | Nome, meta, data da prova, tema | `perfil`, `nome`, `atualizarNome`, `atualizarConfig`, `themeKey`, `setTheme` |
| — (`state.fase`) | `SegundaFase.jsx` | 2ª fase: questões discursivas (ver "Fases") | não recebe as comuns: `theme`, `s`, `fase`, `estado`/`setEstado` (`state.segundaFase`), `gravarResposta`, `sessaoExpirou` |

Props comuns (`screenProps`): `theme`, `s` (estilos de `buildStyles`), `data`
(`{ QUESTOES, DISCIPLINAS }`), `go`, `usuarioTentativas`, `disciplinas`,
`revisao`, `resultados_historico`, `config`, `revisarQuestoes`,
`praticarDisciplina`.

---

## Estado

O estado se divide pela **origem do dado**, não pela tela. Misturar os dois
tipos é o que fazia uma gravação que falhou divergir em silêncio do servidor.

| Tipo | Onde fica | Persistência | Conteúdo |
|---|---|---|---|
| Interface | `state` (`DEFAULT_STATE`) | localStorage (`ma-questoes-state-v1`) | tema, fase, tela atual, filtros de cada tela, quiz em andamento, questão discursiva aberta, favoritos, anotações, histórico de simulado, rascunhos discursivos |
| Conta | cópia de quatro fatias de `state` | localStorage (`ma-questoes-conta-v1:<id>`), uma chave por conta | favoritos, anotações (só as notas), histórico de simulado e rascunhos discursivos (`segundaFase` sem a questão aberta) — ver "Dados da conta" |
| Servidor | `useState` próprios | nenhuma — recarregados a cada sessão | `acervo`, `usuarioTentativas`, `perfil`; na `SegundaFase`, a lista, a questão aberta e a última resposta, recarregadas a cada visita |
| Sessão | `useState` próprio | deriva do token salvo (`ma-questoes-token-v1`) | `sessao` (`'ativa'` / `'ausente'`) |
| Aviso | `useState` próprio | nenhuma | `erroSync`, a faixa de erro do topo |

Meta diária e data da prova são o caso misto: ficam em
`state.configuracoes` para a tela responder na hora, mas o servidor
(`profile_data` do perfil) é a fonte da verdade: ao carregar o perfil, cada
uma sobrescreve o valor local quando o perfil a traz.

```javascript
const DEFAULT_STATE = {
  __usuario: null,         // de quem é o estado salvo neste navegador
  theme: 'rosa',
  fase: 'objetiva',        // 'objetiva' | 'discursiva-civil' (ver "Fases")
  screen: 'dashboard',
  dashboard: { period: '7' },
  cronograma: {},
  questoes: { selected: null, quiz: null, idx: 0, selectedAlt: null, certas: 0, erradas: 0, done: false },
  simulados: { running: {}, resultados_historico: [] },  // ver Pendências
  revisoes: { tab: 'todas' },
  desempenho: { period: '6' },
  estatisticas: { range: '30d', disc: 'Todas' },
  disciplinas: { openNome: null },
  anotacoes: { folder: 'Todas', activeId: null, itens: [] },
  favoritos: [],
  configuracoes: { meta: 20, dataProva: null },
  resultados_historico: [],  // histórico real dos simulados
  segundaFase: { questaoId: null, rascunhos: {} },  // rascunhos: { [id]: { A: '…' } }
};
```

Regras que o código já garante:

- **Merge de um nível** (`loadState`): campo novo dentro de uma fatia chega a
  quem já tinha estado salvo. Com `{...defaults, ...salvo}` a fatia salva
  inteira venceria e o campo novo nunca apareceria para usuário antigo.
- **Troca de conta**: acontece na abertura e no login, pelo id do token
  (`contaDoToken` + `estadoDaConta`), sem esperar o perfil voltar da rede. O
  efeito de perfil repete a troca só se o perfil voltar com outro id.
  Outra conta recomeça do padrão (mantendo só o tema) e recupera os dados da
  conta dela; a mesma conta segue com a tela como estava.
- **Logout** (`sair`): apaga o token, encerra a sessão (ver abaixo) e zera o
  estado da interface — mas não os dados da conta, que voltam quando a mesma
  pessoa entrar de novo.
- **A fase é da interface**, como `screen`: não passa entre abas, e o "Sair"
  a zera. **Os rascunhos discursivos são da conta** (ver "Dados da
  conta"). O rascunho sai quando a resposta é salva no servidor — por
  `gravarRespostaDiscursiva` no `App`, que funciona mesmo se a pessoa já
  saiu da questão, e só se o rascunho ainda for o texto enviado. Enquanto a
  gravação falhar, ele fica.
- **Fatias por tela**: cada tela recebe a sua fatia e um setter montado com
  `updateSlice(chave, parcial)`, que aceita objeto (merge) ou função.

### Dados da conta

Favoritos, anotações, histórico de simulado e rascunhos discursivos
(`segundaFase.rascunhos`, texto ainda não conferido) não têm rota na API. Além de
viverem em `state`, ficam numa chave por conta, gravada pelo mesmo efeito que
grava o estado da interface (`salvarDadosDaConta`, em `storage.js`):

- **Sair não apaga**, e quem entra com outra conta no mesmo navegador não os
  vê na tela. Não é sigilo: a chave de outra conta segue legível nas
  ferramentas do navegador. A tela de Anotações avisa que as notas ficam no
  navegador depois de sair e sugere limpar os dados do site em computador
  compartilhado; favoritos e histórico de simulado não têm aviso.
- **Na abertura com a mesma conta, a chave vale** para essas três fatias. Com
  duas abas abertas, a desatualizada regrava o estado da interface a cada
  troca de tela; a chave só é gravada quando os dados da conta mudam
  (`ultimaGravacao`), então é ela que tem a versão mais nova.
- **Pasta aberta, nota selecionada e questão discursiva aberta não vão para
  a chave** (`CAMPOS_DA_TELA`): são da tela, mudam só de clicar, e fariam uma
  aba sobrescrever a outra.
- **Abas abertas ao mesmo tempo** se acompanham pelo evento `storage`, que
  o navegador dispara nas outras abas quando uma grava no localStorage. Os
  dados da conta gravados por uma aba entram nas outras da mesma conta na
  hora, sem recarregar. Se o token muda noutra aba (saiu e entrou outra
  conta), esta recarrega já na conta nova; se o token some, volta ao login.
  Uma aba parada no Login também recarrega quando outra entra — e passa a
  mostrar a conta que entrou. Sem isso, uma aba desatualizada apagava a nota
  nova da outra ao editar, e uma aba seguia mostrando uma conta e gravando
  com o token de outra. Duas abas editando no mesmo instante, antes de uma
  receber o evento da outra, ainda terminam com a gravação da última.
- **Estado sem dono na abertura** (gravado antes da chave existir, por conta
  sem perfil no servidor) é adotado pela conta do token (`dadosNaAbertura`).
  No login não: lá, um estado sem dono pode ser de quem saiu antes.

### Refs de gravação assíncrona

- `sessaoEpoch` — contador de sessão. Toda gravação (`registrar`,
  `registrarRespostas`, `atualizarNome`, `atualizarConfig`,
  `gravarRespostaDiscursiva`)
  confere, depois do `await`, se a sessão ainda é a mesma, para uma resposta
  que chega atrasada não aparecer para a próxima pessoa. As três cargas
  (perfil, tentativas, acervo) fazem o mesmo com o `let cancelado` do efeito,
  que vira `true` quando `sessao` muda.
- `gravacaoDePreferencias` — fila de uma só para os PUT de meta e data da prova
  (`atualizarConfig`): dois PUT soltos podem chegar fora de ordem e o mais
  velho sobrescrever o mais novo. Um PUT que ainda esperava a vez quando a
  sessão acabou não sai. O PUT do nome (`atualizarNome`) corre fora da fila.

`encerrarSessao` é o fim de uma sessão — por "Sair", por 401 ou por token
sem payload legível: sobe o `sessaoEpoch`, limpa o
histórico em memória, o perfil e a faixa de erro, e volta ao Login. No 401 a
tela fica — quem entra de novo com a mesma conta volta ao que estava
fazendo; `sair` é que também zera a tela.

---

## Comunicação com a API

Todo acesso ao gateway passa por `lib/api/api.js`, com `fetch`. O `axios` do
`package.json` é usado só pelas funções de `api/` e pelos testes.

**Autenticação.** O login devolve um JWT, guardado em
`ma-questoes-token-v1` (chave separada do estado, para limpar um não derrubar
o outro) e enviado como `Authorization: Bearer`. Um 401 apaga o token salvo
(`req` em `api.js`) se ele ainda for o que a requisição usou — um 401 atrasado
da sessão anterior não derruba quem entrou depois — e, no `App`, passa por
`encerrarSessao`, que volta ao Login, venha de uma carga ou de uma gravação.

**Login com o Google.** Pelo Google Identity Services (`BotaoGoogle.jsx`,
script `accounts.google.com/gsi/client`). O botão só aparece, e o script só
carrega, com `VITE_GOOGLE_CLIENT_ID` no build — na Vercel e, em dev, no
`.env.local`. O mesmo Client ID precisa estar no auth-service
(`GOOGLE_CLIENT_ID`); sem ele a rota responde 503. A origem de onde o front
roda (o domínio da Vercel e `http://localhost:5173`) tem de estar nas
"Origens JavaScript autorizadas" do Client ID no Google Cloud.

Conta nova é criada pelo Google na primeira vez. Se o e-mail já tem conta
com senha, o Google **não** a liga sozinho (409, "entre com e-mail e
senha"): o cadastro por senha não confirma o e-mail, e ligar entregaria a
conta a quem cadastrou o e-mail de outra pessoa. Ligar o Google a uma conta
com senha, com a pessoa já logada, ainda não existe.

Para funcionar em produção falta configuração: o `GOOGLE_CLIENT_ID` precisa
chegar ao auth-service pelo `docker-compose.prod.yml` e pelo `.env` que o
workflow de deploy do TaskManager gera. Sem isso o botão aparece (se a
Vercel tiver o Client ID) e todo clique responde "ainda não está
disponível".

**429.** Pedido autenticado recusado com 429 é repetido até três vezes, com
espera (`retentativa.js`). O 429 vem do `limit_req` do nginx, antes de chegar
a qualquer serviço, então repetir não grava nada em dobro. Login e cadastro
não repetem: lá o limite existe contra quem tenta senha atrás de senha. As
respostas de um simulado vão em fila (`registrarRespostas` + `fila.js`), quatro
no ar de cada vez: todas juntas passavam do limite numa prova de 80 questões,
e em série demoravam demais. A fila para se a sessão ou o token mudarem no
meio, e enquanto ela corre o navegador pergunta antes de fechar ou recarregar
a aba.

**Erros.** Toda falha vira `ApiError(message, status)`. `status` 0 significa
que a requisição não chegou (rede ou CORS — o navegador não deixa distinguir).
Erro de carga de tentativas e de gravação aparece na faixa `erroSync` do topo;
erro do acervo aparece na própria tela de Questões, com botão de recarregar.

| Função | Rota | Observação |
|---|---|---|
| `login`, `criarConta` | `POST /api/auth/login`, `/register` | o register já devolve token |
| `entrarComGoogle` | `POST /api/auth/google` | manda o ID token do Google; o auth-service confere e devolve o JWT da plataforma, criando a conta na primeira vez |
| `buscarPerfil`, `salvarPerfil` | `GET`/`PUT /api/users/:id` | nome e `profile_data` |
| `listarTentativas` → `buscarPaginaDeTentativas` | `GET /api/tentativas?limite=1000&paginado=1[&offset=N]` | percorre as páginas até somar `total` (`percorrerPaginas`, teto de 50 páginas; passando dele, a lista vem cortada e o aviso vai só para o console), descarta repetidas pelo id, aceita o formato antigo (array) e agrupa por questão, em ordem cronológica. No `App`, a carga é mesclada com o que foi respondido enquanto ela corria (`mesclarTentativas`) |
| `registrarTentativa` | `POST /api/tentativas` | |
| `listarDiscursivas(area)` | `GET /api/discursivas?area=civil` | `[{id, exame, numero, area, resumo}]`; 404 (gateway sem a rota) vira acervo vazio na tela |
| `buscarDiscursiva(id)` | `GET /api/discursivas/:id` | enunciado, `fonte` e `itens: [{letra, pergunta, valor, gabarito, distribuicao?}]`; item sem letra é descartado |
| `salvarRespostaDiscursiva` | `POST /api/discursivas/respostas` | `{questao_id, respostas: {A: '…'}, fundamentos: {citados, esperados}}`; até 6000 caracteres por item, e `fundamentos` só com esses dois inteiros |
| `listarRespostasDiscursivas(id)` | `GET /api/discursivas/respostas?questao_id=N` | só as da própria conta, mais recente primeiro |
| `listarQuestoes` → `buscarPaginaDeQuestoes` | `GET /api/questoes?limite=200&paginado=1[&offset=N]` | percorre as páginas até somar `total`, com teto de 60 páginas (passando dele, a lista vem cortada e o aviso vai só para o console); com `aleatorio`, uma página só; aceita também o formato antigo (array) |

### Rotas serverless

As três rotas de `api/` exigem login: `_lib/auth.js` valida o token contra o
gateway (`POST /api/auth/verify`) em vez de duplicar o segredo do JWT na
Vercel. Hoje nenhuma tela do app as chama.

O gateway que ele consulta vem de `VITE_API_URL` **no ambiente do processo
das funções** — e, sem ela, cai no gateway de **produção**. Em dev isso
importa: ver "Rodar e testar".

### Dev x produção

- **Produção:** chamadas ao gateway usam a URL absoluta de `VITE_API_URL`; as
  rotas de `api/` são relativas à própria Vercel. O build **não** checa a
  variável: um deploy sem ela sai verde, e o erro ("VITE_API_URL não foi
  definida neste build") só aparece na primeira chamada à API, em vez de um
  404 sem explicação.
- **Dev:** `VITE_API_URL` fica vazia e o proxy do `vite.config.js` separa os
  dois backends que dividem o prefixo `/api`:
  - `/api/auth`, `/api/tentativas`, `/api/questoes`, `/api/users`,
    `/api/discursivas` → gateway
    em `localhost:3000` (`GATEWAY_PORT`)
  - resto de `/api` → `server/dev-api.js` em `localhost:3100` (`DEV_API_PORT`)

  Rota nova do gateway precisa de linha própria no proxy, acima de `/api`;
  sem ela o pedido cai no dev-api e falha de um jeito que parece bug de tela.

---

## Rodar e testar

```bash
# Backend (postgres, redis, auth, user, estudo, questoes, gateway) com usuário de teste
./scripts/e2e-backend.sh

# Rotas de api/. PORT: a padrão do script é 3000, que é a do gateway.
# VITE_API_URL: sem ela, _lib/auth.js valida o token no gateway de PRODUÇÃO
# (o mesmo que a CI evita em ci.yml). Passe só neste processo — no .env.local
# ela valeria também para o Vite e tiraria o front do proxy.
PORT=3100 VITE_API_URL=http://localhost:3000 node server/dev-api.js

# Front
npm run dev
```

| Script | O que roda | Na CI? |
|---|---|---|
| `npm run lint` | ESLint | sim |
| `npm run build` | build de produção | sim |
| `npm run test:e2e` | Playwright contra `npm run dev` + backend do script acima | sim |
| `npm run test:api` | rotas de `api/`: recusam pedido sem token e com token inválido; com login no gateway, chamam de verdade a OpenRouter e o DataJud | sim |
| `npm run test:lib` | todo `tests/*.test.js` menos `api.test.js`, cada um em UTC e em America/Sao_Paulo | sim (job `lint` do ci.yml; job `check-code` do pr.yml) |
| `npm run test:estado`, `test:questoes`, `test:paginas` | um arquivo de `test:lib` só, para rodar à mão — no fuso da máquina, sem a segunda rodada em São Paulo | via `test:lib` |
| `npm run test:all` | test:e2e + test:api | nenhum workflow chama |
| `npm run ci` | lint + test:lib + build — a verificação local, o mesmo que a CI roda sem backend | nenhum workflow chama |

O `e2e-backend.sh` semeia também `tests/e2e-discursivas.sql` (exame 99,
textos reais do 43º e 44º Exame) — mas só se a tabela
`questoes_discursivas` existir na imagem do questoes-service. Os e2e da 2ª
fase simulam `/api/discursivas` no navegador, menos um, que usa o backend
de verdade e se pula quando não há rota ou seed.

`test:api` precisa de tudo no ar — backend na 3000, dev-api na 3100 com
`VITE_API_URL` local — e de `OPENROUTER_API_KEY`. Rodado sem isso, falha com
401 ou gasta cota paga.

Os testes da `lib/` rodam no `node` puro, sem navegador. Valem para os módulos
`.js` que não tocam `import.meta.env` — `lib/api/api.js` é a exceção, e é por
isso que a lógica testável dele mora em arquivos à parte (`acervo.js`,
`paginas.js`). `storage.js` usa `localStorage`, que o teste substitui por um
objeto.

`test:lib` descobre os arquivos sozinho: teste novo em `tests/` entra na CI
sem editar script nem workflow. Os dois fusos existem porque o runner da CI
está em UTC, onde um erro de data não aparece — a contagem até a prova já
mostrou um dia a menos no Brasil com a CI verde.

---

## Pendências

### Lacunas conhecidas

1. **Favoritos, anotações e histórico de simulado só existem no navegador** —
   não há rota na API. Sair não os apaga mais (ver "Dados da conta"), mas
   eles não acompanham a pessoa para outro navegador ou aparelho, e limpar os
   dados do site os apaga de vez.
2. **Trocar o e-mail** não é possível pela tela de Configurações.
3. **`api/_lib/auth.js` cai no gateway de produção** quando falta
   `VITE_API_URL`. Em produção é o valor certo; em dev, manda o token de
   teste para a produção. Falhar sem a variável seria mais seguro.
4. **O build não checa `VITE_API_URL`** — só a primeira chamada à API, já com
   o deploy publicado.
5. **localStorage quase cheio** — se a gravação da chave da conta falhar e a
   do estado da interface não, recarregar a página traz de volta a versão
   anterior dos dados da conta, sem aviso.
6. **Estado antigo sem dono e sem token na abertura** — quem ficou com estado
   sem dono (versão anterior, conta sem perfil) e perdeu o token por 401
   antes de atualizar perde esses dados ao entrar de novo. É estreito, e não
   se repete: a versão atual sempre marca o dono.
7. **A CI usa Node 20**, que saiu do suporte em 30/04/2026.
8. **Edição que recebe 401 some sem aviso** — a tela muda antes do PUT (meta,
    data da prova) e, com o 401, volta ao login sem dizer que a última
    alteração não foi salva. Ao entrar de novo, a tela pode mostrar um valor
    que o servidor não tem. O Login não tem onde mostrar esse aviso hoje.
9. **Respostas do simulado na fila se perdem se a aba for descartada** — o
    aviso de sair cobre fechar e recarregar, mas não a aba que o sistema
    descarta (comum no celular) nem o navegador que fecha sem perguntar.
10. **E-mail cadastrado por outra pessoa bloqueia o Google** — como o
    cadastro por senha não confirma o e-mail, quem cadastrou o e-mail de
    outra pessoa impede o dono de entrar pelo Google (409), e não existe
    "esqueci a senha". O dono não é invadido, mas fica sem acesso.
11. **`PATCH /api/tentativas/:id` sem uso** — o pop-up "como você chegou
    nessa resposta?" saiu do quiz e era o único a gravar `tipo` e `certeza`.
    A rota continua no estudo-service; as tentativas antigas mantêm os
    valores, e nada na tela os lê.
12. **A 1ª fase não tem layout de celular** — a barra lateral de 232px fica
    sempre à vista e espreme o conteúdo. Só a página da 2ª fase se adapta a
    tela estreita. O seletor de fase funciona nas duas (é `<select>` nativo).
13. **Rascunho discursivo só neste navegador** — o texto ainda não conferido
    fica na chave da conta: sobrevive ao "Sair" e passa entre abas, mas não
    acompanha a pessoa para outro aparelho. O que foi conferido e salvo está
    no servidor.
14. **Conferência de fundamentos é leniente com artigo sem lei** — no padrão
    de resposta, "no Art. 6º" sem o diploma (44º Exame, questão 4, item A)
    fica sem lei, e então qualquer "art. 6º" o atende. Na resposta, artigo
    sem lei atende com aviso. A peça prático-profissional ainda não entra, e
    a correção por IA é etapa futura.

### Limpeza

- `GeradorQuestoes.jsx` não é importado por nenhuma tela; as rotas de `api/`
  ficam sem uso no app até que algo o monte.
- O e2e "Gerar questões com IA (API)" não tem asserção: acha o botão "Gerar
  quiz", clica e espera 3 s. Passa sempre.
- `simulados.running` e `simulados.resultados_historico` não são lidos (o
  histórico usado é o `resultados_historico` da raiz); `sim.preDisciplina` é
  lido em `Simulados.jsx`, mas nada grava nele um valor diferente de `null`.
- `Favoritos.jsx` recebe `favoritos` do `App` e não usa.
- `server/dev-api.js` tem 3000 como porta padrão (e o comentário do topo diz
  "Porta 3000"), a mesma do gateway.
- `lib/api/index.js` e `lib/questions/index.js` sem uso.

### Refatoração planejada

1. Tirar estado e carga de dados do `App.jsx` (hoje ~800 linhas) para
   contextos — sessão/perfil, acervo e tentativas, interface.
2. Extrair o layout (barra lateral, topo, avisos) para componentes próprios.
3. Biblioteca de componentes de interface (botão, card, modal, abas, etc.) no
   lugar dos estilos inline repetidos.
4. Quebrar as telas maiores (`Questoes`, `Simulados`, `Dashboard`).
5. TypeScript nas props e validação das respostas da API.
6. Testes de componente, além dos unitários e do e2e que já existem.

---

## Convenções

- **Componentes:** PascalCase (`ConfigSimulado.jsx`)
- **Funções:** camelCase, em português (`montarDisciplinas`, `embaralhar`)
- **Constantes:** UPPER_SNAKE_CASE (`DEFAULT_STATE`, `THEMES`)
- **Lógica nova** vai para `lib/` como função pura, com teste em `tests/`.
- **Dado que é do servidor** não entra em `state` nem no localStorage.
- **Comentários** explicam o porquê — o bug que a linha evita — e não o quê.
