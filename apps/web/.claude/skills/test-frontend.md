---
description: Run comprehensive frontend tests
tags: [testing, frontend, module8]
---

# Skill: test-frontend

## Objetivo
Executar suite completa de testes do frontend validando todos os módulos.

## Escopo de Testes

### 1. Validação de Dados
- [ ] Mock data: 30 questões carregadas
- [ ] Schema válido: todas questões tem topico, subtopico, explicacao
- [ ] Estrutura JSON: parseable sem erros

### 2. Testes de Integração (Manual Flow + Playwright)
- [ ] Navegar para Questões
- [ ] Selecionar disciplina
- [ ] Responder 5 questões
- [ ] Modal de metacognição funciona
- [ ] Ver desempenho atualizado (força/fraqueza)
- [ ] localStorage persiste (refresh page)

### 3. Testes de Simulados (E2E)
- [ ] ConfigSimulado: selecionar tipo
- [ ] ConfigSimulado: tipo "Geral" vs "Disciplina"
- [ ] ConfigSimulado: slider quantidade funciona
- [ ] Iniciar simulado → Cronometro visível
- [ ] Cronometro: countdown funciona
- [ ] Responder 10 questões
- [ ] Ver resultado (nota final)
- [ ] Histórico persistente

### 4. Testes de Performance
- [ ] npm run dev inicia em < 3 segundos
- [ ] Responder questão < 1 segundo
- [ ] Renderizar desempenho < 500ms
- [ ] localStorage read/write < 100ms

## Execução Manual

```bash
# 1. Iniciar dev server
npm run dev &

# Aguardar 3s para iniciar
sleep 3

# 2. Abrir em browser: http://localhost:5173

# 3. Fluxo Manual:
# - Ir para Questões
# - Selecionar Direito Constitucional
# - Responder 5 questões (modal de metacognição deve aparecer)
# - Ir para Desempenho (verificar força/fraqueza)
# - Refresh página (verificar localStorage)
# - Voltar para Questões
# - Ir para Simulados
# - Configurar: 30 questões, geral
# - Ver Cronometro contando
# - Responder 10 questões
# - Ver resultado
# - Refresh (verificar histórico persiste)

# 4. Verificar console
# - Zero "error" messages
# - Zero "warn" messages
# - Apenas "info" e logs normais

# 5. Rodar testes E2E
npm run test:e2e

# 6. Build
npm run build
```

## Testes com Playwright (tests/e2e.spec.js)

Executar com:
```bash
npm run test:e2e
```

Testes inclusos:
1. **Fluxo Completo**: selecionar → responder → desempenho
2. **Simulado**: config → cronômetro → questões → resultado
3. **localStorage**: refresh → dados persistem
4. **IA Generator**: gerar questões com /api/gerar-questoes

## Validação
- [ ] npm run dev: inicia sem erros
- [ ] npm run dev: app carrega em http://localhost:5173
- [ ] npm run build: build completa sem erros
- [ ] Console: zero erro messages
- [ ] Console: zero warning messages (ou only linter warnings)
- [ ] Fluxo manual: todos 8 steps completos ✅
- [ ] Desempenho: força/fraqueza aparecem
- [ ] Simulados: cronômetro funciona
- [ ] localStorage: persist após refresh
- [ ] npm run test:e2e: todos testes passam
- [ ] Performance: < 3s dev start, < 1s answer, < 500ms render

## Commit
- [ ] Commit: "Test: frontend comprehensive tests passed"

## Checklist Final
```
Frontend Tests ✅
├─ 30 questions loaded
├─ Schema validated
├─ 5-question flow works
├─ Metacognition modal works
├─ Performance shows strength/weakness
├─ localStorage persists
├─ Simulado works with timer
├─ 10-question flow works
├─ Results show score
├─ E2E tests pass
└─ Zero console errors
```
