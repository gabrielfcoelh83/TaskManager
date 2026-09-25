import { FASES, FASE_PADRAO } from '../../lib/navegacao';
import {
  DIAS_DA_SEMANA, TEMPOS_POR_DIA, JA_FEZ, MINUTOS_POR_QUESTAO, META_MAXIMA,
  metaSugerida, escolherTempo, rotuloDaFase, rotuloDosDias, rotuloDoTempo, rotuloJaFez, formatarData,
} from '../../lib/ficha';

// Os quatro passos da ficha de boas-vindas, cada um só com os campos. A ficha
// (`FichaDeBoasVindas`) mostra um de cada vez; "Meu perfil de estudo", nas
// Configurações, mostra os quatro juntos para editar. Um componente por passo
// é o que mantém as duas telas perguntando a mesma coisa do mesmo jeito.
//
// Campos nativos (radio, checkbox, date, number) dentro de <label>: teclado,
// leitor de tela e a roda de datas do celular vêm do navegador. O visual de
// "cartão marcado" é só a borda e o fundo do rótulo.

const cor = { texto: '#2c2530', suave: '#8b8391', borda: 'rgba(0,0,0,.1)' };

export const estiloCampo = {
  width: '100%', fontSize: 14, border: `1px solid ${cor.borda}`, borderRadius: 10,
  padding: '10px 12px', color: cor.texto, fontFamily: 'inherit', background: '#fff',
};

function Pergunta({ children, id }) {
  return <legend id={id} style={{ fontSize: 13.5, fontWeight: 600, color: cor.texto, marginBottom: 10, padding: 0 }}>{children}</legend>;
}

function Grupo({ children, style }) {
  return <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, ...style }}>{children}</fieldset>;
}

function Dica({ children, id }) {
  return <div id={id} style={{ fontSize: 12, color: cor.suave, marginTop: 8, lineHeight: 1.5 }}>{children}</div>;
}

/** Uma opção de radio ou checkbox com cara de cartão. */
function Opcao({ theme, tipo = 'radio', nome, marcada, onChange, disabled, children, testid, compacta }) {
  return (
    <label
      data-testid={testid}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        padding: compacta ? '8px 12px' : '11px 14px', borderRadius: 12, fontSize: 13.5, color: cor.texto,
        border: marcada ? `2px solid ${theme.primary}` : `1px solid ${cor.borda}`,
        margin: marcada ? 0 : 1,
        background: marcada ? theme.primarySoft : '#fff',
        opacity: disabled ? 0.55 : 1,
        transition: 'background-color 160ms ease, border-color 160ms ease',
      }}
    >
      <input
        type={tipo}
        name={nome}
        checked={marcada}
        disabled={disabled}
        onChange={onChange}
        style={{ accentColor: theme.primary, width: 16, height: 16, margin: 0, flex: 'none' }}
      />
      <span style={{ minWidth: 0 }}>{children}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------

export function PassoVoce({ theme, r, set, idBase = 'ficha' }) {
  const segundaFase = FASES.filter((f) => f.chave !== FASE_PADRAO);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <label htmlFor={`${idBase}-nome`} style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: cor.texto, marginBottom: 8 }}>
          Como você quer ser chamado(a)?
        </label>
        <input
          id={`${idBase}-nome`}
          data-testid="ficha-nome"
          style={estiloCampo}
          value={r.nome}
          maxLength={120}
          autoComplete="name"
          onChange={(e) => set({ nome: e.target.value })}
        />
      </div>

      <Grupo>
        <Pergunta>Qual fase você vai fazer?</Pergunta>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Opcao theme={theme} nome={`${idBase}-fase`} testid="ficha-fase-objetiva" marcada={r.fase === FASE_PADRAO} onChange={() => set({ fase: FASE_PADRAO })}>
            <strong style={{ fontWeight: 600 }}>1ª fase</strong> — prova objetiva
          </Opcao>
          {segundaFase.map((f) => (
            <Opcao key={f.chave} theme={theme} nome={`${idBase}-fase`} testid={`ficha-fase-${f.chave}`} marcada={r.fase === f.chave} onChange={() => set({ fase: f.chave })}>
              <strong style={{ fontWeight: 600 }}>2ª fase</strong> — {f.rotulo}
            </Opcao>
          ))}
        </div>
        <Dica>
          Na 2ª fase, por enquanto o app tem só as questões discursivas de Direito Civil.
          Dá para trocar de fase quando quiser, no seletor do topo do menu.
        </Dica>
      </Grupo>
    </div>
  );
}

