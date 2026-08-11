import { useState } from 'react';
import { Icon } from '../lib/icons';
import { login } from '../lib/api';

// Tela mínima de propósito: sem cadastro, sem "esqueci a senha", sem lembrar
// de mim. O que ela precisa provar é que existe um token de verdade por trás
// das tentativas — o resto do fluxo de conta é problema de outra fatia.
export default function Login({ theme, s, onEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const submeter = async (e) => {
    e.preventDefault();
    if (enviando) return;

    setErro(null);
    setEnviando(true);
    try {
      const usuario = await login(email.trim(), senha);
      onEntrar(usuario);
    } catch (err) {
      // A mensagem vem do auth-service ("Credenciais inválidas") ou do
      // cliente, quando nem chegou a sair do navegador.
      setErro(err.message);
      setEnviando(false);
    }
  };

  const campo = {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(0,0,0,.1)',
    borderRadius: 10,
    padding: '11px 13px',
    fontSize: 13.5,
    color: '#2c2530',
    background: '#fff',
    outlineColor: theme.primary,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100%',
        background: theme.bg,
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <form onSubmit={submeter} style={{ ...s.card, width: 360, maxWidth: '100%', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 20 }}>
          <div style={s.logoMark}>
            <Icon name="scale" color="#ffffff" size={17} />
          </div>
          <div>
            <div style={s.logoText}>ma.</div>
            <div style={s.logoSub}>questões</div>
          </div>
        </div>

        <div style={{ ...s.sectionTitle, marginBottom: 4 }}>Entrar</div>
        <div style={{ ...s.pageSub, marginBottom: 18 }}>
          Suas respostas ficam guardadas na sua conta.
        </div>

        <label style={{ ...s.statLabel, display: 'block', marginBottom: 5 }}>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={{ ...campo, marginBottom: 13 }}
        />

        <label style={{ ...s.statLabel, display: 'block', marginBottom: 5 }}>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          required
          style={{ ...campo, marginBottom: 18 }}
        />

        {erro && (
          <div
            role="alert"
            style={{
              background: '#FEF2F2',
              color: '#B91C1C',
              border: '1px solid #FECACA',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: 12.5,
              marginBottom: 14,
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            ...s.btnPrimary,
            width: '100%',
            justifyContent: 'center',
            padding: '11px 18px',
            fontSize: 13.5,
            opacity: enviando ? 0.7 : 1,
          }}
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
