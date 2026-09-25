import { useEffect, useRef, useState } from 'react';
import { Icon } from '../lib/icons';
import { conferirQuestao } from '../lib/fundamentos';
import { agruparPorExame, formatarValor, respostasPreenchidas, maisRecente } from '../lib/discursivas';
import { listarDiscursivas, buscarDiscursiva, listarRespostasDiscursivas } from '../lib/api/api';

// A 2ª fase: questões discursivas de uma área, com o padrão de resposta da
// FGV. Página própria, sem dashboard nem menu — a cliente pediu "bem mais
// simples": escolher a questão, responder, conferir.
//
// O acervo e as respostas salvas são do servidor e ficam em estado local
// desta tela, recarregados a cada visita. De `state.segundaFase` no App
// (`estado`) vêm a questão aberta — da tela — e os rascunhos ainda não
// conferidos, que são da conta: vão para a chave dela no localStorage,
// sobrevivem ao "Sair" e passam entre abas (ver `FATIAS_DA_CONTA`).

const COR_TEXTO = '#2c2530';

// O servidor recusa resposta maior que isto por item.
const MAX_CARACTERES = 6000;
const COR_SUAVE = '#8b8391';

const AVISO_CORRECAO = 'Esta conferência não é nota: ela só verifica se você citou os fundamentos do padrão de resposta. '
  + 'A banca também avalia a fundamentação; citar o artigo sozinho não pontua.';

