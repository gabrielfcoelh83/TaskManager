---
description: Create /api/enriquecer-questao with DATAJUD jurisprudence
tags: [backend, datajud, module7]
---

# Skill: integrate-datajud

## Objetivo
Criar rota /api/enriquecer-questao que busca jurisprudência em DATAJUD e enriquece questões.

## Entrada
- Questão (com topico, enunciado, e outras properties)
- DATAJUD API (pública, sem API key, gerenciada pelo CNJ)

## Processo
1. Criar pages/api/enriquecer-questao.js
2. Implementar POST handler que recebe questão
3. Extrair tema do topico ou enunciado
4. Chamar DATAJUD:
   - URL: https://api-publica.datajud.cnj.jus.br/api/v1/processosJudiciais
   - Headers: Content-Type: application/json
   - Filter (em searchableText): assunto:"${tema}" AND tribunal:STJ
   - Params: size=5, sort=dataRegistro:desc
5. Processar resposta DATAJUD:
   - Extrair total de processos
   - Contar processos com resultado="Procedente"
   - Calcular % procedentes = (count / total) * 100
   - Gerar texto de enriquecimento
6. Retornar jurisprudência + texto de enriquecimento
7. Integrar com /api/gerar-questoes (call após gerar questões)

## Saída esperada
- pages/api/enriquecer-questao.js funcional
- Busca DATAJUD sem erros
- Jurisprudência extraída corretamente
- Texto enriquecimento adiciona contexto à resposta

## Teste (input/output)

### Teste: Enriquecer questão
```bash
curl -X POST http://localhost:5173/api/enriquecer-questao \
  -H "Content-Type: application/json" \
  -d '{
    "questao": {
      "topico": "Responsabilidade Civil",
      "enunciado": "Qual é a natureza da responsabilidade civil no direito brasileiro?",
      "alternativas": [...],
      "gabarito": "a",
      "explicacao": "A responsabilidade civil...",
      "referencias": ["CC Art. 927"]
    }
  }'

# Output (200 OK)
{
  "sucesso": true,
  "jurisprudencia": {
    "total": 3247,
    "processos": [
      {
        "numero": "0000001-23.2023.1.00.0000",
        "data": "2023-06-15T10:30:00Z",
        "resultado": "Procedente",
        "tribunal": "STJ"
      },
      {
        "numero": "0000002-24.2023.1.00.0001",
        "data": "2023-05-20T14:15:00Z",
        "resultado": "Procedente",
        "tribunal": "STJ"
      }
    ],
    "pct_procedentes": 78
  },
  "enriquecimento": {
    "texto": "Conforme jurisprudência consolidada do STJ, existem 3247 precedentes sobre este tema. Tendência jurisprudencial: 78% dos casos são julgados como Procedentes."
  }
}
```

## Integração com /api/gerar-questoes

Após gerar questões no skill integrate-openrouter, chamar enriquecimento:

```javascript
// Em pages/api/gerar-questoes.js, após gerar questões:
const questões_final = [];
for (let q of questões_geradas) {
  try {
    const enriq = await fetch('http://localhost:5173/api/enriquecer-questao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questao: q })
    }).then(r => r.json());
    
    if (enriq.sucesso && enriq.enriquecimento?.texto) {
      q.explicacao += '\n\n[Jurisprudência STJ] ' + enriq.enriquecimento.texto;
    }
    questões_final.push(q);
  } catch (err) {
    // Se falhar, não bloqueia a geração (graceful)
    console.warn('Enriquecimento failed for', q.numero, err.message);
    questões_final.push(q);
  }
}

return res.status(200).json({
  sucesso: true,
  questoes_geradas: questões_final.length,
  questoes: questões_final
});
```

## Estrutura de Resposta
```javascript
{
  sucesso: true|false,
  jurisprudencia: {
    total: number,        // total de processos encontrados
    processos: [
      {
        numero: string,
        data: string,     // ISO timestamp
        resultado: string, // "Procedente" | "Improcedente" | "Parcialmente Procedente"
        tribunal: string   // "STJ"
      }
    ],
    pct_procedentes: number  // percentual de procedentes
  },
  enriquecimento: {
    texto: string  // texto para adicionar à explicação
  }
}
```

## Tratamento de Erros
- **Timeout**: Máximo 15 segundos para resposta DATAJUD
- **DATAJUD indisponível**: Retorna 503, mas não bloqueia geração de questões
- **Malformed response**: Trata gracefully, adiciona só o que conseguir extrair
- **Nenhum resultado**: Retorna sucesso com total=0, pct_procedentes=0

## Validação
- [ ] curl POST com questão válida retorna 200
- [ ] DATAJUD retorna total > 0 para tema válido
- [ ] Processos extraídos corretamente
- [ ] % procedentes calculado (total > 0)
- [ ] Texto enriquecimento gerado
- [ ] Timeout tratado (15s max)
- [ ] Se DATAJUD falha, não bloqueia (graceful)
- [ ] Commit: "Feat: /api/enriquecer-questao com DATAJUD"
