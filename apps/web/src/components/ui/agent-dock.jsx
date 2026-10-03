import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon } from '../../lib/icons';
import { FONTE_TITULO } from '../../lib/theme';

// O dock do assistente, no canto inferior direito. Adaptado do AgentDock
// (21st.dev): uma barra escura com rosto, nome e status, que se abre para
// cima em dois modos — o guia do dia e a conversa.
//
// O componente não sabe nada de estudo: recebe o guia pronto (falas, ações,
// placar da meta) e uma função `responder(mensagem)` que devolve
// `{ texto, acoes }` (ou uma promessa disso). Quem decide o que dizer é
// lib/kepy.js; quem executa a ação é o App, por `onAcao`.
//
// Atalhos: G abre o guia, K a conversa, Esc fecha. Fora de campo de texto e
// sem modificador — e nunca A–E nem 1–5, que marcam alternativa no quiz.

const TINTA = '#1c1b19';
const CLARO = '#fff';
const APAGADO = 'rgba(255,255,255,.62)';
const VEU = 'rgba(255,255,255,.08)';
const FIO = 'rgba(255,255,255,.14)';
const ease = [0.22, 1, 0.36, 1];

const consultaEstreita = '(max-width: 479px)';
const assinarEstreita = (mudou) => {
  const q = window.matchMedia(consultaEstreita);
  q.addEventListener('change', mudou);
  return () => q.removeEventListener('change', mudou);
};

const digitando = (alvo) => alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));

// `avatar` (opcional) desenha o rosto; sem ele, a inicial do nome.
function Rosto({ cores, inicial, novo, avatar }) {
  return (
    <span style={{ position: 'relative', flex: 'none' }}>
      {avatar ?? (
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: 8, background: cores.primarySoft, color: cores.primaryDark,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONTE_TITULO, fontSize: 19, fontWeight: 500, lineHeight: 1,
          }}
        >
          {inicial}
        </span>
      )}
      {novo && (
        <span
          data-testid="kepy-novo"
          aria-hidden="true"
          style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: cores.accent, boxShadow: `0 0 0 2px ${TINTA}` }}
        />
      )}
    </span>
  );
}

function BotaoDoDock({ icone, rotulo, atalho, ativo, compacto, onClick, testId, botaoRef }) {
  const [sobre, setSobre] = useState(false);
  return (
    <button
      ref={botaoRef}
      type="button"
      data-testid={testId}
      aria-pressed={ativo}
      aria-keyshortcuts={atalho}
      title={compacto ? `${rotulo} (${atalho})` : undefined}
      onClick={onClick}
      onPointerEnter={() => setSobre(true)}
      onPointerLeave={() => setSobre(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 6px', borderRadius: 8, border: 'none',
        background: ativo || sobre ? VEU : 'transparent', color: CLARO, font: 'inherit', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      }}
    >
      <Icon name={icone} size={16} />
      {!compacto && <span>{rotulo}</span>}
      {!compacto && (
        <kbd style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: VEU, fontFamily: 'inherit', fontSize: 11, color: APAGADO }}>
          {atalho}
        </kbd>
      )}
    </button>
  );
}

// Ação vira botão: a primeira de um bloco, cheia (branca no dock escuro);
// as outras, contorno.
function BotaoDeAcao({ acao, principal, onClick }) {
  return (
    <button
      type="button"
      data-testid={acao.id}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 7,
        background: principal ? CLARO : 'transparent', color: principal ? TINTA : CLARO,
        border: `1px solid ${principal ? CLARO : FIO}`,
      }}
    >
      <Icon name={acao.icone} size={14} color={principal ? TINTA : APAGADO} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acao.rotulo}</span>
    </button>
  );
}

const fala = { fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,.86)', background: VEU, borderRadius: 8, padding: '9px 12px' };

