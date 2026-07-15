---
description: Test all API endpoints
tags: [testing, backend, module8]
---

# Skill: test-api

## Objetivo
Testar todas as rotas API (/api/gerar-questoes, /api/enriquecer-questao) e tratamento de erros.

## Testes da Rota /api/gerar-questoes

### Teste 1: POST sem tema (deve retornar 400)
```bash
curl -X POST http://localhost:5173/api/gerar-questoes \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 3,
    "disciplina": "Direito Constitucional"
  }'

# Expected: 400 Bad Request
# { "erro": "tema é obrigatório" }
```

### Teste 2: POST com tema válido (deve retornar 200)
```bash
curl -X POST http://localhost:5173/api/gerar-questoes \
  -H "Content-Type: application/json" \
  -d '{
    "tema": "Direitos Fundamentais",
    "quantidade": 5,
    "disciplina": "Direito Constitucional"
  }'

# Expected: 200 OK
# {
#   "sucesso": true,
#   "questoes_geradas": 5,
#   "modelo": "qwen/qwen-3-coder:free",
#   "questoes": [...]
# }
```

### Teste 3: Validação de Resposta
- [ ] questoes_geradas === quantidade (5)
- [ ] Cada questão tem: numero, enunciado, alternativas (4), gabarito, explicacao
- [ ] Cada questão tem metadata: id, fonte, modelo_usado
- [ ] gabarito é um dos: "a", "b", "c", "d"
- [ ] alternativas.length === 4
- [ ] Sem markdown wrapper (```json ... ```)

### Teste 4: Fallback (simular rate limit)
- Se Qwen retorna 429 (rate limit):
  - Deve tentar Llama automaticamente
  - Deve retornar 200 com modelo="meta-llama/llama-4-maverick"
  - Ou tentar Gemini se Llama também falhar

### Teste 5: Timeout (simular indisponibilidade)
- Se todos 3 modelos retornam 503:
  - Deve retornar 503 com mensagem clara
  - Não deve travar ou timeout infinito
  - Timeout máximo: 30 segundos

## Testes da Rota /api/enriquecer-questao

### Teste 6: POST com questão válida (deve retornar 200)
```bash
curl -X POST http://localhost:5173/api/enriquecer-questao \
  -H "Content-Type: application/json" \
  -d '{
    "questao": {
      "topico": "Responsabilidade Civil",
      "enunciado": "Qual é a natureza da responsabilidade civil?",
      "alternativas": [...],
      "gabarito": "a",
      "explicacao": "..."
    }
  }'

# Expected: 200 OK
# {
#   "sucesso": true,
#   "jurisprudencia": {
#     "total": 3247,
#     "processos": [...],
#     "pct_procedentes": 78
#   },
#   "enriquecimento": {
#     "texto": "Conforme jurisprudência consolidada..."
#   }
# }
```

### Teste 7: Validação de Resposta
- [ ] sucesso === true
- [ ] jurisprudencia.total > 0 (para temas conhecidos)
- [ ] jurisprudencia.processos.length > 0
- [ ] pct_procedentes entre 0-100
- [ ] enriquecimento.texto não está vazio
- [ ] Timeout não ultrapassa 15 segundos

### Teste 8: Timeout (simular DATAJUD indisponível)
- Se DATAJUD timeout:
  - Deve retornar 503 ou timeout gracefully
  - Não deve bloquear geração de questões
  - Mensagem clara sobre falha

## Integração Completa

### Teste 9: Fluxo /api/gerar-questoes → /api/enriquecer-questao
```bash
# 1. Gerar questões
curl -X POST http://localhost:5173/api/gerar-questoes \
  -H "Content-Type: application/json" \
  -d '{"tema": "Direitos Fundamentais", "quantidade": 2}'

# 2. Pegar primeira questão
# 3. Enriquecer
curl -X POST http://localhost:5173/api/enriquecer-questao \
  -H "Content-Type: application/json" \
  -d '{"questao": {...}}'

# Expected: Both successful
```

## Execução dos Testes

### Manual (com curl)
```bash
# Iniciar dev server
npm run dev &
sleep 3

# Rodar testes manuais acima
# Verificar respostas
```

### Automático (script Node)
```bash
npm run test:api
```

Script em tests/api.test.js:
- Testa POST sem tema → 400
- Testa POST com tema → 200
- Valida estrutura de resposta
- Testa enriquecimento (DATAJUD)
- Trata 503 como sucesso do teste (fallback funciona)

## Validação
- [ ] POST /api/gerar-questoes sem tema → 400
- [ ] POST /api/gerar-questoes com tema → 200
- [ ] JSON resposta válido e completo
- [ ] questoes_geradas === quantidade
- [ ] Cada questão tem estrutura correta
- [ ] Rate limit (429) → próximo modelo
- [ ] Timeout (503) → próximo modelo
- [ ] Todos modelos falham → 503 com mensagem
- [ ] POST /api/enriquecer-questao → 200
- [ ] DATAJUD retorna jurisprudência
- [ ] Texto enriquecimento gerado
- [ ] Timeout DATAJUD tratado
- [ ] npm run test:api passa
- [ ] Commit: "Test: API endpoints all passing"

## Test Coverage
```
/api/gerar-questoes:
├─ Input validation ✅ (tema obrigatório)
├─ Success path ✅ (200 OK)
├─ Fallback chain ✅ (Qwen → Llama → Gemini)
├─ Rate limit ✅ (429 handled)
├─ Unavailable ✅ (503 handled)
└─ Timeout ✅ (30s max)

/api/enriquecer-questao:
├─ Success path ✅ (200 OK)
├─ DATAJUD integration ✅
├─ Jurisprudence extraction ✅
├─ Enrichment text ✅
├─ Timeout handling ✅ (15s max)
└─ Graceful failure ✅

Integration:
└─ Generate → Enrich → Success ✅
```