function Aviso({ s, icone, cor, titulo, texto, acao, testid }) {
  return (
    <div
      className="entra"
      data-testid={testid}
      style={{ background: '#fff', border: '1px solid rgba(0,0,0,.05)', borderRadius: 18, padding: '44px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
    >
      <div style={{ width: 64, height: 64, borderRadius: 20, background: cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icone} color="#fff" size={30} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: COR_TEXTO, marginTop: 14 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: COR_SUAVE, marginTop: 6, maxWidth: 460, lineHeight: 1.55 }}>{texto}</div>
      {acao && (
        <button type="button" style={{ ...s.btnPrimary, marginTop: 18, padding: '11px 20px' }} onClick={acao.onClick}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}

function Esqueleto({ s, linhas = 4 }) {
  return (
    <div style={s.card} data-testid="discursivas-carregando" aria-busy="true">
      <div className="esqueleto" style={{ height: 12, width: 180 }} />
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="esqueleto" style={{ height: 44, marginTop: 12 }} />
      ))}
    </div>
  );
}

// Mensagem de erro de carga. 401 não chega aqui: volta ao login pelo App.
function mensagemDeErro(err) {
  return err?.status === 0 ? 'Não foi possível falar com o servidor.' : (err?.message || 'Erro desconhecido.');
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

function ListaDeQuestoes({ theme, s, area, rascunhos, abrir, sessaoExpirou }) {
  const [lista, setLista] = useState({ estado: 'carregando', questoes: [], erro: null });
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setLista((l) => ({ ...l, estado: 'carregando', erro: null }));

    listarDiscursivas(area)
      .then((questoes) => { if (!cancelado) setLista({ estado: 'pronto', questoes, erro: null }); })
      .catch((err) => {
        if (cancelado) return;
        if (err.status === 401) { sessaoExpirou(); return; }
        // 404 é o gateway que ainda não tem a rota: para quem estuda, é o
        // mesmo que o acervo ainda não ter chegado, e é isso que o aviso diz.
        if (err.status === 404) { setLista({ estado: 'pronto', questoes: [], erro: null }); return; }
        setLista({ estado: 'erro', questoes: [], erro: mensagemDeErro(err) });
      });

    return () => { cancelado = true; };
  }, [area, recarga, sessaoExpirou]);

  if (lista.estado === 'carregando') return <Esqueleto s={s} />;

  if (lista.estado === 'erro') {
    return (
      <Aviso
        s={s} testid="discursivas-erro" icone="triangle-alert" cor="#EF4444"
        titulo="As questões não carregaram"
        texto={lista.erro}
        acao={{ rotulo: 'Tentar de novo', onClick: () => setRecarga((n) => n + 1) }}
      />
    );
  }

  if (lista.questoes.length === 0) {
    return (
      <Aviso
        s={s} testid="discursivas-vazio" icone="clock" cor={theme.primary}
        titulo="As questões discursivas estão chegando"
        texto="O acervo da 2ª fase ainda está sendo carregado com as provas e os padrões de resposta oficiais da FGV. Enquanto isso, a 1ª fase continua disponível no seletor do topo."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {agruparPorExame(lista.questoes).map(({ exame, questoes }) => (
        <section key={exame} aria-labelledby={`exame-${exame}`}>
          <h2 id={`exame-${exame}`} style={{ fontSize: 13, fontWeight: 700, color: theme.primaryDark, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px 2px' }}>
            {exame}º Exame de Ordem
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {questoes.map((q) => {
              const temRascunho = respostasPreenchidas(rascunhos[String(q.id)]) > 0;
              return (
                <button
                  key={q.id}
                  type="button"
                  data-testid={`discursiva-${q.id}`}
                  onClick={() => abrir(q.id)}
                  style={{ ...s.card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', font: 'inherit', width: '100%', cursor: 'pointer' }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: theme.primarySoft, color: theme.primaryDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flex: 'none' }}>
                    {q.numero}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: COR_TEXTO }}>Questão {q.numero}</div>
                    {q.resumo && (
                      <div style={{ fontSize: 12.5, color: COR_SUAVE, marginTop: 2, lineHeight: 1.45 }}>{q.resumo}</div>
                    )}
                  </div>
                  {temRascunho && <span style={s.pill('#FEF3C7', '#B45309')}>Rascunho</span>}
                  <Icon name="play" color={theme.primary} size={14} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conferência de um item
// ---------------------------------------------------------------------------

function comDetalhe(rotulo, detalhe) {
  return detalhe ? `${rotulo} (${detalhe})` : rotulo;
}

function ConferenciaDoItem({ theme, s, item, resultado }) {
  const { esperados, atendidos, faltando, extras } = resultado;
  const total = esperados.length;
  const tudo = total > 0 && atendidos.length === total;
  const cor = total === 0 ? ['#F1EEF4', '#5c5462'] : tudo ? ['#D1FAE5', '#047857'] : atendidos.length > 0 ? ['#FEF3C7', '#B45309'] : ['#FEE2E2', '#B91C1C'];
  const valor = formatarValor(item.valor);

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span data-testid={`fundamentos-${item.letra}`} style={{ ...s.pill(cor[0], cor[1]), fontSize: 12 }}>
          {total === 0 ? 'Sem artigo no padrão de resposta' : `Fundamentos: ${atendidos.length} de ${total}`}
        </span>
        {valor && <span style={{ fontSize: 12, color: COR_SUAVE }}>Valor do item: {valor}</span>}
      </div>

      {faltando.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C' }}>Faltou citar</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {faltando.map((f) => (
              <li key={f.rotulo} style={{ fontSize: 13, color: COR_TEXTO, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="x" color="#EF4444" size={14} style={{ marginTop: 2 }} />
                <span>
                  {f.opcoes.map((o) => comDetalhe(o.rotulo, o.detalhe)).join(' ou ')}
                  {f.opcoes.length > 1 && <span style={{ color: COR_SUAVE }}> — qualquer um deles</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(atendidos.length > 0 || extras.length > 0) && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#047857' }}>Você citou</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {atendidos.map((a) => (
              <li key={a.rotulo} style={{ fontSize: 13, color: COR_TEXTO, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="check" color="#10B981" size={14} style={{ marginTop: 2 }} />
                <span>
                  {comDetalhe(a.citado.rotulo, a.citado.detalhe)}
                  {a.citado.semDiploma && <span style={{ color: '#B45309' }}> — diga de qual lei é o artigo</span>}
                </span>
              </li>
            ))}
            {extras.map((e) => (
              <li key={e.chave} style={{ fontSize: 13, color: COR_TEXTO, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="bookmark" color={COR_SUAVE} size={14} style={{ marginTop: 2 }} />
                <span>
                  {comDetalhe(e.rotulo, e.detalhe)}
                  <span style={{ color: COR_SUAVE }}>{e.semDiploma ? ' — sem dizer a lei; ' : ' — '}não está no padrão de resposta</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ background: theme.primarySoft, borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.primaryDark, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="graduation-cap" color={theme.primaryDark} size={14} />Padrão de resposta da FGV
        </div>
        {resultado.caminhos > 1 && (
          <div style={{ fontSize: 12, color: theme.primaryDark, marginTop: 4 }}>
            A banca aceita {resultado.caminhos} respostas, separadas por “OU”; a conferência acima usa a que a sua resposta mais segue.
          </div>
        )}
        {/* `pre-line`: o texto vem com uma quebra entre parágrafos, e a linha
            "OU" das respostas alternativas precisa aparecer sozinha. */}
        <div data-testid={`gabarito-${item.letra}`} style={{ fontSize: 13.5, color: COR_TEXTO, marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
          {item.gabarito || 'A FGV não publicou o padrão de resposta deste item.'}
        </div>
        {item.distribuicao && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(109,40,217,.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.primaryDark }}>Distribuição dos pontos</div>
            <div data-testid={`distribuicao-${item.letra}`} style={{ fontSize: 12.5, color: '#5c5462', marginTop: 4, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {item.distribuicao}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Questão aberta
// ---------------------------------------------------------------------------

function formatarData(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function QuestaoAberta({ theme, s, questaoId, rascunho, setRascunho, voltar, gravarResposta, salvaNaSessao, sessaoExpirou }) {
  const [carga, setCarga] = useState({ estado: 'carregando', questao: null, erro: null });
  const [ultimaDoServidor, setUltimaDoServidor] = useState(null);
  // A carga pode ter saído antes de um POST desta sessão terminar (a pessoa
  // reabriu a questão com a gravação no ar): vale a mais recente das duas.
  const ultima = maisRecente(ultimaDoServidor, salvaNaSessao);
  const [erroDasRespostas, setErroDasRespostas] = useState(null);
  const [recarga, setRecarga] = useState(0);
  // O que foi conferido e ainda não está confirmado no servidor: salvando,
  // ou com a gravação recusada.
  const [pendente, setPendente] = useState(null);
  const montada = useRef(true);

  useEffect(() => {
    montada.current = true;
    return () => { montada.current = false; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCarga((c) => ({ ...c, estado: 'carregando', erro: null }));
    setErroDasRespostas(null);

    Promise.allSettled([buscarDiscursiva(questaoId), listarRespostasDiscursivas(questaoId)])
      .then(([questao, respostas]) => {
        if (cancelado) return;
        if ([questao, respostas].some((r) => r.status === 'rejected' && r.reason?.status === 401)) {
          sessaoExpirou();
          return;
        }
        if (questao.status === 'rejected') {
          const err = questao.reason;
          setCarga({ estado: 'erro', questao: null, erro: err?.status === 404 ? 'Esta questão não está mais no acervo.' : mensagemDeErro(err) });
          return;
        }
        // Sem as respostas salvas a questão ainda serve para responder; o
        // aviso diz que a última resposta não apareceu, em vez de fingir que
        // não existe.
        if (respostas.status === 'rejected') {
          // Sem zerar a última: uma busca nova pode já tê-la trazido.
          setErroDasRespostas(mensagemDeErro(respostas.reason));
        } else {
          // `maisRecente`, e não o valor direto: a busca que o sumiço do
          // rascunho dispara pode ter voltado antes desta carga, com uma
          // resposta mais nova que a dela.
          setUltimaDoServidor((atual) => maisRecente(atual, respostas.value[0] || null));
        }
        setCarga({ estado: 'pronto', questao: questao.value, erro: null });
      });

    return () => { cancelado = true; };
  }, [questaoId, recarga, sessaoExpirou]);

  // O rascunho sumiu: a resposta foi salva — aqui, ou noutra aba, que apagou
  // o rascunho da chave da conta. Nesse segundo caso esta aba não sabe o que
  // foi salvo; busca de novo, sem esqueleto, só a última resposta.
  // "Descartar" também apaga o rascunho, mas aí nada foi salvo: não busca.
  const tinhaRascunho = useRef(rascunho !== undefined);
  const descartou = useRef(false);
  useEffect(() => {
    const tinha = tinhaRascunho.current;
    tinhaRascunho.current = rascunho !== undefined;
    if (!tinha || rascunho !== undefined) return undefined;
    if (descartou.current) { descartou.current = false; return undefined; }

    let cancelado = false;
    listarRespostasDiscursivas(questaoId)
      .then((respostas) => {
        if (cancelado) return;
        setUltimaDoServidor((atual) => maisRecente(atual, respostas[0] || null));
        setErroDasRespostas(null);
      })
      .catch((err) => {
        if (!cancelado && err.status === 401) sessaoExpirou();
      });
    return () => { cancelado = true; };
  }, [rascunho, questaoId, sessaoExpirou]);

  const cabecalho = (
    <button
      type="button"
      data-testid="voltar-lista"
      onClick={voltar}
      style={{ ...s.btnOutline, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 14, padding: '7px 12px' }}
    >
      <Icon name="chevron-left" color={theme.primary} size={15} />Todas as questões
    </button>
  );

  if (carga.estado === 'carregando') return <>{cabecalho}<Esqueleto s={s} linhas={3} /></>;
  if (carga.estado === 'erro') {
    return (
      <>
        {cabecalho}
        <Aviso
          s={s} testid="discursiva-erro" icone="triangle-alert" cor="#EF4444"
          titulo="A questão não carregou" texto={carga.erro}
          acao={{ rotulo: 'Tentar de novo', onClick: () => setRecarga((n) => n + 1) }}
        />
      </>
    );
  }

  const { questao } = carga;
  const itens = questao.itens || [];

  // Editando: há rascunho, ou nada foi respondido ainda. Conferida: a
  // pendente (acabou de corrigir) ou a última salva no servidor.
  const conferida = pendente ? pendente.respostas : (rascunho === undefined ? ultima?.respostas : null);
  const editando = !conferida;
  const texto = rascunho || {};
  const conferencia = conferida ? conferirQuestao(itens, conferida) : null;

  const salvar = async (respostas) => {
    const { citados, esperados } = conferirQuestao(itens, respostas);
    setPendente({ respostas, salvando: true, erro: null });
    try {
      const salva = await gravarResposta({ questaoId: questao.id, respostas, fundamentos: { citados, esperados } });
      // null: a sessão acabou com o POST no ar (o App já cuidou disso). O
      // rascunho quem apaga é o App, que segue montado se a pessoa sair daqui,
      // e a resposta salva chega por `salvaNaSessao`.
      if (!salva || !montada.current) return;
      setPendente(null);
    } catch (err) {
      if (montada.current) setPendente({ respostas, salvando: false, erro: mensagemDeErro(err) });
    }
  };

  const corrigir = () => {
    const respostas = Object.fromEntries(itens.map((i) => [i.letra, texto[i.letra] || '']));
    salvar(respostas);
  };

  const responderDeNovo = () => {
    setRascunho({ ...(conferida || {}) });
    setPendente(null);
  };

  const preenchidas = respostasPreenchidas(texto);

  return (
    <div className="entra">
      {cabecalho}

      <div style={s.card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.primary, textTransform: 'uppercase', letterSpacing: '1px' }}>
          {questao.exame}º Exame de Ordem · Questão {questao.numero}
        </div>
        <div data-testid="enunciado" style={{ fontSize: 14.5, color: COR_TEXTO, lineHeight: 1.7, marginTop: 10, whiteSpace: 'pre-line' }}>
          {questao.enunciado}
        </div>
        {questao.fonte && (
          <div style={{ fontSize: 11.5, color: COR_SUAVE, marginTop: 12 }}>Fonte: {questao.fonte}</div>
        )}
      </div>

      {erroDasRespostas && !ultimaDoServidor && (
        <div role="status" style={{ marginTop: 12, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 12, padding: '10px 14px', fontSize: 12.5 }}>
          Sua última resposta a esta questão não carregou ({erroDasRespostas}). O que você responder agora é salvo normalmente.
        </div>
      )}

      {conferencia && (
        <div data-testid="resumo-conferencia" style={{ ...s.card, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: COR_TEXTO }}>
              {conferencia.esperados > 0
                ? `Você citou ${conferencia.citados} de ${conferencia.esperados} fundamentos do padrão de resposta`
                : 'O padrão de resposta desta questão não cita artigos'}
            </div>
            <EstadoDaGravacao s={s} pendente={pendente} ultima={ultima} tentarDeNovo={() => salvar(pendente.respostas)} />
          </div>
          <div style={{ fontSize: 12.5, color: COR_SUAVE, lineHeight: 1.5 }}>{AVISO_CORRECAO}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {itens.map((item) => {
          const valor = formatarValor(item.valor);
          const idCampo = `resposta-${questao.id}-${item.letra}`;
          return (
            <div key={item.letra} style={s.card} data-testid={`item-${item.letra}`}>
              <label htmlFor={editando ? idCampo : undefined} style={{ display: 'block', fontSize: 14, color: COR_TEXTO, lineHeight: 1.6 }}>
                <strong>{item.letra})</strong> {item.pergunta}
                {valor && <span style={{ color: COR_SUAVE }}> (Valor: {valor})</span>}
              </label>

              {editando ? (
                <>
                <textarea
                  id={idCampo}
                  data-testid={`resposta-${item.letra}`}
                  value={texto[item.letra] || ''}
                  onChange={(e) => setRascunho({ ...texto, [item.letra]: e.target.value })}
                  maxLength={MAX_CARACTERES}
                  aria-describedby={`${idCampo}-contagem`}
                  rows={6}
                  placeholder="Responda e fundamente: indique o artigo e a lei, como em “art. 1.659, I, do CC”."
                  style={{ width: '100%', marginTop: 10, border: `1px solid ${theme.primarySoft}`, borderRadius: 12, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.6, color: COR_TEXTO, resize: 'vertical', background: '#fff' }}
                />
                <div id={`${idCampo}-contagem`} style={{ fontSize: 11, color: COR_SUAVE, textAlign: 'right', marginTop: 2 }}>
                  {(texto[item.letra] || '').length} / {MAX_CARACTERES} caracteres
                </div>
                </>
              ) : (
                <>
                  <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: COR_SUAVE, textTransform: 'uppercase', letterSpacing: '.5px' }}>Sua resposta</div>
                  <div data-testid={`sua-resposta-${item.letra}`} style={{ marginTop: 4, fontSize: 13.5, color: COR_TEXTO, lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#FAF9FB', borderRadius: 10, padding: '10px 12px' }}>
                    {conferida[item.letra]?.trim() || <span style={{ color: COR_SUAVE }}>Em branco.</span>}
                  </div>
                  <ConferenciaDoItem theme={theme} s={s} item={item} resultado={conferencia.porItem[item.letra]} />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
        {editando ? (
          <>
            <button
              type="button"
              data-testid="corrigir"
              onClick={corrigir}
              disabled={preenchidas === 0}
              style={{ ...s.btnPrimary, padding: '11px 22px', opacity: preenchidas === 0 ? 0.5 : 1, cursor: preenchidas === 0 ? 'not-allowed' : 'pointer' }}
            >
              <Icon name="check" color="#fff" size={15} />Corrigir
            </button>
            <span style={{ fontSize: 12, color: COR_SUAVE, maxWidth: 520, lineHeight: 1.5 }}>
              Confere os artigos citados com o padrão de resposta e salva a sua resposta.
            </span>
            {ultima && rascunho !== undefined && (
              <button type="button" onClick={() => { descartou.current = true; setRascunho(undefined); }} style={{ ...s.btnOutline }}>
                Descartar e ver a última correção
              </button>
            )}
          </>
        ) : (
          <button type="button" data-testid="responder-de-novo" onClick={responderDeNovo} disabled={pendente?.salvando} style={{ ...s.btnOutline }}>
            Responder de novo
          </button>
        )}
      </div>
    </div>
  );
}

function EstadoDaGravacao({ s, pendente, ultima, tentarDeNovo }) {
  if (pendente?.salvando) {
    return <span role="status" style={{ fontSize: 12, color: COR_SUAVE }}>Salvando…</span>;
  }
  if (pendente?.erro) {
    return (
      <span role="alert" data-testid="erro-gravacao" style={{ fontSize: 12, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Resposta não salva: {pendente.erro}
        <button type="button" onClick={tentarDeNovo} style={{ ...s.btnOutline, padding: '5px 10px', fontSize: 11.5 }}>Tentar de novo</button>
      </span>
    );
  }
  const quando = ultima?.criada_em ? formatarData(ultima.criada_em) : null;
  return (
    <span data-testid="resposta-salva" style={{ fontSize: 12, color: '#047857', display: 'flex', alignItems: 'center', gap: 5 }}>
      <Icon name="circle-check" color="#10B981" size={14} />
      {quando ? `Salva em ${quando}` : 'Resposta salva'}
    </span>
  );
}

// ---------------------------------------------------------------------------

export default function SegundaFase({ theme, s, fase, estado, setEstado, gravarResposta, salvasNaSessao, sessaoExpirou }) {
  const questaoId = estado?.questaoId ?? null;
  const rascunhos = estado?.rascunhos || {};

  const abrir = (id) => setEstado({ questaoId: id });
  const voltar = () => setEstado({ questaoId: null });

  // `undefined` apaga o rascunho ("Descartar"). Depois de salvar, quem apaga é
  // o App (`gravarRespostaDiscursiva`).
  const setRascunho = (id) => (valor) => setEstado((atual) => {
    const proximos = { ...(atual?.rascunhos || {}) };
    if (valor === undefined) delete proximos[String(id)];
    else proximos[String(id)] = valor;
    return { ...atual, rascunhos: proximos };
  });

  return (
    <div style={{ maxWidth: 860 }}>
      {questaoId == null ? (
        <ListaDeQuestoes
          theme={theme} s={s} area={fase.area} rascunhos={rascunhos}
          abrir={abrir} sessaoExpirou={sessaoExpirou}
        />
      ) : (
        // `key`: trocar de questão zera o que é desta questão — carga,
        // conferência pendente, última resposta.
        <QuestaoAberta
          key={questaoId}
          theme={theme} s={s} questaoId={questaoId}
          rascunho={rascunhos[String(questaoId)]}
          setRascunho={setRascunho(questaoId)}
          voltar={voltar}
          gravarResposta={gravarResposta}
          salvaNaSessao={salvasNaSessao?.[String(questaoId)]}
          sessaoExpirou={sessaoExpirou}
        />
      )}
    </div>
  );
}
