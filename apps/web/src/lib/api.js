// Cliente da API da plataforma (gateway :3000 atrás do nginx).
//
// O front é servido pela Vercel e a API roda na Oracle: origens diferentes,
// então toda chamada é cross-origin e depende do CORS configurado no nginx.
// O token vai no header Authorization — cookie exigiria SameSite=None e
// configuração extra sem ganho nenhum aqui.

// Vazio em dev: o proxy do Vite manda /api/auth e /api/tentativas para o
// gateway em localhost:3000, então as chamadas saem como mesma origem e o
// CORS nem entra na história. Em produção precisa ser a URL absoluta da API.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Chave separada do estado da interface: apagar `ma-questoes-state-v1` não
// pode derrubar a sessão, e limpar a sessão não pode apagar o tema.
const TOKEN_KEY = 'ma-questoes-token-v1';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // modo privado ou quota: a sessão vale só enquanto a aba estiver aberta
  }
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nada a fazer: o token já não será usado nesta sessão
  }
}

async function req(caminho, { method = 'GET', body, auth = true } = {}) {
  if (import.meta.env.PROD && !BASE) {
    // Sem isto, um build sem a variável mandaria /api/auth/login para a
    // própria Vercel e o erro visível seria um 404 sem explicação.
    throw new ApiError('VITE_API_URL não foi definida neste build', 0);
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = getToken();
    if (!token) throw new ApiError('Sessão não iniciada', 401);
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch só rejeita por falha de rede ou bloqueio de CORS. Distinguir os
    // dois no navegador é impossível de propósito, então a mensagem cobre
    // ambos em vez de mentir sobre a causa.
    throw new ApiError('Não foi possível falar com o servidor', 0);
  }

  // 204 não tem corpo; um .json() nele lançaria SyntaxError.
  const dados = res.status === 204 ? null : await res.json().catch(() => null);

  if (res.status === 401) {
    // Token expirado (a janela é de 7 dias) ou assinado com outro segredo.
    // Descartar aqui evita a tela ficar tentando com credencial morta.
    logout();
    throw new ApiError(dados?.error || 'Sessão expirada', 401);
  }

  if (!res.ok) throw new ApiError(dados?.error || `Erro ${res.status}`, res.status);

  return dados;
}

export async function login(email, password) {
  const dados = await req('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });

  if (!dados?.token) throw new ApiError('Resposta de login sem token', 502);

  setToken(dados.token);
  return dados.user;
}

// O /register já devolve token, então criar conta e entrar são a mesma ida ao
// servidor. Fazer um login logo depois seria uma volta inteira só para repetir
// o que o servidor acabou de confirmar.
export async function criarConta({ nome, email, password }) {
  const dados = await req('/api/auth/register', {
    method: 'POST',
    // `name` é opcional para o auth-service, mas não é decorativo: viaja no
    // evento `user.registered` e vira o perfil no user-service. Omitido, o
    // consumidor cai no trecho antes do @ do e-mail.
    body: { email, password, name: nome || undefined },
    auth: false,
  });

  if (!dados?.token) throw new ApiError('Conta criada, mas sem token — entre novamente', 502);

  setToken(dados.token);
  return dados.user;
}

// ---------------------------------------------------------------------------
// Tentativas
// ---------------------------------------------------------------------------
//
// A API guarda uma linha por tentativa; o front pensa em "histórico por
// questão". A tradução entre os dois formatos mora só aqui — espalhada pelas
// telas, cada uma acabaria com a sua versão ligeiramente diferente.

function paraFormatoLocal(linha) {
  return {
    id: linha.id,
    data: linha.respondida_em,
    resposta: linha.alternativa,
    correta: linha.correta,
    tempo_gasto_segundos: linha.tempo_seg,
    // `tipo` e `certeza` não existem na tabela: são preenchidos na tela de
    // feedback e vivem só nesta sessão. Ver o README da fatia.
    tipo: null,
    certeza: null,
  };
}

export function agruparPorQuestao(linhas) {
  const porQuestao = {};

  for (const linha of linhas) {
    const registro =
      porQuestao[linha.questao_id] ||
      (porQuestao[linha.questao_id] = { tentativas: [], desempenho: 'necessita' });
    registro.tentativas.push(paraFormatoLocal(linha));
  }

  // A API ordena da mais recente para a mais antiga; o front assume ordem
  // cronológica — `avancarProxima` escreve no último elemento do array,
  // que precisa ser a tentativa recém-feita.
  for (const registro of Object.values(porQuestao)) registro.tentativas.reverse();

  return porQuestao;
}

export async function listarTentativas() {
  // O teto do serviço é 1000. Com um usuário isso cobre muito tempo de uso;
  // quando não cobrir, o que falta é paginação, não um limite maior.
  const linhas = await req('/api/tentativas?limite=1000');
  return agruparPorQuestao(linhas || []);
}

export async function registrarTentativa({ questaoId, correta, alternativa, tempoSeg }) {
  const linha = await req('/api/tentativas', {
    method: 'POST',
    body: {
      // O serviço recusa questao_id vazio e exige `correta` booleano; mandar
      // já no formato certo evita depender da mensagem de erro para descobrir.
      questao_id: String(questaoId),
      correta: correta === true,
      alternativa: Number.isInteger(alternativa) ? alternativa : null,
      tempo_seg: Number.isInteger(tempoSeg) && tempoSeg >= 0 ? tempoSeg : null,
    },
  });

  return paraFormatoLocal(linha);
}