export function AgentDock({
  agentName,
  avatar,
  status,
  workingStatus = 'Pensando…',
  cores,
  novo = false,
  progresso = null,
  guia,
  responder,
  saudacao,
  sugestoes = [],
  onAcao,
  onAbrir,
}) {
  const [modo, setModo] = useState('fechado'); // 'fechado' | 'guia' | 'conversa'
  const [trabalhando, setTrabalhando] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const reduzido = !!useReducedMotion();
  const compacto = useSyncExternalStore(assinarEstreita, () => window.matchMedia(consultaEstreita).matches, () => false);
  const raizRef = useRef(null);
  const campoRef = useRef(null);
  const fioRef = useRef(null);
  const guiaRef = useRef(null);
  const conversaRef = useRef(null);
  const montado = useRef(true);

  // Marca `true` no próprio efeito, e não só no useRef: o StrictMode monta,
  // desmonta e monta de novo, e sem isto a falsa desmontagem deixava o dock
  // "desmontado" para sempre — a resposta chegava e era jogada fora, com o
  // status preso em "Pensando…".
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const abrir = (proximo) => {
    if (proximo === modo) { fechar(true); return; }
    setModo(proximo);
    onAbrir?.(proximo);
    if (proximo === 'conversa') {
      setMensagens((atual) => (atual.length ? atual : [{ de: 'agente', texto: saudacao, acoes: [] }]));
      window.requestAnimationFrame(() => campoRef.current?.focus());
    } else {
      window.requestAnimationFrame(() => raizRef.current?.querySelector('[data-painel] button')?.focus());
    }
  };
  function fechar(devolverFoco) {
    const era = modo;
    setModo('fechado');
    if (devolverFoco) (era === 'conversa' ? conversaRef : guiaRef).current?.focus();
  }
  const agir = (acao) => {
    setModo('fechado');
    onAcao(acao);
  };

  // Atalhos e Esc. G/K só fora de campo de texto; Esc vale em qualquer lugar
  // dentro do dock.
  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape' && modo !== 'fechado') {
        e.preventDefault();
        fechar(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || digitando(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'g') { e.preventDefault(); abrir('guia'); }
      else if (k === 'k') { e.preventDefault(); abrir('conversa'); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // Clique fora fecha (o rascunho da conversa fica guardado).
  useEffect(() => {
    if (modo === 'fechado') return undefined;
    const fora = (e) => { if (!raizRef.current?.contains(e.target)) setModo('fechado'); };
    document.addEventListener('pointerdown', fora, true);
    return () => document.removeEventListener('pointerdown', fora, true);
  }, [modo]);

  // A conversa rola sozinha até a última mensagem.
  useEffect(() => {
    if (modo === 'conversa' && fioRef.current) fioRef.current.scrollTop = fioRef.current.scrollHeight;
  }, [mensagens, trabalhando, modo]);

  async function enviar(mensagem) {
    const limpa = (mensagem ?? texto).trim();
    if (!limpa || trabalhando) return;
    setTexto('');
    setMensagens((m) => [...m, { de: 'voce', texto: limpa }]);
    setTrabalhando(true);
    try {
      // Um respiro antes da resposta: sem ele a resposta local chega no mesmo
      // quadro da pergunta e parece que nada aconteceu.
      const [resposta] = await Promise.all([
        Promise.resolve(responder(limpa)),
        new Promise((r) => setTimeout(r, reduzido ? 0 : 350)),
      ]);
      if (montado.current) setMensagens((m) => [...m, { de: 'agente', texto: resposta.texto, acoes: resposta.acoes || [] }]);
    } catch {
      if (montado.current) setMensagens((m) => [...m, { de: 'agente', texto: 'Não consegui responder agora. Tente de novo.', acoes: [] }]);
    } finally {
      if (montado.current) setTrabalhando(false);
    }
  }

  const aoTeclarNoCampo = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    enviar();
  };

  const transicao = reduzido ? { duration: 0 } : { duration: 0.3, ease };
  const largura = 'min(400px, calc(100vw - 32px))';

  return (
    <div
      ref={raizRef}
      data-testid="kepy"
      style={{
        position: 'fixed', right: compacto ? 16 : 24, bottom: compacto ? 16 : 24, zIndex: 50, width: largura,
        display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden',
        background: TINTA, color: CLARO, borderRadius: 12, padding: 8,
        boxShadow: '0 8px 24px rgba(28,27,25,.22), 0 1px 3px rgba(28,27,25,.12)',
      }}
    >
      {/* Barra: rosto, nome, status e os dois botões. */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Rosto
          cores={cores}
          inicial={agentName[0]}
          novo={novo && modo === 'fechado'}
          avatar={avatar?.({ modo, trabalhando })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1 }}>{agentName}</div>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={trabalhando ? 'trabalhando' : status}
              data-testid="kepy-status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: reduzido ? 0 : 0.16, ease: 'easeOut' }}
              style={{ marginTop: 5, fontSize: 12, color: APAGADO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}
            >
              {trabalhando ? workingStatus : status}
            </motion.div>
          </AnimatePresence>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          <BotaoDoDock
            botaoRef={guiaRef} testId="kepy-guia" icone="compass" rotulo="Guia" atalho="G"
            ativo={modo === 'guia'} compacto={compacto} onClick={() => abrir('guia')}
          />
          <BotaoDoDock
            botaoRef={conversaRef} testId="kepy-conversar" icone="message-circle" rotulo="Conversar" atalho="K"
            ativo={modo === 'conversa'} compacto={compacto} onClick={() => abrir('conversa')}
          />
        </div>
      </div>

      {/* Progresso da meta: um fio sob tudo, que só existe com placar. */}
      {progresso != null && (
        <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: VEU }}>
          <div style={{ width: `${Math.min(Math.max(progresso, 0), 1) * 100}%`, height: '100%', background: cores.primarySoft, transition: 'width .6s cubic-bezier(.22,1,.36,1)' }} />
        </div>
      )}

      <AnimatePresence initial={false} mode="wait">
        {modo !== 'fechado' && (
          <motion.div
            key={modo}
            data-painel
            data-testid="painel-kepy"
            role="region"
            aria-label={modo === 'guia' ? `Guia do dia, ${agentName}` : `Conversa com ${agentName}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transicao}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '6px 6px 12px', borderBottom: `1px solid ${FIO}`, marginBottom: 8 }}>
              {modo === 'guia' ? (
                <>
                  {guia.meta && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: APAGADO }}>
                        <span>Meta de hoje</span>
                        <span data-testid="kepy-meta" style={{ color: CLARO, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {guia.meta.respondidas}/{guia.meta.meta}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: VEU, marginTop: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(guia.meta.respondidas / (guia.meta.meta || 1), 1) * 100}%`, height: '100%', borderRadius: 4, background: guia.meta.batida ? '#8DB88D' : cores.primarySoft }} />
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                    {guia.falas.map((f, i) => (
                      <div key={f} style={{ ...fala, borderLeft: i === 0 ? `3px solid ${cores.accent}` : undefined }}>{f}</div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                    {guia.acoes.map((a, i) => <BotaoDeAcao key={a.id} acao={a} principal={i === 0} onClick={() => agir(a)} />)}
                  </div>
                </>
              ) : (
                <>
                  <div ref={fioRef} aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'min(300px, 45vh)', overflowY: 'auto', paddingRight: 2 }}>
                    {mensagens.map((m, i) => (
                      m.de === 'voce' ? (
                        <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', fontSize: 13, lineHeight: 1.5, background: cores.primarySoft, color: cores.primaryDark, borderRadius: 8, padding: '8px 12px' }}>
                          {m.texto}
                        </div>
                      ) : (
                        <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={fala}>{m.texto}</div>
                          {m.acoes?.map((a) => <BotaoDeAcao key={a.id} acao={a} principal={false} onClick={() => agir(a)} />)}
                        </div>
                      )
                    ))}
                    {trabalhando && <div style={{ ...fala, alignSelf: 'flex-start', color: APAGADO }}>…</div>}
                    {mensagens.length <= 1 && sugestoes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {sugestoes.map((sug) => (
                          <button
                            key={sug}
                            type="button"
                            onClick={() => enviar(sug)}
                            style={{ border: `1px solid ${FIO}`, background: 'transparent', color: CLARO, borderRadius: 4, padding: '5px 9px', font: 'inherit', fontSize: 12, cursor: 'pointer' }}
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => { e.preventDefault(); enviar(); }}
                    style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 10, background: VEU, borderRadius: 8, padding: 4 }}
                  >
                    <textarea
                      ref={campoRef}
                      data-testid="kepy-mensagem"
                      aria-label={`Mensagem para ${agentName}`}
                      rows={2}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={aoTeclarNoCampo}
                      placeholder="Pergunte sobre meta, revisão, prova, matéria…"
                      style={{ flex: 1, minWidth: 0, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: CLARO, font: 'inherit', fontSize: 13, lineHeight: 1.5, padding: '6px 8px' }}
                    />
                    <button
                      type="submit"
                      data-testid="kepy-enviar"
                      aria-label="Enviar"
                      disabled={!texto.trim() || trabalhando}
                      style={{
                        flex: 'none', width: 32, height: 32, borderRadius: 7, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: texto.trim() ? CLARO : 'transparent', color: texto.trim() ? TINTA : APAGADO, cursor: texto.trim() ? 'pointer' : 'default',
                      }}
                    >
                      <Icon name="send" size={15} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AgentDock;
