import { useState } from 'react';
import { Icon } from '../lib/icons';
import { login, criarConta } from '../lib/api';

// Entrar e criar conta na mesma tela, alternados por um botão. Duas telas
// separadas custariam rota, estado de navegação e um caminho de volta — para
// dois formulários que diferem em dois campos.
//
// Continua sem "esqueci a senha": ele exige e-mail transacional, que esta
// plataforma não tem. Enquanto não existir, a confirmação de senha no cadastro
// é o que impede alguém de ficar trancado para fora por um erro de digitação.
export default function Login({ theme, s, onEntrar }) {
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const criando = modo === 'criar';

  const trocarModo = () => {
    setModo(criando ? 'entrar' : 'criar');
    // O erro é sempre sobre o formulário que acabou de sair de cena; mantê-lo
    // faria "este e-mail já tem conta" aparecer sobre a tela de entrar, onde
    // ele não faz sentido nenhum.
    setErro(null);
    setConfirmacao('');
  };

  const submeter = async (e) => {
    e.preventDefault();
    if (enviando) return;

    // Comparação antes de sair do navegador: o servidor não recebe a
    // confirmação e não teria como recusar por isso.
    if (criando && senha !== confirmacao) {
      setErro('As senhas não são iguais.');
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      const usuario = criando
        ? await criarConta({ nome: nome.trim(), email: email.trim(), password: senha })
        : await login(email.trim(), senha);
      onEntrar(usuario);
    } catch (err) {
      // 409 é o único erro aqui com um próximo passo óbvio, então ele ganha
      // uma mensagem que aponta o caminho em vez de só constatar o problema.
      setErro(
        err.status === 409
          ? 'Este e-mail já tem conta. Use "Entrar" logo abaixo.'
          : err.message
      );
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

  const rotulo = { ...s.statLabel, display: 'block', marginBottom: 5 };

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

        <div style={{ ...s.sectionTitle, marginBottom: 4 }}>
          {criando ? 'Criar conta' : 'Entrar'}
        </div>
        <div style={{ ...s.pageSub, marginBottom: 18 }}>
          Suas respostas ficam guardadas na sua conta.
        </div>

        {criando && (
          <>
            <label style={rotulo} htmlFor="campo-nome">
              Nome
            </label>
            <input
              id="campo-nome"
              data-testid="campo-nome"
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              placeholder="Como quer ser chamada"
              style={{ ...campo, marginBottom: 13 }}
            />
          </>
        )}

        <label style={rotulo} htmlFor="campo-email">
          E-mail
        </label>
        <input
          id="campo-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={{ ...campo, marginBottom: 13 }}
        />

        <label style={rotulo} htmlFor="campo-senha">
          Senha
        </label>
        <input
          id="campo-senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          // O gerenciador de senhas do navegador se comporta de formas
          // diferentes nos dois casos: oferecer a senha salva ao entrar,
          // propor uma nova ao cadastrar.
          autoComplete={criando ? 'new-password' : 'current-password'}
          required
          minLength={criando ? 8 : undefined}
          style={{ ...campo, marginBottom: criando ? 13 : 18 }}
        />

        {criando && (
          <>
            <label style={rotulo} htmlFor="campo-confirmacao">
              Repita a senha
            </label>
            <input
              id="campo-confirmacao"
              data-testid="campo-confirmacao"
              type="password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="new-password"
              required
              style={{ ...campo, marginBottom: 18 }}
            />
          </>
        )}

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
          {enviando
            ? criando
              ? 'Criando…'
              : 'Entrando…'
            : criando
              ? 'Criar conta'
              : 'Entrar'}
        </button>

        <div style={{ ...s.pageSub, textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
          {criando ? 'Já tem conta?' : 'Primeira vez por aqui?'}{' '}
          {/* type="button" é obrigatório: dentro de um <form>, um botão sem
              type é submit, e alternar o modo enviaria o formulário. */}
          <button
            type="button"
            data-testid="trocar-modo"
            onClick={trocarModo}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              color: theme.primary,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {criando ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </form>
    </div>
  );
}
