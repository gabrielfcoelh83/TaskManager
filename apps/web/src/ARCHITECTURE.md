# Arquitetura do Frontend - MlDireito

## 📁 Estrutura de Pastas

```
src/
├── layout/             # Layout principal da aplicação
│   └── (futuro) MainLayout.jsx, TopBar, Sidebar
├── screens/            # 11 telas principais da aplicação
│   ├── Dashboard.jsx   # Resumo visual e métricas
│   ├── Questoes.jsx    # Quiz interativo
│   ├── Simulados.jsx   # Configuração e execução de simulados
│   ├── Revisoes.jsx    # Revisão de questões erradas
│   ├── Desempenho.jsx  # Gráficos de evolução
│   ├── Estatisticas.jsx # Métricas detalhadas
│   ├── Disciplinas.jsx # Aproveitamento por matéria
│   ├── Cronograma.jsx  # Planejamento semanal
│   ├── Anotacoes.jsx   # Gerenciador de notas
│   ├── Favoritos.jsx   # Lista de questões marcadas
│   ├── Configuracoes.jsx # Perfil e preferências
│   └── Login.jsx       # Autenticação
├── components/         # Componentes React reutilizáveis
│   └── ui/            # Componentes UI específicos do projeto
│       ├── ConfigSimulado.jsx   # Configuração de simulado
│       ├── Cronometro.jsx       # Timer com feedback visual
│       └── GeradorQuestoes.jsx  # Gerador de questões com IA
├── lib/               # Lógica de negócio PURA (sem React)
│   ├── api/           # Cliente HTTP e chamadas de API
│   │   ├── api.js     # Funções de API (login, listar questões, etc)
│   │   └── index.js   # Exports nomeados
│   ├── questions/     # Lógica de questões
│   │   ├── acervo.js  # Transformação de dados de questões
│   │   └── index.js   # Exports nomeados
│   ├── metrics.js     # Cálculos de métricas (taxa de acerto, meta, etc)
│   ├── storage.js     # Wrapper de localStorage com merge inteligente
│   ├── theme.js       # Temas (rosa, azul, verde) com buildStyles()
│   ├── navegacao.js   # Menu, metadados de telas, ícones
│   ├── perfil.js      # Decodificação JWT, iniciais, nome
│   ├── revisao.js     # Classificação de questões para revisão
│   ├── disciplinas.js # Montagem de disciplinas com cores
│   ├── agenda.js      # Planejamento semanal
│   ├── icons.jsx      # Biblioteca de ícones SVG
│   └── charts.jsx     # Componentes de gráficos (sparklines)
├── hooks/             # Custom Hooks React (vazio - para expansão futura)
│   └── (futuro) useAuth.js, useQuestions.js, etc
├── contexts/          # Context API React (vazio - para expansão futura)
│   └── (futuro) UserContext.jsx, QuestionsContext.jsx, UIContext.jsx
├── App.jsx            # Componente raiz (estado global, navegação)
├── main.jsx           # Entry point
├── index.css          # Estilos globais
└── ARCHITECTURE.md    # Este arquivo
```

---

## 🏗️ Padrão de Arquitetura

### Layer-Based com Domínios

**Layers:**
1. **UI Layer** (screens/) - Telas e componentes visuais
2. **Component Layer** (components/ui/) - Componentes reutilizáveis
3. **Logic Layer** (lib/) - Lógica de negócio pura
4. **API Layer** (lib/api/) - Comunicação com backend
5. **State Management** (App.jsx) - Estado centralizado com localStorage

### Características

✅ **Funções puras em lib/** - Testáveis no Node sem React  
✅ **API centralizada** - Cliente HTTP com tratamento de erro  
✅ **localStorage com merge** - Estado persiste com herança automática  
✅ **Sem React Router** - Navegação por state.screen  
✅ **Sem Redux/Zustand** - useState + props drilling (para refatorar)  

---

## 📊 Estado Global (App.jsx)

O estado é centralizado em `DEFAULT_STATE`:

```javascript
{
  __usuario: null,              // Detecta mudança de conta
  theme: 'rosa',                // localStorage
  screen: 'dashboard',          // Navegação
  questoes: { ... },            // Estado do quiz
  simulados: { ... },           // Estado de simulados
  dashboard: { ... },           // Preferências por tela
  // ... mais 8 estados de telas
}
```

**Refs para operações assíncronas:**
- `registroPendente` - Rastreia promessas de gravação
- `sessaoEpoch` - Protege contra logout durante async
- `gravacaoDePreferencias` - Fila de atualizações

---

## 🔗 Fluxo de Dados

```
App.jsx (estado global)
    ↓
screens/ (recebem props)
    ↓
components/ui/ (componentes específicos)
    ↓
lib/ (lógica pura)
    ↓
lib/api/ (chamadas HTTP)
    ↓
Backend (localhost:3000 em dev)
```

---

## 🔄 Props Drilling Atual

Cada screen recebe ~10 props de App.jsx:

```javascript
const screenProps = {
  theme, s, data,     // UI
  go,                 // Navegação
  usuarioTentativas,  // Dados
  revisarQuestoes,    // Funções
  // ... mais props
};
```

**Próxima Refatoração:** Substituir por Context API

---

## 📝 Imports Importantes

### Exemplos Corretos Após Reorganização

```javascript
// Componentes
import ConfigSimulado from './components/ui/ConfigSimulado';

// Lógica
import { embaralhar, montarFontes } from './lib/questions/acervo';
import { metricas } from './lib/metrics';
import { login, criarConta } from './lib/api/api';

// Utilitários
import { loadState, saveState } from './lib/storage';
import { THEMES } from './lib/theme';
```

---

## 🚀 Próximas Etapas de Refatoração

### Fase 2 (Refatoração Completa)
1. **Decompor App.jsx** em contextos:
   - UserContext - Autenticação e perfil
   - QuestionsContext - Questões e quiz
   - UIContext - Navegação e tema
   - CacheContext - Dados em cache

2. **Criar biblioteca UI** completa:
   - Button, Card, Modal, Input, Select
   - Badge, Skeleton, Spinner, Notification
   - Tabs, Table, Dialog

3. **Quebrar screens** em componentes menores:
   - Questoes.jsx → QuestionCard + AnswerOptions + QuestionNav
   - Dashboard.jsx → MetricCard + SparklineChart
   - Simulados.jsx → SimuladoConfig + SimuladoResults

4. **Adicionar TypeScript:**
   - Renomear .jsx → .tsx
   - Adicionar types para props
   - Validar API responses com Zod

5. **Implementar testes:**
   - Testes de componentes (React Testing Library)
   - Testes de integração
   - E2E melhorado (Playwright)

---

## 📌 Convenções

- **Componentes:** PascalCase (Button.jsx, ConfigSimulado.jsx)
- **Funções:** camelCase (embaralhar, montarFontes)
- **Constantes:** UPPER_SNAKE_CASE (DEFAULT_STATE, THEMES)
- **Props:** Passe `theme`, `s` (styles), `data` para telas

---

## 🔍 Validação

```bash
# Verificar sintaxe
npm run lint

# Fazer build
npm run build

# Rodar dev server
npm run dev

# Testes E2E
npm run test:e2e
```

---

## 📞 Dúvidas?

Consulte:
- `App.jsx` - Estado global
- `lib/api/api.js` - Chamadas HTTP
- `lib/metrics.js` - Cálculos
- Testes em `tests/` - Exemplos de uso
