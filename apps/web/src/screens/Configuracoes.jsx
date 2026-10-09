import { useEffect, useState } from 'react';
import { THEMES, THEME_NAMES, THEME_DESCRICOES, SOMBRA, SOMBRA_ALTA } from '../lib/theme';
import { diasAteProva } from '../lib/metrics';
import { Icon } from '../lib/icons';
import MeuPerfilDeEstudo from '../components/ui/MeuPerfilDeEstudo';

// Esta tela editava um nome e um e-mail que só existiam no localStorage —
// "Maria Laís / maria.lais@email.com" — e três interruptores de notificação
// ("Lembrete diário", "Novidades", "E-mails promocionais") que não ligavam
// coisa nenhuma: não há serviço de e-mail neste projeto.
//
// Agora o nome vai para o user-service, a meta e a data da prova viajam na
// coluna `profile_data` (as duas mudam o app inteiro: meta alimenta o
// dashboard e o cronograma, a data alimenta a contagem do topo), e o que não
// existe deixou de ser oferecido.

export default function Configuracoes({
  theme, s, config, atualizarConfig, perfil, nome, atualizarNome, themeKey, setTheme,
  salvarFicha, fase, opcoesDeDificuldade, acervoCarregando, ancora, ancoraUsada,
}) {
  const [nomeLocal, setNomeLocal] = useState(nome || '');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // O perfil chega depois do primeiro render: sem isto o campo ficaria vazio
  // até a pessoa digitar algo.
  useEffect(() => { setNomeLocal(nome || ''); }, [nome]);

  // Quem chega pelo "Ajustar plano" do Cronograma quer os dias e o tempo de
  // estudo, que ficam em "Meu perfil de estudo", no meio da tela: rola até
  // lá e leva o foco ao título (leitor de tela anuncia onde a pessoa caiu).
  useEffect(() => {
    if (ancora !== 'meu-perfil-de-estudo') return;
    const alvo = document.querySelector('[data-testid="meu-perfil-de-estudo"]');
    // Perfil ainda carregando: a seção não existe. Guarda a âncora e tenta de
    // novo quando o perfil chegar.
    if (!alvo) return;
    alvo.scrollIntoView({ block: 'start' });
    document.getElementById('meu-perfil-titulo')?.focus({ preventScroll: true });
    ancoraUsada?.();
  }, [ancora, ancoraUsada, perfil]);

  const label = { fontSize: 12, color: '#7a766f', marginBottom: 5 };
  const input = { width: '100%', fontSize: 13.5, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '9px 12px', color: '#1c1b19', fontFamily: 'inherit' };

  const salvarNome = async () => {
    setSalvando(true);
    setSalvo(false);
    const ok = await atualizarNome(nomeLocal);
    setSalvando(false);
    setSalvo(ok);
  };

  const faltam = diasAteProva(config);
  const nomeMudou = (nomeLocal || '').trim() !== (nome || '').trim();

  return (
    <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.card}>
        <div style={s.sectionTitle}>Perfil</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <div style={label}>Nome</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                data-testid="campo-nome-perfil"
                style={input}
                value={nomeLocal}
                onChange={(e) => { setNomeLocal(e.target.value); setSalvo(false); }}
                placeholder="Como você quer ser chamado(a)"
              />
              <button
                data-testid="salvar-nome"
                onClick={salvarNome}
                disabled={salvando || !nomeMudou || !nomeLocal.trim()}
                style={{ ...s.btnPrimary, flex: 'none', opacity: salvando || !nomeMudou || !nomeLocal.trim() ? 0.5 : 1 }}
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
            {salvo && <div style={{ fontSize: 11.5, color: '#355E35', marginTop: 6 }}>Nome salvo no servidor.</div>}
            {perfil?.estado === 'erro' && (
              <div style={{ fontSize: 11.5, color: '#94661A', marginTop: 6 }}>
                Não foi possível carregar seu perfil agora — o app segue funcionando, mas o nome pode estar desatualizado.
              </div>
            )}
          </div>

          <div>
            <div style={label}>E-mail</div>
            <input style={{ ...input, background: '#faf9f6', color: '#7a766f' }} value={perfil?.email || ''} readOnly />
            {/* Editar aqui mudaria só o cadastro do user-service; o login
                continua sendo o e-mail guardado pelo auth-service. Um campo
                editável prometeria uma troca de e-mail que não acontece. */}
            <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 6 }}>
              É o e-mail com que você entra. Trocá-lo ainda não é possível por aqui.
            </div>
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Seu estudo</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div>
            <div style={label}>Meta diária de questões</div>
            <input
              data-testid="campo-meta"
              style={input}
              type="number"
              min="1"
              max="500"
              value={config.meta}
              onChange={(e) => {
                const n = Number(e.target.value);
                atualizarConfig({ meta: Number.isFinite(n) && n > 0 ? Math.min(500, Math.round(n)) : 1 });
              }}
            />
            <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 6 }}>
              É o denominador de “meta de hoje” no dashboard e no cronograma.
            </div>
          </div>

          <div>
            <div style={label}>Data da sua prova</div>
            <input
              data-testid="campo-data-prova"
              style={input}
              type="date"
              value={config.dataProva || ''}
              onChange={(e) => atualizarConfig({ dataProva: e.target.value || null })}
            />
            <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 6 }}>
              {faltam != null
                ? `A contagem no topo mostra ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
                : 'Sem data definida, o topo não conta os dias.'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#7a766f', marginTop: 14, lineHeight: 1.5 }}>
          Meta e data ficam salvas na sua conta, então seguem você em qualquer aparelho.
        </div>
      </div>

      <MeuPerfilDeEstudo
        theme={theme}
        s={s}
        perfil={perfil}
        config={config}
        fase={fase}
        salvarFicha={salvarFicha}
        opcoesDeDificuldade={opcoesDeDificuldade}
        acervoCarregando={acervoCarregando}
      />

      <div style={s.card}>
        <div style={s.sectionTitle}>Aparência</div>
        <div style={{ fontSize: 12.5, color: '#7a766f', marginTop: 4 }}>
          Escolha a paleta de cores. Fica guardada neste navegador.
        </div>
        {/* Cada opção é uma miniatura do app na paleta: barra lateral, título,
            botão e acento. Ver a paleta aplicada decide melhor que uma bolinha. */}
        <div role="radiogroup" aria-label="Paleta de cores" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 12, marginTop: 16 }}>
          {Object.keys(THEMES).map((key) => {
            const t = THEMES[key];
            const active = themeKey === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`tema-${key}`}
                onClick={() => setTheme(key)}
                style={{
                  textAlign: 'left', padding: 6, borderRadius: 12, border: 'none', background: '#fff', cursor: 'pointer',
                  boxShadow: active ? `0 0 0 2px ${t.primary}, ${SOMBRA_ALTA}` : SOMBRA,
                  transition: 'box-shadow 200ms ease',
                }}
              >
                <div aria-hidden="true" style={{ display: 'flex', height: 64, borderRadius: 6, overflow: 'hidden', background: t.bg }}>
                  <div style={{ width: 30, background: t.bg, borderRight: '1px solid rgba(28,27,25,.07)', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: t.primary }} />
                    <div style={{ height: 4, borderRadius: 2, background: t.primarySoft, marginTop: 4 }} />
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(28,27,25,.08)' }} />
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(28,27,25,.08)' }} />
                  </div>
                  <div style={{ flex: 1, padding: '9px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ width: '60%', height: 6, borderRadius: 2, background: '#1c1b19', opacity: 0.75 }} />
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 'auto' }}>
                      <div style={{ flex: 1, height: 16, borderRadius: 3, background: '#fff', boxShadow: '0 0 0 1px rgba(28,27,25,.06)' }} />
                      <div style={{ width: 26, height: 12, borderRadius: 3, background: t.primary }} />
                    </div>
                    <div style={{ width: '40%', height: 3, borderRadius: 2, background: t.accent }} />
                  </div>
                </div>
                <div style={{ padding: '8px 6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1b19' }}>{THEME_NAMES[key]}</span>
                  {active && <Icon name="circle-check" color={t.primary} size={16} />}
                </div>
                <div style={{ padding: '0 6px 4px', fontSize: 11.5, color: '#7a766f', lineHeight: 1.35 }}>{THEME_DESCRICOES[key]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Avisos</div>
        <div style={{ fontSize: 12.5, color: '#7a766f', marginTop: 8, lineHeight: 1.6 }}>
          O sino no topo mostra o que está pendente agora: meta do dia, questões
          erradas esperando revisão e a contagem para a prova. São calculados na
          hora, a partir do seu histórico.
          <br /><br />
          Não há envio de e-mail nem notificação por push neste app — se um dia
          houver, o controle aparece aqui.
        </div>
      </div>
    </div>
  );
}
