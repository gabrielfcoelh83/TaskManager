// Classifica por disciplina e tema as questões que ainda não têm.
//
//   node classificar.js                    # mostra o que faria, não grava
//   node classificar.js --aplicar          # grava
//   node classificar.js --exame 45 --lote 8 --aplicar
//
// ONDE ENTRA A IA, E ONDE NÃO ENTRA
// O modelo escolhe um RÓTULO de uma lista fechada. Ele não vê, não escreve e
// não pode alterar enunciado, alternativas ou gabarito — essas colunas nem
// aparecem no UPDATE. Um rótulo errado põe a questão na gaveta errada; um
// gabarito errado ensina Direito errado. Só a primeira coisa é reversível, e é
// por isso que só ela é confiada a um modelo.
//
// A disciplina gravada sai marcada como `disciplina_fonte = 'ia'` e a questão
// continua `revisada = false`. Ninguém precisa confiar nisto: precisa saber
// de onde veio.
//
// Roda à mão, fora do serviço, como o carregar.js. O serviço não tem rota de
// escrita, e uma rota que aceitasse classificação seria a porta pela qual um
// enriquecimento não conferido entraria sozinho.

const { pool } = require('./app');
const { migrate } = require('./migrate');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Ordem de preferência; qualquer falha cai para o próximo. Modelos gratuitos:
// classificar 80 questões não justifica gasto, e escolher rótulo de uma lista
// fechada é tarefa fácil o bastante para eles.
//
// Estes ids foram conferidos contra GET /api/v1/models antes de entrar aqui, e
// isso não é zelo excessivo: os três ids que este arquivo tinha na primeira
// versão — copiados da rota de geração do front — NÃO EXISTEM na OpenRouter.
// Model id errado devolve 404, o laço cai para o próximo, o último também
// falha, e o resultado é "nenhum modelo respondeu" — que parece rede ruim ou
// chave inválida. Ao trocar um id, confira contra a API, não contra a memória
// de como o modelo se chama.
const MODELOS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'openai/gpt-oss-20b:free',
];

// Lista fechada, tirada do edital da 1ª fase. É o coração deste arquivo.
//
// O modelo não devolve disciplina: ele ESCOLHE uma daqui. Qualquer coisa fora
// da lista é recusada e a questão fica sem classificação, para ser vista de
// novo na próxima rodada. Sem isso, o acervo acumularia "Direito Civil",
// "Civil", "D. Civil" e "Direito Civil e Processual Civil" como quatro
// disciplinas diferentes, e o filtro da tela mostraria as quatro.
const DISCIPLINAS = [
  'Ética Profissional',
  'Filosofia do Direito',
  'Direito Constitucional',
  'Direitos Humanos',
  'Direito Internacional',
  'Direito Tributário',
  'Direito Administrativo',
  'Direito Ambiental',
  'Direito Civil',
  'Direito do Consumidor',
  'Direito da Criança e do Adolescente',
  'Direito Empresarial',
  'Direito Processual Civil',
  'Direito Penal',
  'Direito Processual Penal',
  'Direito do Trabalho',
  'Direito Processual do Trabalho',
  'Direito Previdenciário',
];

const VALIDAS = new Set(DISCIPLINAS);

const PROMPT_SISTEMA = `Você classifica questões do Exame de Ordem da OAB.

Para cada questão, escolha a disciplina EXATAMENTE como escrita na lista abaixo
e um tema curto (2 a 5 palavras) dentro dela.

Lista de disciplinas permitidas:
${DISCIPLINAS.map((d) => `- ${d}`).join('\n')}

Regras:
- A disciplina DEVE ser copiada literalmente da lista. Não invente, não abrevie,
  não junte duas.
- Se não tiver certeza, use "Direito Constitucional" apenas se a questão for
  mesmo constitucional; caso contrário devolva "disciplina": null para aquela
  questão. Preferimos sem classificação a com classificação errada.
- Responda APENAS com JSON válido, sem markdown e sem comentários.`;

function montarPrompt(questoes) {
  const itens = questoes.map((q) => ({
    id: q.id,
    // Enunciado cortado: o começo já diz a matéria, e mandar 80 enunciados
    // inteiros estoura o contexto dos modelos gratuitos.
    enunciado: String(q.enunciado).slice(0, 700),
  }));

  return `Classifique estas ${questoes.length} questões.

${JSON.stringify(itens, null, 2)}

Responda no formato:
[{"id": 123, "disciplina": "Direito Penal", "tema": "Crimes contra o patrimônio"}]`;
}

