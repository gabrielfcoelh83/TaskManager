---
description: Implement tracking + metacognition modal in Questoes.jsx
tags: [frontend, tracking, module3]
---

# Skill: implement-tracking

## Objetivo
Implementar rastreamento completo de tentativas e modal de metacognição em Questoes.jsx.

## Entrada
- Arquivo: src/screens/Questoes.jsx
- Estado: App.jsx com usuarioTentativas
- Estrutura: Array de tentativas por questão

## Processo
1. Ler Questoes.jsx e App.jsx
2. Adicionar tempoInicio quando questão é exibida
3. Modificar pickAlt() para registrar tentativa com:
   - `data` (ISO timestamp quando responde)
   - `resposta` (índice da alternativa selecionada: 0-3)
   - `correta` (boolean: acertou ou errou)
   - `tempo_gasto_segundos` (calc: now - tempoInicio)
   - `tipo` (null inicialmente, preenchido pelo modal)
   - `certeza` (0-100, default 50)
4. Após pickAlt(), abrir modal de metacognição
5. Modal pergunta: "Como você chegou nessa resposta?"
   - Opção 1: "Certeza absoluta" → tipo: "acerto-conceitual"
   - Opção 2: "Boa intuição" → tipo: "acerto-conceitual"
   - Opção 3: "Eliminei alternativas" → tipo: "acerto-chute"
   - Opção 4: "Chute puro" → tipo: "acerto-chute"
6. Modal também pergunta certeza (slider 0-100)
7. Atualizar tentativa com tipo e certeza
8. Ir para próxima questão automaticamente
9. Persistir usuarioTentativas em localStorage

## Saída esperada
- Questoes.jsx com rastreamento completo
- Modal de metacognição funcional (4 opções)
- Escolher tipo → próxima questão automaticamente
- usuarioTentativas atualizado em App state
- localStorage persiste dados após refresh

## Estrutura de tentativa (output)
```javascript
// Em App.jsx: usuarioTentativas[questao_id].tentativas
[
  {
    data: "2025-07-15T14:30:00Z",
    resposta: 1,  // índice da alternativa (0-3)
    correta: true,
    tempo_gasto_segundos: 45,
    tipo: "acerto-conceitual",
    certeza: 90
  },
  {
    data: "2025-07-15T14:32:15Z",
    resposta: 2,
    correta: false,
    tempo_gasto_segundos: 32,
    tipo: "acerto-chute",
    certeza: 40
  }
]
```

## Modal UI (pseudocódigo)
```
┌─────────────────────────────────────┐
│  Como você chegou nessa resposta?   │
├─────────────────────────────────────┤
│                                     │
│ ◯ Certeza absoluta                 │
│ ◯ Boa intuição                     │
│ ◯ Eliminei alternativas            │
│ ◯ Chute puro                       │
│                                     │
│ Certeza: [===50%===]               │
│                                     │
│            [ Próxima ]              │
│                                     │
└─────────────────────────────────────┘
```

## Validação
- [ ] Responder questão abre modal (não pula direto)
- [ ] Modal tem exatamente 4 opções
- [ ] Slider certeza funciona (0-100)
- [ ] Selecionar tipo → vai pra próxima questão
- [ ] usuarioTentativas[questao_id].tentativas tem item novo
- [ ] Tentativa tem: data, resposta, correta, tempo_gasto_segundos, tipo, certeza
- [ ] localStorage persiste após refresh
- [ ] npm run dev sem console errors
- [ ] Commit: "Feat: rastreamento + modal metacognição"
