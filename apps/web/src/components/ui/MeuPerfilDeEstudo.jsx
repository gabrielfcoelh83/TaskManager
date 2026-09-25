import { useState } from 'react';
import { PASSOS, erroDoPasso, respostasIniciais, fichaConcluida } from '../../lib/ficha';
import { PassoVoce, PassoProva, PassoRotina, PassoDificuldades, ResumoDaFicha } from './PassosDaFicha';

// "Meu perfil de estudo", nas Configurações: as respostas da ficha de
// boas-vindas, para ver e editar. Os campos são os mesmos componentes dos
// passos da ficha, os quatro de uma vez, e gravam pelo mesmo `salvarFicha`.

export default function MeuPerfilDeEstudo({ theme, s, perfil, config, fase, salvarFicha, opcoesDeDificuldade, acervoCarregando }) {
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const preferencias = perfil?.preferencias;
  const pronto = perfil?.estado === 'pronto';

  const abrir = () => {
    setEditando(respostasIniciais({ nome: perfil?.name, configuracoes: config, fase, preferencias }));
    setAviso(null);
    setSalvo(false);
  };
  const set = (parcial) => { setEditando((atual) => ({ ...atual, ...parcial })); setAviso(null); };

  const salvar = async (e) => {
    e.preventDefault();
    for (let i = 0; i < PASSOS.length; i++) {
      const problema = erroDoPasso(i, editando);
      if (problema) { setAviso(`${PASSOS[i].titulo}: ${problema}`); return; }
    }
    setSalvando(true);
    try {
      const resultado = await salvarFicha(editando);
      if (resultado) { setEditando(null); setSalvo(true); }
    } catch (err) {
      setAviso(`Não foi possível salvar: ${err?.message || 'erro desconhecido'}. Suas alterações continuam aqui.`);
    } finally {
      setSalvando(false);
    }
  };

  const subtitulo = { fontSize: 14, fontWeight: 700, color: theme.primaryDark, margin: '0 0 12px' };

  return (
    <section style={s.card} aria-labelledby="meu-perfil-titulo" data-testid="meu-perfil-de-estudo">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 id="meu-perfil-titulo" style={{ ...s.sectionTitle, margin: 0 }}>Meu perfil de estudo</h2>
        {!editando && pronto && (
          <button type="button" data-testid="editar-perfil-estudo" onClick={abrir} style={s.btnOutline}>Editar respostas</button>
        )}
      </div>

      {!editando && (
        <div style={{ marginTop: 14 }}>
          {!pronto ? (
            <div style={{ fontSize: 12.5, color: '#B45309' }}>Seu perfil ainda não carregou — as respostas aparecem aqui quando ele vier.</div>
          ) : fichaConcluida(preferencias) ? (
            <ResumoDaFicha nome={perfil?.name} preferencias={preferencias} />
          ) : null}
          {salvo && <div role="status" style={{ fontSize: 11.5, color: '#047857', marginTop: 10 }}>Perfil de estudo salvo na sua conta.</div>}
        </div>
      )}

      {editando && (
        <form onSubmit={salvar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 18 }}>
          <div><h3 style={subtitulo}>1. Você</h3><PassoVoce theme={theme} r={editando} set={set} idBase="perfil" /></div>
          <div><h3 style={subtitulo}>2. A prova</h3><PassoProva theme={theme} r={editando} set={set} idBase="perfil" /></div>
          <div><h3 style={subtitulo}>3. Sua rotina</h3><PassoRotina theme={theme} r={editando} set={set} idBase="perfil" /></div>
          <div>
            <h3 style={subtitulo}>4. Pontos fracos</h3>
            <PassoDificuldades theme={theme} r={editando} set={set} opcoes={opcoesDeDificuldade(editando.dificuldades)} acervoCarregando={acervoCarregando} />
          </div>

          {aviso && (
            <div role="alert" data-testid="perfil-estudo-aviso" style={{ fontSize: 12.5, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px' }}>
              {aviso}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={() => { setEditando(null); setAviso(null); }} disabled={salvando} style={s.btnOutline}>Cancelar</button>
            <button type="submit" data-testid="salvar-perfil-estudo" disabled={salvando} style={{ ...s.btnPrimary, opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