// Separada da chamada de rede de propósito: é a parte que decide o que entra
// no banco, e é a que precisa de teste sem internet.
function interpretarResposta(texto, questoes) {
  const idsDoLote = new Set(questoes.map((q) => q.id));

  const limpo = String(texto || '')
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error('resposta do modelo não contém lista JSON');
  }

  const bruto = JSON.parse(limpo.slice(inicio, fim + 1));
  if (!Array.isArray(bruto)) throw new Error('resposta do modelo não é uma lista');

  const aceitas = [];
  const recusadas = [];

  for (const item of bruto) {
    const id = Number(item?.id);

    // Id que não estava no lote: o modelo inventou ou repetiu de outro lote.
    // Gravar por id inventado escreveria numa questão que ninguém mandou
    // classificar.
    if (!idsDoLote.has(id)) {
      recusadas.push({ id: item?.id, motivo: 'id fora do lote' });
      continue;
    }

    if (item.disciplina === null || item.disciplina === undefined) {
      recusadas.push({ id, motivo: 'modelo não soube classificar' });
      continue;
    }

    const disciplina = String(item.disciplina).trim();

    // A comparação é exata, sem normalizar acento nem caixa. Normalizar
    // aceitaria "direito penal" hoje e abriria a porta para aceitar
    // "Dir. Penal" amanhã — e a lista fechada perderia o sentido.
    if (!VALIDAS.has(disciplina)) {
      recusadas.push({ id, motivo: `disciplina fora da lista: ${JSON.stringify(disciplina)}` });
      continue;
    }

    const tema = item.tema == null ? null : String(item.tema).trim().slice(0, 120) || null;

    aceitas.push({ id, disciplina, tema });
  }

  return { aceitas, recusadas };
}

async function chamarOpenRouter(prompt, { chave, modelos = MODELOS } = {}) {
  if (!chave) throw new Error('OPENROUTER_API_KEY não definida');

  let ultimoErro = null;

  for (const modelo of modelos) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          'X-Title': 'MA Questoes - classificacao',
        },
        body: JSON.stringify({
          model: modelo,
          messages: [
            { role: 'system', content: PROMPT_SISTEMA },
            { role: 'user', content: prompt },
          ],
          // Zero: classificar não é tarefa criativa, e temperatura alta aqui
          // só produz variação entre rodadas do mesmo acervo.
          temperature: 0,
          max_tokens: 2048,
        }),
      });

      if (!res.ok) {
        ultimoErro = new Error(`${modelo}: HTTP ${res.status}`);
        continue;
      }

      const dados = await res.json();
      const conteudo = dados?.choices?.[0]?.message?.content;
      if (!conteudo) {
        ultimoErro = new Error(`${modelo}: resposta sem conteúdo`);
        continue;
      }

      return { conteudo, modelo };
    } catch (err) {
      ultimoErro = err;
    }
  }

  throw ultimoErro || new Error('nenhum modelo respondeu');
}