export function PassoProva({ theme, r, set, idBase = 'ficha', hoje = new Date() }) {
  const min = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Grupo>
        <Pergunta>Quando é a sua prova?</Pergunta>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label htmlFor={`${idBase}-data`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Data da prova
          </label>
          <input
            id={`${idBase}-data`}
            data-testid="ficha-data-prova"
            type="date"
            min={min}
            style={{ ...estiloCampo, width: 'auto', minWidth: 180, flex: '1 1 180px', opacity: r.dataIndefinida ? 0.5 : 1 }}
            value={r.dataIndefinida ? '' : r.dataProva}
            disabled={r.dataIndefinida}
            onChange={(e) => set({ dataProva: e.target.value, dataIndefinida: false })}
          />
          <div style={{ flex: '1 1 160px' }}>
            <Opcao
              theme={theme}
              tipo="checkbox"
              compacta
              testid="ficha-data-nao-sei"
              marcada={r.dataIndefinida}
              onChange={(e) => set({ dataIndefinida: e.target.checked })}
            >
              Ainda não sei
            </Opcao>
          </div>
        </div>
        <Dica>A contagem regressiva do topo usa esta data. Dá para mudar depois, nas Configurações.</Dica>
      </Grupo>

      <Grupo>
        <Pergunta>Você já fez o Exame de Ordem antes?</Pergunta>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {JA_FEZ.map((j) => (
            <Opcao key={j.chave} theme={theme} nome={`${idBase}-ja-fez`} testid={`ficha-ja-fez-${j.chave}`} marcada={r.jaFez === j.chave} onChange={() => set({ jaFez: j.chave })}>
              {j.rotulo}
            </Opcao>
          ))}
        </div>
      </Grupo>
    </div>
  );
}

export function PassoRotina({ theme, r, set, idBase = 'ficha' }) {
  const sugestao = metaSugerida(r.minutosPorDia);
  const alternarDia = (dia, marcado) => {
    const dias = new Set(r.diasDaSemana);
    if (marcado) dias.add(dia); else dias.delete(dia);
    set({ diasDaSemana: [...dias] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Grupo>
        <Pergunta>Em quais dias da semana você estuda?</Pergunta>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8 }}>
          {DIAS_DA_SEMANA.map((d) => (
            <Opcao
              key={d.dia}
              theme={theme}
              tipo="checkbox"
              compacta
              testid={`ficha-dia-${d.dia}`}
              marcada={r.diasDaSemana.includes(d.dia)}
              onChange={(e) => alternarDia(d.dia, e.target.checked)}
            >
              <span aria-hidden="true">{d.curto}</span>
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{d.nome}</span>
            </Opcao>
          ))}
        </div>
      </Grupo>

      <Grupo>
        <Pergunta>Quanto tempo por dia?</Pergunta>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {TEMPOS_POR_DIA.map((t) => (
            <Opcao
              key={t.minutos}
              theme={theme}
              nome={`${idBase}-tempo`}
              compacta
              testid={`ficha-tempo-${t.minutos}`}
              marcada={r.minutosPorDia === t.minutos}
              onChange={() => set(escolherTempo(r, t.minutos))}
            >
              {t.rotulo}
            </Opcao>
          ))}
        </div>
      </Grupo>

      <div>
        <label htmlFor={`${idBase}-meta`} style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: cor.texto, marginBottom: 8 }}>
          Meta diária de questões
        </label>
        <input
          id={`${idBase}-meta`}
          data-testid="ficha-meta"
          type="number"
          inputMode="numeric"
          min="1"
          max={META_MAXIMA}
          aria-describedby={`${idBase}-meta-conta`}
          style={{ ...estiloCampo, maxWidth: 160 }}
          value={r.meta}
          onChange={(e) => set({ meta: e.target.value })}
        />
        <Dica id={`${idBase}-meta-conta`}>
          {sugestao != null ? (
            <span data-testid="ficha-meta-conta">
              Sugestão: {rotuloDoTempo(r.minutosPorDia).replace(' ou mais', '')} por dia ÷ ~{MINUTOS_POR_QUESTAO} min por questão
              objetiva (ler, responder e conferir o comentário) ≈ <strong style={{ color: theme.primaryDark }}>{sugestao} questões</strong> nos
              dias de estudo. Pode ajustar.
            </span>
          ) : (
            `Escolha o tempo por dia e a gente sugere uma meta (~${MINUTOS_POR_QUESTAO} min por questão objetiva).`
          )}
        </Dica>
      </div>
    </div>
  );
}

