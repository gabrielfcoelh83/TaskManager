// Quem está usando o app.
//
// Até aqui o front respondia essa pergunta com um nome escrito à mão em
// `DEFAULT_STATE` — "Maria Laís". Todo mundo que entrava virava Maria Laís,
// inclusive quem tinha acabado de criar a conta com outro nome. O servidor
// sempre soube o nome certo (`GET /api/users/:id`); o front é que não
// perguntava.
//
// Estas funções são puras de propósito: são elas que decidem o que aparece
// no topo da tela e na barra lateral, e isso precisa ser testável sem rede.

/**
 * Lê o payload do JWT sem verificar assinatura.
 *
 * Verificar aqui não faria sentido: o segredo está no servidor, e é ele quem
 * recusa token inválido em toda chamada. O front só precisa do `id` para
 * saber a qual perfil pedir — se o token for falso, o pedido volta 401.
 */
export function payloadDoToken(token) {
  if (typeof token !== 'string') return null;

  const partes = token.split('.');
  if (partes.length !== 3) return null;

  try {
    // base64url → base64: o JWT troca + por - e / por _, e corta o padding.
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const preenchido = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = JSON.parse(atob(preenchido));

    if (json?.id === undefined || json?.id === null) return null;
    return { id: json.id, email: json.email ?? null };
  } catch {
    // Token truncado, payload que não é JSON, atob indisponível: nenhum
    // desses casos vale derrubar a tela. Quem chama trata o null.
    return null;
  }
}

/** "Gabriel Ferreira Coelho" → "Gabriel". Vazio vira null, não string vazia. */
export function primeiroNome(nome) {
  if (typeof nome !== 'string') return null;
  const limpo = nome.trim();
  if (!limpo) return null;
  return limpo.split(/\s+/)[0];
}

/**
 * As iniciais do avatar. Duas letras no máximo, e o sobrenome vem do ÚLTIMO
 * pedaço do nome — "Ana Maria de Souza" vira "AS", não "AM".
 */
export function iniciais(nome, alternativa = '?') {
  if (typeof nome !== 'string' || !nome.trim()) return alternativa;

  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * O que aparece no topo do dashboard.
 *
 * Sem nome ainda (perfil carregando, ou conta criada sem nome) a saudação
 * fica sem vocativo em vez de inventar um: "Olá!" é honesto, "Olá, Maria!"
 * para o Gabriel não é.
 */
export function saudacao(nome) {
  const primeiro = primeiroNome(nome);
  return primeiro ? `Olá, ${primeiro}!` : 'Olá!';
}

/**
 * O nome exibido quando o perfil não veio: o trecho antes do @ do e-mail.
 * É o mesmo critério que o user-service usa quando `name` não é enviado no
 * cadastro, então as duas pontas mostram a mesma coisa.
 */
export function nomeDeExibicao(perfil, email) {
  const doPerfil = typeof perfil?.name === 'string' ? perfil.name.trim() : '';
  if (doPerfil) return doPerfil;

  const enderec = perfil?.email || email;
  if (typeof enderec === 'string' && enderec.includes('@')) return enderec.split('@')[0];

  return null;
}