async function buscarPendentes(cliente, { exame, limite, ignorar = [] }) {
  const valores = [];
  const condicoes = ['disciplina IS NULL'];

  if (exame != null) {
    valores.push(exame);
    condicoes.push(`exame = $${valores.length}`);
  }

  // Questões já tentadas nesta rodada saem da busca. Sem isto, um lote que
  // falha continua sem disciplina, volta na próxima busca, falha de novo — e
  // a rodada gira até o teto do `--total` repetindo as mesmas questões.
  if (ignorar.length > 0) {
    valores.push(ignorar);
    condicoes.push(`id <> ALL($${valores.length}::bigint[])`);
  }

  valores.push(limite);

  const { rows } = await cliente.query(
    `SELECT id, exame, numero, enunciado
       FROM questoes
      WHERE ${condicoes.join(' AND ')}
      ORDER BY exame DESC, numero ASC
      LIMIT $${valores.length}`,
    valores
  );

  // BIGSERIAL chega do `pg` como STRING — int8 não cabe com segurança num
  // number de JavaScript, então o driver não converte por conta própria.
  // Normalizar aqui é o que impede o `Set` de ids do lote de comparar "101"
  // com 101 e recusar toda classificação como "id fora do lote".
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

async function gravar(cliente, aceitas) {
  let gravadas = 0;

  for (const item of aceitas) {
    // O WHERE repete `disciplina IS NULL`: entre a leitura e a escrita alguém
    // pode ter classificado à mão, e uma classificação humana não pode ser
    // sobrescrita por uma de modelo.
    const { rowCount } = await cliente.query(
      `UPDATE questoes
          SET disciplina       = $2,
              tema             = $3,
              disciplina_fonte = 'ia',
              atualizada_em    = NOW()
        WHERE id = $1 AND disciplina IS NULL`,
      [item.id, item.disciplina, item.tema]
    );
    gravadas += rowCount;
  }

  return gravadas;
}

// `chamarModelo` é injetável para o teste rodar sem rede.
async function classificar({
  exame = null,
  lote = 10,
  total = 1000,
  aplicar = false,
  chamarModelo,
  log = console.log,
} = {}) {
  const cliente = await pool.connect();

  const resumo = { lidas: 0, aceitas: 0, recusadas: [], gravadas: 0, lotesComErro: 0 };

  try {
    let restantes = total;
    const jaTentadas = [];

    while (restantes > 0) {
      const pendentes = await buscarPendentes(cliente, {
        exame,
        limite: Math.min(lote, restantes),
        ignorar: jaTentadas,
      });

      if (pendentes.length === 0) break;
      resumo.lidas += pendentes.length;
      jaTentadas.push(...pendentes.map((p) => p.id));

      let interpretada;
      try {
        const { conteudo } = await chamarModelo(montarPrompt(pendentes));
        interpretada = interpretarResposta(conteudo, pendentes);
      } catch (err) {
        // Um lote que falha não derruba a rodada: as questões dele continuam
        // sem disciplina e voltam na próxima execução. O que não pode
        // acontecer é a rodada inteira parar na questão 30 de 80.
        log(`  ⚠️  lote falhou (${err.message}) — segue para o próximo`);
        resumo.lotesComErro++;
        restantes -= pendentes.length;
        continue;
      }

      resumo.aceitas += interpretada.aceitas.length;
      resumo.recusadas.push(...interpretada.recusadas);

      for (const item of interpretada.aceitas) {
        const q = pendentes.find((p) => p.id === item.id);
        log(`  ${q.exame}º/${q.numero}  ${item.disciplina}${item.tema ? ` · ${item.tema}` : ''}`);
      }

      if (aplicar) {
        resumo.gravadas += await gravar(cliente, interpretada.aceitas);
      }

      restantes -= pendentes.length;

      // Sem `aplicar` o banco não muda, mas a rodada continua: quem decide se
      // vale aplicar precisa ver o acervo inteiro classificado, não os dez
      // primeiros. Quem impede o laço de reencontrar as mesmas questões é a
      // lista `jaTentadas`, não a gravação.
    }
  } finally {
    cliente.release();
  }

  return resumo;
}

module.exports = { classificar, interpretarResposta, montarPrompt, chamarOpenRouter, DISCIPLINAS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = argv.indexOf(nome);
    return i === -1 ? padrao : Number(argv[i + 1]);
  };

  const aplicar = argv.includes('--aplicar');
  const exame = valor('--exame', null);
  const lote = valor('--lote', 10);
  const total = valor('--total', 1000);
  const chave = process.env.OPENROUTER_API_KEY;

  if (!chave) {
    console.error('❌ OPENROUTER_API_KEY não definida.');
    console.error('   Ex.: OPENROUTER_API_KEY=$(cat ~/.openrouter-key) node classificar.js --aplicar');
    process.exit(1);
  }

  if (!aplicar) {
    console.log('🔍 Modo de conferência: nada será gravado. Use --aplicar para valer.\n');
  }

  migrate(pool)
    .then(() =>
      classificar({
        exame,
        lote,
        total,
        aplicar,
        chamarModelo: (prompt) => chamarOpenRouter(prompt, { chave }),
      })
    )
    .then((r) => {
      console.log(`\n${r.lidas} lida(s), ${r.aceitas} classificada(s), ${r.recusadas.length} recusada(s)`);
      if (aplicar) console.log(`${r.gravadas} gravada(s) no banco`);
      if (r.lotesComErro) console.log(`${r.lotesComErro} lote(s) falharam e voltam na próxima rodada`);
      for (const rec of r.recusadas.slice(0, 20)) {
        console.log(`  recusada ${rec.id}: ${rec.motivo}`);
      }
      return pool.end();
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exit(1);
    });
}
