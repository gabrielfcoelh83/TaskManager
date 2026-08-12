import { TAG_CORES, TAGS } from '../lib/navegacao';

// As seis anotações que vinham aqui eram de mentira — "Princípios da
// Administração Pública, hoje às 10:30", com conteúdo escrito no código. Toda
// conta nova abria esta tela com as anotações de ninguém, datadas de "hoje", e
// não dava para apagar nenhuma delas. Editar salvava num mapa de `edits` por
// cima do texto original, então a nota "de fábrica" nunca sumia de verdade.
//
// Agora o caderno começa vazio e é seu: criar, editar, apagar. Ele vive neste
// navegador — não existe rota de anotação na API, e a tela diz isso em vez de
// deixar parecer que sincroniza.

const SEM_DISCIPLINA = 'Sem disciplina';

function agora() {
  return new Date().toISOString();
}

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (mesmoDia) return `hoje às ${hora}`;

  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem às ${hora}`;

  return d.toLocaleDateString('pt-BR');
}

export default function Anotacoes({ theme, s, notas, setNotas, disciplinas }) {
  const itens = notas.itens || [];
  const nomesDeDisciplina = (disciplinas || []).map((d) => d.nome);

  // As pastas saem das disciplinas do acervo mais as que as notas já usam —
  // uma nota não pode ficar invisível porque sua disciplina saiu da lista.
  const pastas = ['Todas', ...new Set([...nomesDeDisciplina, ...itens.map((n) => n.disciplina || SEM_DISCIPLINA)])];

  const visiveis = notas.folder === 'Todas'
    ? itens
    : itens.filter((n) => (n.disciplina || SEM_DISCIPLINA) === notas.folder);

  const ativa = itens.find((n) => n.id === notas.activeId) || visiveis[0] || null;

  const tagStyle = (tag) => {
    const [bg, fg] = TAG_CORES[tag] || ['#f3f1f5', '#8b8391'];
    return s.pill(bg, fg === null ? theme.primaryDark : fg);
  };

  const novaNota = () => {
    const id = `nota-${Date.now()}`;
    const nota = {
      id,
      titulo: 'Nova anotação',
      disciplina: notas.folder !== 'Todas' ? notas.folder : (nomesDeDisciplina[0] || SEM_DISCIPLINA),
      tag: 'Resumo',
      criadaEm: agora(),
      atualizadaEm: agora(),
      conteudo: '',
    };
    setNotas({ itens: [nota, ...itens], activeId: id });
  };

  const editar = (id, campo, valor) => {
    setNotas({
      itens: itens.map((n) => (n.id === id ? { ...n, [campo]: valor, atualizadaEm: agora() } : n)),
    });
  };

  const apagar = (id) => {
    const restantes = itens.filter((n) => n.id !== id);
    setNotas({ itens: restantes, activeId: restantes[0]?.id ?? null });
  };

  const campoInvisivel = { border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1.3fr', gap: 16, alignItems: 'start' }}>
      <div style={{ ...s.card, padding: 14 }}>
        <div style={{ ...s.sectionTitle, fontSize: 13.5 }}>Pastas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
          {pastas.map((f) => {
            const quantas = f === 'Todas' ? itens.length : itens.filter((n) => (n.disciplina || SEM_DISCIPLINA) === f).length;
            return (
              <div
                key={f}
                onClick={() => setNotas({ folder: f })}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: 6,
                  padding: '8px 10px', borderRadius: 9, fontSize: 12.5, cursor: 'pointer',
                  background: notas.folder === f ? theme.primarySoft : 'transparent',
                  color: notas.folder === f ? theme.primaryDark : '#5c5462',
                  fontWeight: notas.folder === f ? 600 : 500,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                <span style={{ opacity: 0.55 }}>{quantas}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10.5, color: '#8b8391', marginTop: 14, lineHeight: 1.5 }}>
          As anotações ficam guardadas neste navegador. Limpar os dados do site
          apaga todas.
        </div>
      </div>

      <div style={{ ...s.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ ...s.sectionTitle, fontSize: 13.5 }}>Minhas anotações ({visiveis.length})</div>
          <button data-testid="nova-anotacao" style={{ ...s.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={novaNota}>+ Nova</button>
        </div>

        {visiveis.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#8b8391', padding: '20px 4px', lineHeight: 1.55 }}>
            {itens.length === 0
              ? 'Seu caderno está vazio. Crie a primeira anotação com o botão acima.'
              : 'Nenhuma anotação nesta pasta.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 640, overflow: 'auto' }}>
            {visiveis.map((n) => (
              <div
                key={n.id}
                onClick={() => setNotas({ activeId: n.id })}
                style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: ativa?.id === n.id ? theme.primarySoft : '#faf9fb' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2c2530', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.titulo || 'Sem título'}</div>
                  <span style={tagStyle(n.tag)}>{n.tag}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 4 }}>
                  {n.disciplina || SEM_DISCIPLINA} · {formatarData(n.atualizadaEm || n.criadaEm)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={s.card}>
        {ativa ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                style={{ ...campoInvisivel, fontSize: 19, fontWeight: 700, color: '#2c2530', width: '100%' }}
                value={ativa.titulo}
                onChange={(e) => editar(ativa.id, 'titulo', e.target.value)}
                placeholder="Título da anotação"
              />
              <button
                data-testid="apagar-anotacao"
                onClick={() => apagar(ativa.id)}
                title="Apagar anotação"
                style={{ background: 'none', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flex: 'none' }}
              >
                Apagar
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={ativa.disciplina || SEM_DISCIPLINA}
                onChange={(e) => editar(ativa.id, 'disciplina', e.target.value)}
                style={{ fontSize: 11.5, border: '1px solid rgba(0,0,0,.1)', borderRadius: 20, padding: '4px 10px', color: '#5c5462', background: '#fff' }}
              >
                {[...new Set([SEM_DISCIPLINA, ...nomesDeDisciplina, ativa.disciplina || SEM_DISCIPLINA])].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={ativa.tag}
                onChange={(e) => editar(ativa.id, 'tag', e.target.value)}
                style={{ ...tagStyle(ativa.tag), border: 'none', padding: '4px 10px', cursor: 'pointer' }}
              >
                {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              <span style={{ fontSize: 11.5, color: '#8b8391', marginLeft: 'auto' }}>
                editada {formatarData(ativa.atualizadaEm || ativa.criadaEm)}
              </span>
            </div>

            <textarea
              style={{ width: '100%', minHeight: 420, marginTop: 18, border: 'none', outline: 'none', resize: 'vertical', fontSize: 14, lineHeight: 1.7, color: '#3a3540', fontFamily: 'inherit' }}
              value={ativa.conteudo}
              onChange={(e) => editar(ativa.id, 'conteudo', e.target.value)}
              placeholder="Escreva aqui…"
            />
          </div>
        ) : (
          <div style={{ color: '#8b8391', fontSize: 13.5, padding: '40px 10px', textAlign: 'center', lineHeight: 1.6 }}>
            Nenhuma anotação aberta.
            <br />Crie uma com o botão “+ Nova”.
          </div>
        )}
      </div>
    </div>
  );
}
