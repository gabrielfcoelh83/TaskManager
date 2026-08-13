// Regras do acervo de questões, sem rede e sem React.
//
// Estão separadas de `api.js` porque este arquivo não toca `import.meta.env`,
// e separadas da tela porque JSX não roda no `node` — é o que permite testar a
// tradução do gabarito num teste comum, sem navegador. A tradução é o ponto
// exato onde uma resposta certa vira errada em silêncio, então ela precisa de
// teste mais que qualquer outra coisa aqui.

// O serviço devolve a questão como ela é no acervo; as telas falam um dialeto
// herdado de quando o banco de questões era um arquivo no front.
export function paraQuestaoDeTela(q) {
  return {
    id: q.id,
    // Null enquanto a classificação por matéria não roda. Quem exibe precisa
    // tratar a ausência — inventar "Direito Constitucional" aqui seria pior
    // que não mostrar nada, porque pareceria informação.
    disciplina: q.disciplina ?? null,
    topico: q.tema ?? null,
    enunciado: q.enunciado,
    alternativas: q.alternativas,
    // `gabarito` e `correta` são a mesma coisa: o índice da alternativa certa.
    // É a única linha desta função que, escrita errada, transforma resposta
    // certa em errada sem levantar nenhum erro.
    correta: q.gabarito,
    banca: q.banca ?? null,
    ano: q.ano ?? null,
    exame: q.exame ?? null,
    numero: q.numero ?? null,
    explicacao: q.explicacao ?? null,
    explicacaoFonte: q.explicacao_fonte ?? null,
    revisada: q.revisada === true,
    // A FGV não publica dificuldade, então o acervo não tem essa coluna. Fica
    // null e quem mostrava o rótulo esconde, em vez de exibir um palpite com
    // cara de dado oficial.
    dificuldade: null,
  };
}

// Fisher-Yates. A ordem do acervo é a ordem do caderno, e sem embaralhar o
// quiz começaria sempre na questão 1 do exame mais recente — quem estuda todo
// dia veria as mesmas questões na mesma sequência.
export function embaralhar(lista) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// De onde o quiz tira questão.
//
// Enquanto a classificação por matéria não roda, `disciplina` vem nula e a
// única divisão real que existe é o exame. Escolher o critério a partir do que
// os dados TÊM, em vez de assumir disciplina, é o que evita a tela mostrar uma
// lista de fontes vazia com um botão que não gera nada — falha que pareceria
// defeito do servidor sendo só acervo sem rótulo.
export function montarFontes(questoes) {
  const porDisciplina = new Map();
  for (const q of questoes) {
    if (!q.disciplina) continue;
    porDisciplina.set(q.disciplina, (porDisciplina.get(q.disciplina) || 0) + 1);
  }

  if (porDisciplina.size > 0) {
    return {
      criterio: 'disciplina',
      chaveDe: (q) => q.disciplina,
      fontes: [...porDisciplina.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([nome, total]) => ({ chave: nome, rotulo: nome, total })),
    };
  }

  const porExame = new Map();
  for (const q of questoes) {
    const chave = q.exame == null ? 'sem-exame' : String(q.exame);
    porExame.set(chave, (porExame.get(chave) || 0) + 1);
  }

  return {
    criterio: 'exame',
    chaveDe: (q) => (q.exame == null ? 'sem-exame' : String(q.exame)),
    fontes: [...porExame.entries()]
      // Exame mais recente primeiro; o balde sem exame vai para o fim.
      .sort((a, b) => (Number(b[0]) || -1) - (Number(a[0]) || -1))
      .map(([exame, total]) => ({
        chave: exame,
        rotulo: exame === 'sem-exame' ? 'Outras questões' : `${exame}º Exame de Ordem`,
        total,
      })),
  };
}
