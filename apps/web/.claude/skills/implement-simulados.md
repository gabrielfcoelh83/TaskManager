---
description: Implement Simulados (advanced practice exams) with timer and customizable settings
tags: [frontend, simulados, module9]
---

# Skill: implement-simulados

## Objetivo
Implementar Simulados Avançados com cronômetro, seleção de tipo/disciplina, 10-80 questões personalizáveis.

## Entrada
- Componentes criados: ConfigSimulado.jsx, Cronometro.jsx
- Estado em App.jsx: resultados_historico: []
- QUESTOES array disponível (30 questões de mock data)
- Disciplinas: Direito Constitucional, Administrativo, Penal, Civil

## Processo

### 1. Criar ConfigSimulado.jsx
Componente de configuração com:
- Radio buttons: tipo ("Geral" vs "Por Disciplina")
- Select dropdown: disciplina (visível somente se tipo === "Por Disciplina")
- Slider: quantidade (10-80 questões, step=5)
- Botão: "Iniciar Simulado"

### 2. Criar Cronometro.jsx
Componente de cronômetro com:
- Countdown timer: minutos:segundos
- Cores dinâmicas:
  - Verde: > 10 minutos
  - Amarelo: 5-10 minutos
  - Vermelho: < 5 minutos
- Callback aoTerminar() quando tempo expira
- Display: "15:30" (minutos:segundos com zero-padding)

### 3. Reescrever Simulados.jsx (4 etapas)

**Etapa 1: Lista (initial state)**
- Mostrar histórico de simulados anteriores
- Card por simulado: disciplina, quantidade, nota, data
- Botão "Novo Simulado" → vai para etapa 2

**Etapa 2: Configuração (config state)**
- Renderizar ConfigSimulado.jsx
- Selecionar tipo, disciplina, quantidade
- Botão "Iniciar" → vai para etapa 3

**Etapa 3: Execução (execution state)**
- Cronometro.jsx no topo
- Questão atual (nº/total)
- Alternativas (clicáveis)
- Ao responder: registrar resposta, ir para próxima
- Quando terminar: vai para etapa 4

**Etapa 4: Resultado (result state)**
- Mostrar nota final: (acertos/quantidade) * 100
- Mostrar acertos/erros por disciplina (se aplicável)
- Mostrar tempo decorrido
- Histórico de respostas (opcional)
- Botão "Voltar para Lista"

### 4. Integração com App.jsx
- Adicionar state: `resultados_historico: []`
- Pass `usuarioState`, `onUpdateState`, `QUESTOES` para Simulados.jsx
- Persistir histórico em localStorage via App

### 5. Lógica de Simulado

**Pool de questões**:
```javascript
const pool = QUESTOES.filter(q => 
  tipo === 'geral' ? true : q.disciplina === disciplina_selecionada
);
```

**Embaralhado**:
```javascript
const shuffled = pool.sort(() => Math.random() - 0.5);
```

**Selecionado**:
```javascript
const simulado = shuffled.slice(0, quantidade);
```

**Tempo total**:
```javascript
const minutos = quantidade * 1.5;  // ex: 30 questões = 45 minutos
const segundos = minutos * 60;
```

**Cálculo de nota**:
```javascript
const acertos = simulado.filter((q, i) => respostas[i] === q.correta).length;
const nota = (acertos / quantidade) * 100;
```

**Resultado stored**:
```javascript
{
  id: uuid,
  data: ISO timestamp,
  tipo: "geral" | "disciplina",
  disciplina: string,
  quantidade: number,
  acertos: number,
  nota: number,
  tempo_decorrido_segundos: number,
  questoes: [...]
}
```

## Saída esperada
- ConfigSimulado.jsx funcional (seleção tipo/disciplina/quantidade)
- Cronometro.jsx funcional (countdown, cores dinâmicas)
- Simulados.jsx com 4 etapas completas
- Histórico persistente em localStorage
- E2E test para fluxo completo de simulado
- npm run dev sem erros
- npm run test:e2e com teste de simulado passando

## UI Sketch

### ConfigSimulado.jsx
```
┌─────────────────────────────────┐
│     Configurar Simulado         │
├─────────────────────────────────┤
│ Tipo:                           │
│ ◯ Geral                        │
│ ◯ Por Disciplina               │
│                                 │
│ Disciplina: [Constitucional  ▼] │
│                                 │
│ Quantidade: 10 ────●──── 80     │
│ (30 questões)                   │
│                                 │
│     [ Iniciar Simulado ]        │
└─────────────────────────────────┘
```

### Simulados.jsx (Execução)
```
┌─────────────────────────────────┐
│ ⏱ 15:30  (verde/amarelo/vermelho)
├─────────────────────────────────┤
│ Questão 5 de 30                 │
│                                 │
│ Qual é o direito à vida...?    │
│                                 │
│ ☐ A) Primeira opção            │
│ ☐ B) Segunda opção             │
│ ☐ C) Terceira opção            │
│ ☐ D) Quarta opção              │
│                                 │
└─────────────────────────────────┘
```

## Validação
- [ ] ConfigSimulado: seleção tipo funciona
- [ ] ConfigSimulado: disciplina aparece/some conforme tipo
- [ ] ConfigSimulado: slider 10-80 funciona
- [ ] Cronometro: countdown funciona (decrementa a cada segundo)
- [ ] Cronometro: cores mudam conforme tempo restante
- [ ] Questões: embaralhadas (ordem aleatória)
- [ ] Respostas: registradas corretamente
- [ ] Nota: calculada (acertos/quantidade)*100
- [ ] Histórico: persiste em localStorage
- [ ] Etapas: transição suave entre 4 etapas
- [ ] npm run dev sem erros
- [ ] npm run test:e2e com teste simulado passando
- [ ] Commit: "Feat: simulados com cronômetro e seleção customizável"
