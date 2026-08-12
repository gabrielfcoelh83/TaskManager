// As disciplinas do app saem do acervo, não de uma lista escrita à mão.
//
// A lista antiga vivia em `mockData.js` com oito nomes e números inventados
// ("Direito Constitucional, 85%, 35h 20m"). Três problemas, nessa ordem de
// gravidade:
//
//   1. os 85% eram um número fixo no código, mostrado como se fosse o
//      desempenho de quem estava lendo;
//   2. as "35h 20m" mediam um tempo que o app nunca cronometrou;
//   3. o acervo tem 18 disciplinas classificadas — as outras 10 não existiam
//      em lugar nenhum da interface, então não dava para estudá-las por
//      matéria nem vê-las no desempenho.
//
// Aqui não há número inventado: tudo vem das questões carregadas e das
// tentativas que a pessoa realmente registrou.

// Paleta fixa, atribuída por hash do nome. Não é enfeite: a cor da disciplina
// aparece em três telas diferentes e precisa ser a MESMA nas três, sem depender
// da ordem em que a lista chegou.
const PALETA = [
  '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#10B981', '#EF4444',
  '#6366F1', '#0EA5E9', '#D946EF', '#84CC16', '#F97316', '#14B8A6',
];

export function corDaDisciplina(nome) {
  if (!nome) return '#9a93a1';

  let hash = 0;
  for (let i = 0; i < nome.length; i++) {
    hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  }
  return PALETA[hash % PALETA.length];
}

export function statusDe(tentativas, acertos) {
  if (tentativas === 0) return 'novo';
  const taxa = acertos / tentativas;
  if (taxa >= 0.8) return 'domina';
  if (taxa >= 0.5) return 'em-desenvolvimento';
  return 'necessita';
}

// As tentativas chegam indexadas por id de questão, e o id vem do Postgres
// como string. Comparar sem normalizar faz o histórico sumir em silêncio.
function tentativasDe(mapa, id) {
  const registro = mapa?.[String(id)] || mapa?.[id];
  return registro?.tentativas || [];
}

/**
 * A lista de disciplinas que a interface inteira usa.
 *
 * `total` é quantas questões o acervo tem na matéria — é o denominador da
 * cobertura, e é um dado do servidor. `respondidas` conta QUESTÕES distintas
 * já respondidas (não tentativas), porque responder a mesma questão cinco
 * vezes não aumenta cobertura. `pct` é taxa de acerto sobre TENTATIVAS, que é
 * a pergunta "eu acerto essa matéria?" — outra coisa.
 */
export function montarDisciplinas(questoes = [], tentativas = {}) {
  const mapa = new Map();

  for (const q of questoes) {
    const nome = q.disciplina || 'Sem classificação';
    if (!mapa.has(nome)) {
      mapa.set(nome, {
        nome,
        cor: corDaDisciplina(q.disciplina ? nome : null),
        total: 0,
        respondidas: 0,
        tentativas: 0,
        acertos: 0,
        tempoSeg: 0,
        amostrasDeTempo: 0,
        // Enquanto a classificação for de IA e ninguém tiver revisado, a
        // disciplina é uma hipótese. A tela precisa poder dizer isso.
        semRevisao: 0,
        classificada: Boolean(q.disciplina),
      });
    }

    const d = mapa.get(nome);
    d.total += 1;
    if (!q.revisada) d.semRevisao += 1;

    const hist = tentativasDe(tentativas, q.id);
    if (hist.length > 0) d.respondidas += 1;

    for (const t of hist) {
      d.tentativas += 1;
      if (t.correta === true) d.acertos += 1;
      if (t.tempo_gasto_segundos != null) {
        d.tempoSeg += t.tempo_gasto_segundos;
        d.amostrasDeTempo += 1;
      }
    }
  }

  return [...mapa.values()]
    .map((d) => ({
      ...d,
      pct: d.tentativas > 0 ? Math.round((d.acertos / d.tentativas) * 100) : null,
      cobertura: d.total > 0 ? Math.round((d.respondidas / d.total) * 100) : 0,
      tempoMedioSeg: d.amostrasDeTempo > 0 ? Math.round(d.tempoSeg / d.amostrasDeTempo) : null,
      status: statusDe(d.tentativas, d.acertos),
    }))
    // Sem classificação vai para o fim: é o balde do que ainda não foi
    // classificado, não uma matéria.
    .sort((a, b) => Number(a.classificada === false) - Number(b.classificada === false) || b.total - a.total || a.nome.localeCompare(b.nome));
}

/**
 * Os temas dentro de uma disciplina — também do acervo, também com o
 * desempenho real de quem está lendo.
 */
export function temasDaDisciplina(questoes = [], tentativas = {}, disciplina) {
  const daMateria = questoes.filter((q) => (q.disciplina || 'Sem classificação') === disciplina);
  const mapa = new Map();

  for (const q of daMateria) {
    const nome = q.topico || 'Sem tema';
    if (!mapa.has(nome)) mapa.set(nome, { nome, total: 0, respondidas: 0, tentativas: 0, acertos: 0 });

    const t = mapa.get(nome);
    t.total += 1;

    const hist = tentativasDe(tentativas, q.id);
    if (hist.length > 0) t.respondidas += 1;
    for (const tent of hist) {
      t.tentativas += 1;
      if (tent.correta === true) t.acertos += 1;
    }
  }

  return [...mapa.values()]
    .map((t) => ({
      ...t,
      pct: t.tentativas > 0 ? Math.round((t.acertos / t.tentativas) * 100) : null,
      status: statusDe(t.tentativas, t.acertos),
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/**
 * A ordem em que vale a pena estudar: primeiro o que se erra, depois o que
 * nunca foi tocado, e por último o que já se domina. É daqui que saem tanto a
 * sugestão do cronograma quanto o "próximo passo" do dashboard — as duas
 * telas davam conselhos diferentes porque cada uma tinha o seu critério.
 */
export function prioridadeDeEstudo(disciplinas = []) {
  const peso = { necessita: 0, 'em-desenvolvimento': 1, novo: 2, domina: 3 };

  return [...disciplinas]
    .filter((d) => d.classificada !== false && d.total > 0)
    .sort((a, b) => {
      const dif = peso[a.status] - peso[b.status];
      if (dif !== 0) return dif;
      if (a.status === 'novo') return b.total - a.total;      // mais questões primeiro
      return (a.pct ?? 100) - (b.pct ?? 100);                 // pior taxa primeiro
    });
}
