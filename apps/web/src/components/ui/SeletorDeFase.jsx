import { Icon } from '../../lib/icons';
import { FASES } from '../../lib/navegacao';

// O topo da barra lateral: a marca e a escolha entre a 1ª fase (o app de
// questões objetivas) e as áreas da 2ª fase.
//
// <select> nativo com <optgroup>, como o do eproc que a cliente pediu, e não
// um menu desenhado à mão: teclado (setas, Enter, digitar a letra), leitor de
// tela e a roda de opções do celular vêm prontos do navegador.
//
// A marca encolheu para caber em cima do seletor: com os dois lado a lado,
// "Questões objetivas" não cabia nos 232px da barra e aparecia cortado.
export default function SeletorDeFase({ theme, s, fase, onTrocar, compacto = false }) {
  const grupos = [...new Set(FASES.map((f) => f.grupo))];

  return (
    <div style={{ padding: compacto ? 0 : '2px 6px 12px', flex: compacto ? 1 : 'none', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ ...s.logoMark, width: 26, height: 26, borderRadius: 8 }} aria-hidden="true">
          <Icon name="scale" color="#ffffff" size={15} />
        </div>
        <div style={{ ...s.logoText, fontSize: 17 }}>ma.</div>
        <div aria-hidden="true" style={{ ...s.logoSub, fontSize: 10, letterSpacing: '1.5px', marginLeft: 'auto' }}>
          {fase.grupo}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <select
          data-testid="seletor-fase"
          aria-label="Fase da prova"
          value={fase.chave}
          onChange={(e) => onTrocar(e.target.value)}
          style={{
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            width: '100%', background: theme.primarySoft, color: theme.primaryDark,
            border: `1px solid ${theme.primarySoft}`, borderRadius: 10,
            padding: '8px 30px 8px 11px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            textOverflow: 'ellipsis',
          }}
        >
          {grupos.map((grupo) => (
            <optgroup key={grupo} label={grupo.toUpperCase()}>
              {FASES.filter((f) => f.grupo === grupo).map((f) => (
                <option key={f.chave} value={f.chave}>{f.rotulo}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <Icon
          name="chevron-down"
          color={theme.primaryDark}
          size={16}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}
