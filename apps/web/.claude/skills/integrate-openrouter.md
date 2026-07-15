---
description: Create /api/gerar-questoes with fallback (Qwen → Llama → Gemini)
tags: [backend, openrouter, module5]
---

# Skill: integrate-openrouter

## Objetivo
Criar rota /api/gerar-questoes com fallback automático entre 3 modelos de IA.

## Entrada
- API key: NEXT_PUBLIC_OPENROUTER_API_KEY (em .env.local)
- Modelos: Qwen 3 Coder, Llama 4 Maverick, Gemini 2.0 Flash
- Quantidade padrão: 5 questões

## Processo
1. Criar pages/api/gerar-questoes.js
2. Implementar POST handler
3. Validação de entrada:
   - `tema` (obrigatório, retorna 400 se falta)
   - `quantidade` (opcional, default 5)
   - `disciplina` (opcional)
4. Fallback automático:
   - Tentar Qwen 3 Coder
   - Se erro 429 (rate limit) ou 503 (unavailable) → Tentar Llama 4 Maverick
   - Se erro 429 ou 503 → Tentar Gemini 2.0 Flash
   - Se tudo falha → retorna erro 503 com mensagem clara
5. Parse JSON resposta:
   - Remover markdown wrapper (```json ... ```)
   - Validar estrutura (cada questão tem: numero, enunciado, alternativas, gabarito, explicacao)
   - Adicionar metadata: id (uuid ou slug), fonte ("openrouter-ia-gerada"), modelo_usado
6. Testar com curl
7. Tratar erros gracefully (timeout, malformed JSON, etc)

## Saída esperada
- pages/api/gerar-questoes.js funcional
- POST retorna 200 com questões JSON
- Fallback automático funciona corretamente
- Erros 429/503 tratados (tenta próximo modelo)
- Resposta JSON válida e estruturada

## Teste (input/output)

### Teste 1: Sem tema (deve retornar 400)
```bash
curl -X POST http://localhost:5173/api/gerar-questoes \
  -H "Content-Type: application/json" \
  -d '{
    "quantidade": 3,
    "disciplina": "Direito Constitucional"
  }'

# Output (400)
{
  "erro": "tema é obrigatório"
}
```

### Teste 2: Com tema válido (deve retornar 200)
```bash
curl -X POST http://localhost:5173/api/gerar-questoes \
  -H "Content-Type: application/json" \
  -d '{
    "tema": "Direitos Fundamentais",
    "quantidade": 5,
    "disciplina": "Direito Constitucional"
  }'

# Output (200 OK)
{
  "sucesso": true,
  "questoes_geradas": 5,
  "modelo": "qwen/qwen-3-coder:free",
  "questoes": [
    {
      "numero": 1,
      "enunciado": "De acordo com a Constituição Federal de 1988, qual é o direito considerado fundamental?",
      "alternativas": [
        "A) Direito à vida",
        "B) Direito de escravidão",
        "C) Direito de propriedade ilimitada",
        "D) Direito de discriminação"
      ],
      "gabarito": "a",
      "explicacao": "De acordo com o Art. 5º da CF/88, a vida é um direito fundamental inalienável. As outras alternativas são direitos não reconhecidos ou vedados constitucionalmente.",
      "referencias": ["CF/88 Art. 5º", "Lei 10.406/2002"],
      "id": "q-uuid-12345",
      "fonte": "openrouter-ia-gerada",
      "modelo_usado": "qwen/qwen-3-coder:free"
    },
    // ... 4 more questions
  ]
}
```

### Teste 3: Fallback (simular 429)
Se Qwen retorna 429, deve tentar Llama automaticamente e retornar 200 com modelo="llama/llama-4-maverick".

### Teste 4: Tudo falha (simular múltiplos 503)
Se todos 3 modelos retornam 503, deve retornar 503 com mensagem clara.

## Estrutura de Resposta
```javascript
{
  sucesso: true|false,
  questoes_geradas: number,
  modelo: "qwen/qwen-3-coder:free" | "meta-llama/llama-4-maverick" | "google/gemini-2.0-flash-exp",
  questoes: [
    {
      numero: number,
      enunciado: string,
      alternativas: string[],  // 4 alternativas
      gabarito: string,        // "a"|"b"|"c"|"d"
      explicacao: string,
      referencias: string[],
      id: string,
      fonte: "openrouter-ia-gerada",
      modelo_usado: string
    }
  ]
}
```

## Validação
- [ ] curl POST sem tema retorna 400
- [ ] curl POST com tema retorna 200
- [ ] JSON resposta válido (parseable)
- [ ] questoes_geradas === quantidade
- [ ] Cada questão tem: numero, enunciado, alternativas (4), gabarito, explicacao
- [ ] Cada questão tem metadata: id, fonte, modelo_usado
- [ ] Rate limit (429) → tenta próximo modelo
- [ ] Unavailable (503) → tenta próximo modelo
- [ ] Todos modelos falham → retorna 503 com mensagem
- [ ] Timeout tratado (30s max)
- [ ] Markdown wrapper removido (se presente)
- [ ] Commit: "Feat: /api/gerar-questoes com fallback OpenRouter"
