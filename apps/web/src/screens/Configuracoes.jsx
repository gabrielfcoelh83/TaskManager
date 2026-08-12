import { useEffect, useState } from 'react';
import { THEMES, THEME_NAMES } from '../lib/theme';
import { diasAteProva } from '../lib/metrics';

// Esta tela editava um nome e um e-mail que só existiam no localStorage —
// "Maria Laís / maria.lais@email.com" — e três interruptores de notificação
// ("Lembrete diário", "Novidades", "E-mails promocionais") que não ligavam
// coisa nenhuma: não há serviço de e-mail neste projeto.
//
// Agora o nome vai para o user-service, a meta e a data da prova viajam na
// coluna `profile_data` (as duas mudam o app inteiro: meta alimenta o
// dashboard e o cronograma, a data alimenta a contagem do topo), e o que não
// existe deixou de ser oferecido.

export default function Configuracoes({ s, config, atualizarConfig, perfil, nome, atualizarNome, themeKey, setTheme }) {
  const [nomeLocal, setNomeLocal] = useState(nome || '');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // O perfil chega depois do primeiro render: sem isto o campo ficaria vazio
  // até a pessoa digitar algo.
  useEffect(() => { setNomeLocal(nome || ''); }, [nome]);

  const label = { fontSize: 12, color: '#8b8391', marginBottom: 5 };
  const input = { width: '100%', fontSize: 13.5, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '9px 12px', color: '#2c2530', fontFamily: 'inherit' };

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
            {salvo && <div style={{ fontSize: 11.5, color: '#047857', marginTop: 6 }}>Nome salvo no servidor.</div>}
            {perfil?.estado === 'erro' && (
              <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 6 }}>
                Não foi possível carregar seu perfil agora — o app segue funcionando, mas o nome pode estar desatualizado.
              </div>
            )}
          </div>

          <div>
            <div style={label}>E-mail</div>
            <input style={{ ...input, background: '#faf9fb', color: '#8b8391' }} value={perfil?.email || ''} readOnly />
            {/* Editar aqui mudaria só o cadastro do user-service; o login
                continua sendo o e-mail guardado pelo auth-service. Um campo
                editável prometeria uma troca de e-mail que não acontece. */}
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 6 }}>
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
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 6 }}>
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
            <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 6 }}>
              {faltam != null
                ? `A contagem no topo mostra ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
                : 'Sem data definida, o topo não conta os dias.'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#8b8391', marginTop: 14, lineHeight: 1.5 }}>
          Meta e data ficam salvas na sua conta, então seguem você em qualquer aparelho.
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Aparência</div>
        <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 4 }}>
          Escolha a paleta de cores. Fica guardada neste navegador.
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {Object.keys(THEMES).map((key) => {
            const t = THEMES[key];
            const active = themeKey === key;
            return (
              <button
                key={key}
                onClick={() => setTheme(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12,
                  border: active ? `2px solid ${t.primary}` : '1px solid rgba(0,0,0,.1)',
                  background: active ? t.primarySoft : '#fff', fontSize: 13, fontWeight: 600, color: '#2c2530',
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: `linear-gradient(135deg, ${t.gradA}, ${t.gradB})`, display: 'inline-block' }} />
                {THEME_NAMES[key]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Avisos</div>
        <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 8, lineHeight: 1.6 }}>
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
