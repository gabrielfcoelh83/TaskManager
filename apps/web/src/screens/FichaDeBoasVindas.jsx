import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { PASSOS, erroDoPasso } from '../lib/ficha';
import { PassoVoce, PassoProva, PassoRotina, PassoDificuldades, ResumoDaFicha } from '../components/ui/PassosDaFicha';

// A ficha de boas-vindas, obrigatória: o App a mostra no lugar das telas
// enquanto `profile_data.ficha.concluidaEm` não existir (conta nova, ou conta
// antiga que ainda não a preencheu). Quatro passos, um por tela, sem "pular";
// depois, "Tudo pronto" com o resumo, e o app.
//
// Gravar é com o App (`onSalvar`, pela fila de `profile_data`). Se falhar, a
// ficha fica no último passo com o erro e o botão de tentar de novo: entrar no
// app fingindo que salvou traria a ficha de volta no próximo acesso, e com as
// respostas perdidas.

const SUBTITULOS = [
  'Para começar, conte um pouco sobre você.',
  'A data define a contagem regressiva do app.',
  'Com isso a gente sugere uma meta diária que caiba no seu dia.',
  'As matérias marcadas entram primeiro no seu Cronograma.',
];

export default function FichaDeBoasVindas({
  theme, s, iniciais, opcoesDeDificuldade, acervoCarregando, onSalvar, onEntrar, onSair, email,
}) {
  const [passo, setPasso] = useState(0);
  const [r, setR] = useState(iniciais);
  const [aviso, setAviso] = useState(null);
  const [erroGravacao, setErroGravacao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(null);
  const titulo = useRef(null);

  // Foco no título a cada passo: quem navega por teclado ou leitor de tela
  // ouve onde está, em vez de ficar com o foco no botão de uma tela que sumiu.
  useEffect(() => { titulo.current?.focus(); }, [passo, salvo]);

  const set = (parcial) => { setR((atual) => ({ ...atual, ...parcial })); setAviso(null); };
  const ultimo = passo === PASSOS.length - 1;

  const avancar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    const problema = erroDoPasso(passo, r);
    if (problema) { setAviso(problema); return; }
    setAviso(null);
    if (!ultimo) { setPasso((p) => p + 1); return; }

    setSalvando(true);
    setErroGravacao(null);
    try {
      const resultado = await onSalvar(r);
      // null: a sessão acabou com o PUT no ar — o App já voltou ao login.
      if (resultado) setSalvo(resultado);
    } catch (err) {
      setErroGravacao(err?.message || 'erro desconhecido');
    } finally {
      setSalvando(false);
    }
  };

  const voltar = () => { setAviso(null); setErroGravacao(null); setPasso((p) => Math.max(0, p - 1)); };

  const pct = salvo ? 100 : Math.round((passo / PASSOS.length) * 100);
  const cartao = { ...s.card, padding: 'clamp(18px, 4vw, 30px)', borderRadius: 20 };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', justifyContent: 'center', padding: 'clamp(14px, 4vw, 40px) clamp(12px, 3vw, 24px)', overflowY: 'auto' }}>
      <main data-testid="ficha" style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...s.logoMark, width: 30, height: 30 }} aria-hidden="true"><Icon name="scale" color="#fff" size={16} /></div>
          <div style={{ ...s.logoText, fontSize: 18 }}>ma.</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {email && <span style={{ fontSize: 12, color: '#8b8391', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>}
            <button type="button" data-testid="sair" onClick={onSair} style={{ background: 'none', border: 'none', color: theme.primary, fontWeight: 600, fontSize: 12.5, padding: 4 }}>
              Sair
            </button>
          </div>
        </div>

        {salvo ? (
          <section style={cartao} className="entra" aria-labelledby="ficha-titulo">
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `linear-gradient(135deg, ${theme.gradA}, ${theme.gradB})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" color="#fff" size={24} />
            </div>
            <h1 id="ficha-titulo" ref={titulo} tabIndex={-1} data-testid="ficha-titulo" style={{ ...s.pageTitle, margin: '14px 0 4px', outline: 'none' }}>
              Tudo pronto!
            </h1>
            <p style={{ ...s.pageSub, margin: '0 0 18px' }}>
              Seu perfil de estudo está salvo na sua conta. Dá para rever e mudar em Configurações › Meu perfil de estudo.
            </p>
            <ResumoDaFicha nome={salvo.nome} preferencias={salvo.preferencias} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
              <button type="button" data-testid="ficha-entrar" onClick={onEntrar} style={{ ...s.btnPrimary, padding: '12px 22px', fontSize: 14 }}>
                Começar a estudar <Icon name="play" color="#fff" size={14} />
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={avancar} noValidate style={cartao} aria-labelledby="ficha-titulo">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 12, color: '#8b8391', marginBottom: 8 }}>
              <span data-testid="ficha-progresso">Passo {passo + 1} de {PASSOS.length}</span>
              <span>Ficha de boas-vindas</span>
            </div>
            <div
              role="progressbar"
              aria-label="Progresso da ficha"
              aria-valuemin={0}
              aria-valuemax={PASSOS.length}
              aria-valuenow={passo + 1}
              aria-valuetext={`Passo ${passo + 1} de ${PASSOS.length}: ${PASSOS[passo].titulo}`}
              style={s.progressTrack}
            >
              <div style={{ width: `${Math.max(pct, 6)}%`, height: '100%', background: `linear-gradient(90deg, ${theme.gradA}, ${theme.gradB})`, borderRadius: 5, transition: 'width 320ms var(--ease-out)' }} />
            </div>

            <h1 id="ficha-titulo" ref={titulo} tabIndex={-1} data-testid="ficha-titulo" style={{ ...s.pageTitle, margin: '20px 0 4px', outline: 'none' }}>
              {PASSOS[passo].titulo}
            </h1>
            <p style={{ ...s.pageSub, margin: '0 0 22px' }}>{SUBTITULOS[passo]}</p>

            <div key={passo} className="entra">
              {passo === 0 && <PassoVoce theme={theme} r={r} set={set} />}
              {passo === 1 && <PassoProva theme={theme} r={r} set={set} />}
              {passo === 2 && <PassoRotina theme={theme} r={r} set={set} />}
              {passo === 3 && (
                <PassoDificuldades theme={theme} r={r} set={set} opcoes={opcoesDeDificuldade(r.dificuldades)} acervoCarregando={acervoCarregando} />
              )}
            </div>

            {aviso && (
              <div role="alert" data-testid="ficha-aviso" style={{ marginTop: 18, fontSize: 12.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '9px 12px' }}>
                {aviso}
              </div>
            )}
            {erroGravacao && (
              <div role="alert" data-testid="ficha-erro" style={{ marginTop: 18, fontSize: 12.5, color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px', lineHeight: 1.5 }}>
                Não foi possível salvar sua ficha: {erroGravacao}. Suas respostas continuam aqui — tente de novo.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              {passo > 0 ? (
                <button type="button" data-testid="ficha-voltar" onClick={voltar} disabled={salvando} style={{ ...s.btnOutline, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="chevron-left" color={theme.primary} size={14} /> Voltar
                </button>
              ) : <span />}
              <button type="submit" data-testid="ficha-continuar" disabled={salvando} style={{ ...s.btnPrimary, padding: '11px 22px', fontSize: 13.5, opacity: salvando ? 0.6 : 1 }}>
                {ultimo ? (salvando ? 'Salvando…' : erroGravacao ? 'Tentar de novo' : 'Concluir') : 'Continuar'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
