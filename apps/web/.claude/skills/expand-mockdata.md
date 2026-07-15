---
description: Expand mock data from 6 to 30 questions with new schema
tags: [frontend, mockdata, module1]
---

# Skill: expand-mockdata

## Objetivo
Expandir src/lib/mockData.js de 6 para 30 questões com schema completo e enriquecido.

## Entrada
- Arquivo: src/lib/mockData.js (atual com 6 questões)
- Número de questões alvo: 30
- Disciplinas: 3-4 (Direito Constitucional, Administrativo, Penal, Civil)
- Dificuldades: misturadas (Fácil, Média, Difícil)

## Processo
1. Ler src/lib/mockData.js atual
2. Entender schema existente (id, disciplina, dificuldade, banca, ano, enunciado, alternativas, correta)
3. Expandir com NOVO schema:
   - `topico` (ex: "Direitos Fundamentais")
   - `subtopico` (ex: "Direito à vida")
   - `explicacao` (por que resposta está certa)
   - `errosComuns` (array de {alternativa, motivo})
   - `referencias` (array de artigos/leis)
4. Criar 30 questões com distribuição:
   - Direito Constitucional: 10 questões
   - Direito Administrativo: 8 questões
   - Direito Penal: 7 questões
   - Direito Civil: 5 questões
5. Validar estrutura JSON
6. Testar: npm run dev (sem erros de console)

## Saída esperada
- src/lib/mockData.js com 30 questões
- QUESTOES.length === 30
- Todas as questões com novo schema (topico, subtopico, explicacao, errosComuns, referencias)
- Zero console errors ao rodar npm run dev
- localStorage funciona corretamente

## Exemplo de questão (output)
```javascript
{
  id: 1,
  disciplina: 'Direito Constitucional',
  topico: 'Direitos Fundamentais',
  subtopico: 'Direito à vida',
  dificuldade: 'Fácil',
  banca: 'FGV',
  ano: 2023,
  enunciado: 'De acordo com CF/88, qual direito está previsto no Art. 5º?',
  alternativas: [
    'Direito de propriedade sem restrições',
    'Direito à vida',
    'Direito de escravidão',
    'Direito de discriminação'
  ],
  correta: 1,
  explicacao: 'A resposta correta é B porque a CF/88 em seu Art. 5º, caput, garante o direito à vida como direito fundamental inalienável.',
  errosComuns: [
    { 
      alternativa: 0, 
      motivo: 'Confunde direito de propriedade com direito à vida. Propriedade tem restrições constitucionais.' 
    },
    { 
      alternativa: 2, 
      motivo: 'Escravidão é vedada desde 1888 no Brasil.' 
    }
  ],
  referencias: ['CF/88 Art. 5º', 'Lei 10.406/2002 (CC)']
}
```

## Validação
- [ ] QUESTOES.length === 30
- [ ] Cada questão tem: id, disciplina, topico, subtopico, dificuldade, banca, ano, enunciado, alternativas, correta, explicacao, errosComuns, referencias
- [ ] Estrutura JSON válida (pode ser parsed)
- [ ] npm run dev sem console errors
- [ ] localStorage funciona (dados persistem após refresh)
- [ ] Todas 4 disciplinas representadas
- [ ] Distribuição de dificuldades variada
- [ ] Commit: "Expand: 30 questões com topico/subtopico"