export function PassoDificuldades({ theme, r, set, opcoes = [], acervoCarregando = false }) {
  const alternar = (nome, marcado) => {
    const lista = new Set(r.dificuldades);
    if (marcado) lista.add(nome); else lista.delete(nome);
    set({ dificuldades: [...lista], dificuldadesIndefinidas: false });
  };

  return (
    <Grupo>
      <Pergunta>Em quais matérias você tem mais dificuldade?</Pergunta>
      <div style={{ fontSize: 12.5, color: cor.suave, marginTop: -4, marginBottom: 12, lineHeight: 1.5 }}>
        Marque quantas quiser. Enquanto você ainda não respondeu questões delas, o
        Cronograma e o &quot;Próximo passo&quot; começam por elas.
        {acervoCarregando && ' (A lista é a das matérias da 1ª fase; o acervo ainda está carregando.)'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
        {opcoes.map((nome) => (
          <Opcao
            key={nome}
            theme={theme}
            tipo="checkbox"
            compacta
            testid="ficha-dificuldade"
            marcada={!r.dificuldadesIndefinidas && r.dificuldades.includes(nome)}
            onChange={(e) => alternar(nome, e.target.checked)}
          >
            {nome}
          </Opcao>
        ))}
      </div>
      <div style={{ marginTop: 12, maxWidth: 260 }}>
        <Opcao
          theme={theme}
          tipo="checkbox"
          compacta
          testid="ficha-dificuldade-nao-sei"
          marcada={r.dificuldadesIndefinidas}
          onChange={(e) => set({ dificuldadesIndefinidas: e.target.checked, dificuldades: e.target.checked ? [] : r.dificuldades })}
        >
          Ainda não sei
        </Opcao>
      </div>
    </Grupo>
  );
}

/** O resumo das respostas: tela final da ficha e "Meu perfil de estudo". */
export function ResumoDaFicha({ nome, preferencias }) {
  const f = preferencias?.ficha || {};
  const linhas = [
    ['Nome', nome || '—'],
    ['Fase', rotuloDaFase(f.fase)],
    ['Data da prova', formatarData(preferencias?.dataProva)],
    ['Já fez o Exame', rotuloJaFez(f.jaFez)],
    ['Dias de estudo', rotuloDosDias(f.diasDaSemana)],
    ['Tempo por dia', rotuloDoTempo(f.minutosPorDia)],
    ['Meta diária', preferencias?.meta != null ? `${preferencias.meta} questões` : '—'],
    ['Pontos fracos', f.dificuldades?.length ? f.dificuldades.join(', ') : 'Ainda não sei'],
  ];
  return (
    <dl data-testid="resumo-ficha" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', gap: '8px 16px', margin: 0, fontSize: 13.5 }}>
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} style={{ display: 'contents' }}>
          <dt style={{ color: cor.suave }}>{rotulo}</dt>
          <dd style={{ margin: 0, color: cor.texto, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}
