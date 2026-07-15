import { THEMES, THEME_NAMES } from '../lib/theme';

const NOTIF_LABELS = ['Lembrete diário de estudo', 'Novidades e atualizações', 'E-mails promocionais'];

export default function Configuracoes({ s, theme, config, setConfig, themeKey, setTheme }) {
  const label = { fontSize: 12, color: '#8b8391', marginBottom: 5 };
  const input = { width: '100%', fontSize: 13.5, border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, padding: '9px 12px', color: '#2c2530' };

  const toggleNotif = (i) => {
    const next = [...config.notif];
    next[i] = !next[i];
    setConfig({ notif: next });
  };

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.card}>
        <div style={s.sectionTitle}>Perfil</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <div><div style={label}>Nome</div><input style={input} value={config.name} onChange={(e) => setConfig({ name: e.target.value })} /></div>
          <div><div style={label}>E-mail</div><input style={input} value={config.email} onChange={(e) => setConfig({ email: e.target.value })} /></div>
          <div><div style={label}>Meta diária de questões</div><input style={input} type="number" value={config.meta} onChange={(e) => setConfig({ meta: e.target.value })} /></div>
        </div>
      </div>

      <div style={s.card}>
        <div style={s.sectionTitle}>Aparência</div>
        <div style={{ fontSize: 12.5, color: '#8b8391', marginTop: 4 }}>Escolha a paleta de cores do aplicativo.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
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
        <div style={s.sectionTitle}>Notificações</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {NOTIF_LABELS.map((lbl, i) => {
            const on = config.notif[i];
            return (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13.5, color: '#2c2530' }}>{lbl}</div>
                <div
                  onClick={() => toggleNotif(i)}
                  style={{ width: 40, height: 22, borderRadius: 11, background: on ? theme.primary : '#e5e2ea', position: 'relative', cursor: 'pointer', transition: 'background .15s' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: on ? 20 : 2, transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
