import { useState } from 'react';
import { Icon } from '../../lib/icons';
import { questoesDisponiveis, tempoDeProvaMinutos } from '../../lib/simulado';

const QUANTIDADES = [10, 20, 30, 40, 50, 60, 70, 80];

// "Vamos começar!" — o formulário do simulado no formato LEGJUR: um cartão
// centrado, tipo de prova, disciplina e o dropdown de quantidade.
//
// `disciplinas` são os nomes que têm questão no acervo; `questoes` é o acervo
// carregado, de onde saem as contagens. A contagem importa: pedir 80 de uma
// matéria que tem 12 abria uma prova de 12 sem dizer por quê.
export default function ConfigSimulado({ theme, s, onConfirm, disciplinas = [], questoes = [], disciplinaInicial = null }) {
  const [tipo, setTipo] = useState(disciplinaInicial ? 'disciplina' : 'geral');
  const [disciplina, setDisciplina] = useState(disciplinaInicial);
  const [quantidade, setQuantidade] = useState(10);

  const disponiveis = questoesDisponiveis(questoes, { tipo, disciplina }).length;
  const efetiva = Math.min(quantidade, disponiveis);
  const invalido = (tipo === 'disciplina' && !disciplina) || disponiveis === 0;

  const contagem = (nome) => questoes.filter((q) => q.disciplina === nome).length;

  // Botão desabilitado sem motivo parece defeito. O caso que mais engana é a
  // matéria vinda de Disciplinas que ficou sem questões (acervo recarregado,
  // reclassificação): ela nem estaria no select, que mostraria outra coisa.
  const opcoes = disciplina && !disciplinas.includes(disciplina) ? [disciplina, ...disciplinas] : disciplinas;
  let motivo = null;
  if (tipo === 'disciplina' && !disciplina) motivo = 'Escolha uma disciplina para começar.';
  else if (disponiveis === 0 && tipo === 'disciplina') motivo = `${disciplina} não tem questões no acervo agora — escolha outra disciplina ou o simulado geral.`;
  else if (disponiveis === 0) motivo = 'O acervo ainda não tem questões carregadas.';

  return (
    <div style={{ ...s.card, padding: '36px 32px', maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, margin: '0 auto 14px', background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="graduation-cap" color="#fff" size={30} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#2c2530' }}>Vamos começar!</div>
      <div style={{ fontSize: 14, color: '#8b8391', marginTop: 8 }}>
        Você selecionou <b style={{ color: '#2c2530' }}>{efetiva} {efetiva === 1 ? 'questão' : 'questões'}</b>. Gerencie seu tempo e boa sorte!
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28, textAlign: 'left' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#2c2530' }}>Tipo de simulado</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['geral', 'disciplina'].map((t) => (
              <button
                key={t}
                data-testid={`tipo-${t}`}
                onClick={() => { setTipo(t); if (t === 'geral') setDisciplina(null); }}
                style={{
                  flex: 1,
                  padding: 12,
                  border: tipo === t ? `2px solid ${theme.primary}` : '1px solid #e3e7ee',
                  borderRadius: 10,
                  background: tipo === t ? theme.primarySoft : '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: tipo === t ? theme.primaryDark : '#5c5462',
                }}
              >
                {t === 'geral' ? 'Geral — OAB 1ª Fase' : 'Por disciplina'}
              </button>
            ))}
          </div>
        </div>

        {tipo === 'disciplina' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#2c2530' }}>Disciplina</div>
            {opcoes.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#8b8391', lineHeight: 1.5 }}>
                As questões do acervo ainda não foram separadas por matéria. O simulado geral já usa todas.
              </div>
            ) : (
              <select
                data-testid="disciplina-simulado"
                value={disciplina || ''}
                onChange={(e) => setDisciplina(e.target.value || null)}
                style={{ width: '100%', padding: 12, border: '1px solid #e3e7ee', borderRadius: 10, fontSize: 13, cursor: 'pointer', background: '#fff' }}
              >
                <option value="">-- Escolha uma disciplina --</option>
                {opcoes.map((d) => (
                  <option key={d} value={d}>{d} ({contagem(d)})</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f6f8fb', borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#2c2530' }}>Qtd. Questões:</div>
          <select
            data-testid="qtd-questoes"
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value, 10))}
            style={{ padding: '8px 14px', border: '1px solid #e3e7ee', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#fff' }}
          >
            {QUANTIDADES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {!invalido && quantidade > disponiveis && (
          <div data-testid="aviso-quantidade" style={{ fontSize: 12.5, color: '#B45309', background: '#FEF3C7', borderRadius: 10, padding: '10px 14px', lineHeight: 1.5 }}>
            {tipo === 'geral' ? 'O acervo tem' : 'Esta disciplina tem'} {disponiveis} {disponiveis === 1 ? 'questão' : 'questões'} — a prova terá {disponiveis}.
          </div>
        )}

        <div style={{ fontSize: 12.5, color: '#8b8391', textAlign: 'center' }}>
          Tempo de prova: ~{tempoDeProvaMinutos(efetiva)} minutos · sem feedback durante o simulado, como na prova real
        </div>

        <button
          data-testid="iniciar-simulado"
          onClick={() => onConfirm({ tipo, disciplina, quantidade })}
          disabled={invalido}
          style={{
            padding: 14,
            background: invalido ? '#c3c8d2' : '#343a46',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: invalido ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon name="play" color="#fff" size={14} /> Iniciar Simulado
        </button>
        {invalido && motivo && (
          <div data-testid="motivo-desabilitado" role="status" style={{ fontSize: 12.5, color: '#B45309', textAlign: 'center', marginTop: -8, lineHeight: 1.5 }}>
            {motivo}
          </div>
        )}
      </div>
    </div>
  );
}
