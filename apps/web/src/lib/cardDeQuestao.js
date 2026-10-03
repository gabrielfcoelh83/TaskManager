// Regras do card de questão sem React: o cabeçalho de procedência, a trilha
// "Disciplina › Tema", o risco de alternativa e o histórico de tentativas de
// UMA questão. Ficam aqui pelo mesmo motivo de `simulado.js`: JSX não roda no
// `node`, e é nestas funções que um `undefined` vaza para a tela ou uma data
// cai no dia errado — tests/cardDeQuestao.test.js roda em UTC e em São Paulo.

// O app é de quem presta a OAB, e "respondida em 28/02" tem de ser o dia do
// calendário de quem respondeu. Fixar o fuso, em vez de usar o do navegador,
// faz a data ser a mesma em qualquer máquina — e o teste não depender do TZ
// de quem roda.
const FUSO_DO_BRASIL = 'America/Sao_Paulo';

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

const LETRA = (i) => String.fromCharCode(65 + i);

const partesDaData = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DO_BRASIL,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * 'DD/MM/AAAA' no fuso de São Paulo, ou null se a data não for legível.
 *
 * Monta pelas partes em vez de pedir o formato 'pt-BR': um Node sem os dados
 * de idioma completos cai em silêncio no formato americano (02/28/2026), e o
 * dia e o mês trocariam de lugar sem erro nenhum.
 *
 * Data sem hora ('AAAA-MM-DD') já é um dia do calendário e volta como está —
 * passá-la por `new Date` a leria como meia-noite UTC, que no Brasil ainda é
 * o dia anterior (o mesmo cuidado de `dateKey` em metrics.js).
 */
export function formatarDataBR(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'string') {
    const so = SO_DATA.exec(valor);
    if (so) return `${so[3]}/${so[2]}/${so[1]}`;
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(partesDaData.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year}`;
}

/**
 * "45º Exame · 2025 · FGV · Questão 12".
 *
 * Questão sem procedência (mock antigo, acervo incompleto) não pode virar
 * "undefinedº Exame · null": cada pedaço só entra se existir, e sem exame o
 * começo é o genérico "Exame de Ordem" — o mesmo de `origemDaQuestao`.
 * "Questão 12" é o número no caderno da FGV, não a posição no quiz.
 */
export function cabecalhoDaQuestao(q) {
  if (!q) return 'Exame de Ordem';
  const exame = Number(q.exame);
  const partes = [Number.isInteger(exame) && exame > 0 ? `${exame}º Exame` : 'Exame de Ordem'];
  if (q.ano) partes.push(String(q.ano));
  if (q.banca) partes.push(String(q.banca));
  if (q.numero) partes.push(`Questão ${q.numero}`);
  return partes.join(' · ');
}

/**
 * A trilha "Disciplina › Tema", ou null quando não há nenhum dos dois.
 *
 * O tema do acervo chega à tela como `topico` (ver `paraQuestaoDeTela`); o
 * mock antigo também usava esse nome. Enquanto a classificação não roda, os
 * dois vêm nulos e a tela não mostra trilha nenhuma — inventar uma seria
 * pior que deixar o espaço vazio.
 */
export function trilhaDaQuestao(q) {
  if (!q) return null;
  const disciplina = q.disciplina || null;
  const tema = q.topico || q.tema || null;
  if (!disciplina && !tema) return null;
  return { disciplina, tema };
}

/** Risca a alternativa `i`, ou desfaz o risco se ela já estava riscada. */
export function alternarRisco(riscadas = [], i) {
  return riscadas.includes(i)
    ? riscadas.filter((x) => x !== i)
    : [...riscadas, i].sort((a, b) => a - b);
}

/**
 * As tentativas de uma questão, da mais recente para a mais antiga.
 *
 * `usuarioTentativas` é o histórico do App, agrupado pelo id do acervo
 * (`agruparPorQuestao` em api.js). A chave é texto — o id vem do Postgres como
 * string —, mas a questão da tela traz o id como número; objeto JS converte
 * os dois para o mesmo texto, então basta indexar.
 *
 * A ordem não confia no array: a carga do servidor vem cronológica, mas a
 * resposta gravada nesta sessão entra no fim, e uma data ilegível não pode
 * passar à frente da última tentativa de verdade.
 */
export function historicoDaQuestao(usuarioTentativas, questaoId) {
  const registro = questaoId == null ? null : usuarioTentativas?.[questaoId];
  const brutas = Array.isArray(registro?.tentativas) ? registro.tentativas : [];

  const tentativas = brutas
    .map((t, ordem) => {
      const instante = new Date(t?.data ?? NaN).getTime();
      const alternativa = Number.isInteger(t?.resposta) ? t.resposta : null;
      return {
        id: t?.id ?? null,
        data: t?.data ?? null,
        dataFormatada: formatarDataBR(t?.data),
        alternativa,
        letra: alternativa === null ? null : LETRA(alternativa),
        correta: t?.correta === true,
        instante: Number.isNaN(instante) ? null : instante,
        ordem,
      };
    })
    .sort((a, b) => {
      if (a.instante === null && b.instante === null) return b.ordem - a.ordem;
      if (a.instante === null) return 1;
      if (b.instante === null) return -1;
      return b.instante - a.instante || b.ordem - a.ordem;
    })
    // `instante` e `ordem` só servem à ordenação; fora daqui não existem.
    .map((t) => ({
      id: t.id, data: t.data, dataFormatada: t.dataFormatada,
      alternativa: t.alternativa, letra: t.letra, correta: t.correta,
    }));

  return { tentativas, ultima: tentativas[0] || null, total: tentativas.length };
}
