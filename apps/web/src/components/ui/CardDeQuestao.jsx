import { useId, useState } from 'react';
import { Icon } from '../../lib/icons';
import { cabecalhoDaQuestao, trilhaDaQuestao } from '../../lib/cardDeQuestao';
import { ASSISTENTE } from '../../lib/assistente';

// Pedaços do card de questão que o quiz (Questoes) e a revisão do simulado
// desenham igual. As regras moram em `lib/cardDeQuestao.js`; aqui só o
// desenho, para as duas telas não divergirem no texto de um selo.

const LETRA = (i) => String.fromCharCode(65 + i);

// Procedência: "45º Exame · 2025 · FGV · Questão 12". O testid é o mesmo de
// antes — o e2e confere que nada de `undefined`/`null` vaza aqui.
export function OrigemDaQuestao({ questao, style }) {
  return (
    <span data-testid="origem-da-questao" style={{ fontSize: 11.5, color: '#8b93a1', fontWeight: 600, letterSpacing: '.3px', textTransform: 'uppercase', ...style }}>
      {cabecalhoDaQuestao(questao)}
    </span>
  );
}

// "Disciplina › Tema". A disciplina continua no mesmo pill e com o mesmo
// testid de antes (o e2e do "Foco do dia" lê o texto dele); o tema só
// aparece se existir. Sem nenhum dos dois, não desenha nada.
export function TrilhaDaQuestao({ s, theme, questao, pill, style }) {
  const trilha = trilhaDaQuestao(questao);
  if (!trilha) return null;
  return (
    <span data-testid="trilha-da-questao" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', ...style }}>
      {trilha.disciplina && (
        <span data-testid="disciplina-da-questao" style={pill || s.pill(theme.primarySoft, theme.primaryDark)}>{trilha.disciplina}</span>
      )}
      {trilha.disciplina && trilha.tema && <span aria-hidden="true" style={{ color: '#b5afa6', fontSize: 12 }}>›</span>}
      {trilha.tema && <span data-testid="tema-da-questao" style={{ fontSize: 11.5, color: '#4f4b45', fontWeight: 600 }}>{trilha.tema}</span>}
    </span>
  );
}

// A tesoura. Riscar é anotação de quem está eliminando alternativas, não
// resposta: o botão mora dentro da área clicável da alternativa, e o
// `stopPropagation` é o que impede o clique nele de virar resposta.
export function BotaoRiscar({ theme, indice, riscada, onAlternar }) {
  const letra = LETRA(indice);
  return (
    <button
      type="button"
      data-testid={`riscar-${indice}`}
      aria-pressed={riscada}
      aria-label={riscada ? `Desfazer risco da alternativa ${letra}` : `Riscar alternativa ${letra}`}
      title={riscada ? 'Desfazer risco' : 'Riscar alternativa'}
      onClick={(e) => { e.stopPropagation(); onAlternar(indice); }}
      style={{
        flex: 'none', width: 30, height: 30, borderRadius: 8, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${riscada ? theme.primary : 'transparent'}`,
        background: riscada ? theme.primarySoft : 'transparent',
        // Discreto até ser usado: o foco do card é a alternativa, não a tesoura.
        opacity: riscada ? 1 : 0.55,
      }}
    >
      <Icon name="scissors" color={riscada ? theme.primaryDark : '#7a766f'} size={15} />
    </button>
  );
}

// Assinatura do comentário escrito pela IA: o nome do assistente
// (lib/assistente.js) com o "IA" escrito ao lado — o nome é rosto, não
// disfarce. Comentário que não veio da IA não leva selo.
function SeloDoAssistente({ s, questao }) {
  if (questao.explicacaoFonte !== 'ia') return null;
  return (
    <span data-testid="explicacao-do-assistente" title={ASSISTENTE.descricao} style={s.pill('#F5EEDC', '#94661A')}>
      Comentado pelo {ASSISTENTE.nome} · IA
    </span>
  );
}

// O gabarito comentado, recolhível. Abre aberto: antes ele aparecia inteiro
// depois da resposta, e esconder por padrão sumiria com o que a pessoa já
// estava acostumada a ler. O botão serve para recolher um texto longo e ver a
// próxima questão sem rolar. O selo fica fora do botão, no cabeçalho, e por
// isso continua visível com o bloco fechado.
//
// O estado é do componente: quem usa troca a `key` a cada questão, e a
// questão nova volta a abrir aberta.
export function GabaritoComentado({ s, questao, compacto = false, className, style, children }) {
  const [aberto, setAberto] = useState(true);
  const idCorpo = useId();
  const fonte = compacto ? 12.5 : 13;

  return (
    <div data-testid="gabarito-comentado" className={className} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          data-testid="alternar-gabarito"
          aria-expanded={aberto}
          aria-controls={idCorpo}
          onClick={() => setAberto((a) => !a)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, fontSize: fonte, fontWeight: 700, color: '#1c1b19' }}
        >
          <Icon name="lightbulb" color="#B07A1F" size={compacto ? 15 : 16} />
          Gabarito comentado
          <Icon name="chevron-down" color="#7a766f" size={15} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 160ms var(--ease-out)' }} />
        </button>
        <SeloDoAssistente s={s} questao={questao} />
      </div>
      {aberto && (
        <div id={idCorpo} data-testid="gabarito-comentado-texto" style={{ fontSize: fonte, color: '#4f4b45', lineHeight: compacto ? 1.55 : 1.6, marginTop: compacto ? 6 : 10 }}>
          {questao.explicacao}
          {children}
        </div>
      )}
    </div>
  );
}

// "Respondida em DD/MM/AAAA" e o botão que abre o histórico. A lista em si é
// `ListaDoHistorico`, desenhada por quem chama abaixo do cabeçalho: o selo
// fica na linha do cabeçalho e a lista ocupa a largura inteira do card.
export function SeloRespondida({ s, theme, historico, aberto, onAlternar, idLista }) {
  if (!historico || historico.total === 0) return null;
  const quando = historico.ultima?.dataFormatada;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span data-testid="respondida-em" style={s.pill('#f1efea', '#475569')}>
        {quando ? `Respondida em ${quando}` : 'Já respondida'}
      </span>
      <button
        type="button"
        data-testid="ver-historico"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={onAlternar}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, fontSize: 11.5, fontWeight: 600, color: theme.primary }}
      >
        <Icon name="history" color={theme.primary} size={13} />
        {aberto ? 'Ocultar histórico' : `Ver histórico (${historico.total})`}
      </button>
    </span>
  );
}

export function ListaDoHistorico({ historico, id }) {
  return (
    <div id={id} data-testid="historico-da-questao" className="entra" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#faf9f6', border: '1px solid #eeebe5' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#4f4b45', marginBottom: 6 }}>Suas tentativas nesta questão</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {historico.tentativas.map((t, i) => (
          <li key={t.id ?? `sem-id-${i}`} data-testid="historico-item" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#4f4b45' }}>
            <span style={{ minWidth: 78, fontVariantNumeric: 'tabular-nums' }}>{t.dataFormatada || 'Data desconhecida'}</span>
            <span style={{ minWidth: 92 }}>{t.letra ? `Marcou ${t.letra}` : 'Sem alternativa'}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: t.correta ? '#3E6B3E' : '#9E3630' }}>
              <Icon name={t.correta ? 'circle-check' : 'circle-x'} color={t.correta ? '#4A7A4A' : '#B4413A'} size={13} />
              {t.correta ? 'Acertou' : 'Errou'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
