// Tamanho e sorteio do quiz.
//
// O quiz mede a meta do dia: a pessoa com meta de 4 questões faz 4, não as 80
// da matéria. Abrir tudo o que as fontes marcadas têm transforma um objetivo
// alcançável numa lista sem fim, e a barra de progresso do quiz passaria a
// medir outra coisa que não a meta. A mesma regra vale para o quiz montado na
// tela de Questões e para o atalho "Foco de hoje".

import { embaralhar } from './questions/acervo.js';

/**
 * Quantas questões o quiz tem: o que falta para a meta de hoje. Com a meta já
 * batida, quem pede outro quiz quer continuar — abre mais uma rodada do
 * tamanho da meta, e não "tudo".
 */
export function tamanhoDoQuiz(meta) {
  const alvo = Number(meta?.meta) > 0 ? Number(meta.meta) : 20;
  if (!meta || meta.batida) return alvo;
  return Math.max(1, Number(meta.faltam) || alvo);
}

const jaRespondida = (usuarioTentativas, q) =>
  (usuarioTentativas?.[q.id]?.tentativas?.length || 0) > 0;

/**
 * Sorteia `quantas` questões do `pool`, as nunca respondidas primeiro: com um
 * quiz curto, gastar a vaga com questão já vista é desperdiçar a meta. Dentro
 * de cada grupo a ordem é aleatória.
 */
export function sortearQuiz(pool, quantas, usuarioTentativas = {}, sortear = embaralhar) {
  const embaralhadas = sortear(pool || []);
  const novas = embaralhadas.filter((q) => !jaRespondida(usuarioTentativas, q));
  const vistas = embaralhadas.filter((q) => jaRespondida(usuarioTentativas, q));
  return [...novas, ...vistas].slice(0, Math.max(0, quantas));
}

// Quantas questões cada disciplina tem na 1ª fase. É a distribuição conferida
// no 44º e no 45º Exame (BLOCOS_44_45 em questoes-service/disciplinas.js, no
// TaskManager); o edital pode mudá-la, e aí as duas tabelas mudam juntas.
// Aqui ela só decide a PROPORÇÃO do quiz misto — nada é afirmado ao aluno
// sobre a prova a partir dela.
export const QUESTOES_NA_PROVA = {
  'Ética Profissional': 8,
  'Filosofia do Direito': 2,
  'Direito Constitucional': 6,
  'Direitos Humanos': 2,
  'Direito Eleitoral': 2,
  'Direito Internacional': 2,
  'Direito Financeiro': 2,
  'Direito Tributário': 5,
  'Direito Administrativo': 5,
  'Direito Ambiental': 2,
  'Direito Civil': 6,
  'Direito da Criança e do Adolescente': 2,
  'Direito do Consumidor': 2,
  'Direito Empresarial': 4,
  'Direito Processual Civil': 6,
  'Direito Penal': 6,
  'Direito Processual Penal': 6,
  'Direito Previdenciário': 2,
  'Direito do Trabalho': 5,
  'Direito Processual do Trabalho': 5,
};

// Disciplina fora da tabela (nome novo, grafia diferente) entra com o menor
// peso da prova, em vez de sumir do misto.
const pesoNaProva = (disciplina) => QUESTOES_NA_PROVA[disciplina] || 2;

/**
 * Quiz misto: um pouco de cada matéria, na proporção em que a prova cobra.
 *
 * As vagas são distribuídas uma a uma pelo método D'Hondt (cada vaga vai para
 * a matéria com maior peso / (vagas já recebidas + 1)). Com um quiz curto isso
 * espalha as vagas pelas matérias que mais pesam em vez de dar todas à maior:
 * 4 questões viram Ética + três matérias de peso 6, não 4 de Ética. Empate de
 * peso é decidido no sorteio, para o quiz de amanhã não repetir as mesmas.
 * Dentro de cada matéria vale a regra de `sortearQuiz` (nunca respondidas
 * primeiro), e o resultado sai embaralhado, sem blocos por matéria.
 *
 * Questão sem matéria fica de fora. Se nenhuma tem matéria (acervo ainda sem
 * classificação), não há proporção a seguir e o sorteio é o comum.
 */
export function sortearMisto(pool, quantas, usuarioTentativas = {}, chaveDe = (q) => q.disciplina, sortear = embaralhar) {
  const grupos = new Map();
  for (const q of pool || []) {
    const chave = chaveDe(q);
    if (!chave) continue;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(q);
  }
  if (grupos.size === 0) return sortearQuiz(pool, quantas, usuarioTentativas, sortear);

  // `sort` é estável: depois do sorteio, quem empata no peso fica na ordem
  // sorteada.
  const chaves = sortear([...grupos.keys()]).sort((a, b) => pesoNaProva(b) - pesoNaProva(a));
  const vagas = new Map(chaves.map((k) => [k, 0]));

  for (let restam = Math.max(0, quantas); restam > 0; restam--) {
    let melhor = null;
    let melhorValor = -1;
    for (const k of chaves) {
      if (vagas.get(k) >= grupos.get(k).length) continue; // matéria esgotada
      const valor = pesoNaProva(k) / (vagas.get(k) + 1);
      if (valor > melhorValor) {
        melhor = k;
        melhorValor = valor;
      }
    }
    if (melhor === null) break; // o acervo inteiro já entrou
    vagas.set(melhor, vagas.get(melhor) + 1);
  }

  const escolhidas = chaves.flatMap((k) => sortearQuiz(grupos.get(k), vagas.get(k), usuarioTentativas, sortear));
  return sortear(escolhidas);
}
