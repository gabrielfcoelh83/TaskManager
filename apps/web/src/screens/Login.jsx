import { useState } from 'react';
import { Icon } from '../lib/icons';
import {
  login, criarConta, entrarComGoogle, solicitarRedefinicaoSenha, redefinirSenha,
} from '../lib/api/api';
import BotaoGoogle from '../components/ui/BotaoGoogle';

// Entrar e criar conta na mesma tela, alternados por um botão. Duas telas
// separadas custariam rota, estado de navegação e um caminho de volta — para
// dois formulários que diferem em dois campos.
//
export default function Login({ theme, s, onEntrar }) {
  const parametros = new URLSearchParams(window.location.search);
  const tokenRedefinicao = parametros.get('token') || '';
  const caminhoRedefinicao = window.location.pathname === '/reset-password';
  const [modo, setModo] = useState(caminhoRedefinicao ? 'redefinir' : 'entrar'); // entrar | criar | esqueci | redefinir
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mensagem, setMensagem] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const criando = modo === 'criar';
  const esquecendo = modo === 'esqueci';
  const redefinindo = modo === 'redefinir';

  const trocarModo = () => {
    setModo(criando ? 'entrar' : 'criar');
    // O erro é sempre sobre o formulário que acabou de sair de cena; mantê-lo
    // faria "este e-mail já tem conta" aparecer sobre a tela de entrar, onde
    // ele não faz sentido nenhum.
    setErro(null);
    setMensagem(null);
    setConfirmacao('');
  };

  const submeter = async (e) => {
    e.preventDefault();
    if (enviando) return;

    // Comparação antes de sair do navegador: o servidor não recebe a
    // confirmação e não teria como recusar por isso.
    if ((criando || redefinindo) && senha !== confirmacao) {
      setErro('As senhas não são iguais.');
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      if (esquecendo) {
        await solicitarRedefinicaoSenha(email.trim());
        setMensagem('Se existir uma conta com esse e-mail, enviaremos as instruções para redefinir a senha.');
        setEnviando(false);
        return;
      }
      if (redefinindo) {
        await redefinirSenha(tokenRedefinicao, senha);
        window.history.replaceState({}, '', '/');
        setModo('entrar');
        setSenha('');
        setConfirmacao('');
        setMensagem('Senha redefinida. Você já pode entrar com a nova senha.');
        setEnviando(false);
        return;
      }
      const usuario = criando
        ? await criarConta({ nome: nome.trim(), email: email.trim(), password: senha })
        : await login(email.trim(), senha);
      if (criando && usuario.confirmacaoPendente) {
        setMensagem('Conta criada. Confirme o link enviado ao seu e-mail antes de entrar.');
        setModo('entrar');
        setEnviando(false);
        return;
      }
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

  // O Google já escolheu a conta; falta o auth-service conferir o token.
  // Mesmo tratamento de erro do formulário, para a mensagem aparecer no mesmo
  // lugar.
  const entrarGoogle = async (credential) => {
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      onEntrar(await entrarComGoogle(credential));
    } catch (err) {
      setErro(
        err.status === 503
          ? 'O login com o Google ainda não está disponível. Use e-mail e senha.'
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
    color: '#1c1b19',
    background: '#fff',
    outlineColor: theme.primary,
  };

  const rotulo = { ...s.statLabel, display: 'block', marginBottom: 5 };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: theme.bg }}>
      {/* Painel editorial: diz o que o produto é antes de pedir a senha. Some
          em tela estreita (classe do Tailwind, porque estilo inline não tem
          media query), onde o formulário sozinho já ocupa a tela. */}
      <aside
        className="hidden lg:flex"
        style={{ flex: '0 0 46%', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 56px', background: theme.primaryDark, color: '#f4efe8' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="scale" color="#f4efe8" size={20} />
          <span style={{ ...s.logoText, color: '#f4efe8' }}>ma.</span>
          <span style={{ ...s.logoSub, color: 'rgba(244,239,232,.6)' }}>questões</span>
        </div>
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontFamily: s.pageTitle.fontFamily, fontSize: 40, lineHeight: 1.12, letterSpacing: '-0.02em', fontWeight: 400 }}>
            As questões que a FGV cobra, com o gabarito que a FGV publicou.
          </div>
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 0, borderTop: '1px solid rgba(244,239,232,.18)' }}>
            {[
              ['Acervo', 'Questões dos Exames de Ordem, prova a prova'],
              ['Revisão', 'O que você errou volta até você acertar'],
              ['Simulados', 'Tempo e formato da prova real'],
            ].map(([t, d]) => (
              <div key={t} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid rgba(244,239,232,.18)', fontSize: 13.5 }}>
                <span style={{ width: 84, flex: 'none', color: 'rgba(244,239,232,.6)' }}>{t}</span>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(244,239,232,.55)' }}>Exame de Ordem Unificado · 1ª e 2ª fase</div>
      </aside>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submeter} style={{ width: 360, maxWidth: '100%' }}>
        <div className="flex lg:hidden" style={{ alignItems: 'center', gap: 9, marginBottom: 20 }}>
          <div style={s.logoMark}>
            <Icon name="scale" color="#ffffff" size={17} />
          </div>
          <div>
            <div style={s.logoText}>ma.</div>
            <div style={s.logoSub}>questões</div>
          </div>
        </div>

        <div style={{ ...s.pageTitle, fontSize: 26, marginBottom: 6 }}>
          {criando ? 'Criar conta' : esquecendo ? 'Recuperar senha' : redefinindo ? 'Criar nova senha' : 'Entrar'}
        </div>
        <div style={{ ...s.pageSub, marginBottom: 18 }}>
          {esquecendo
            ? 'Informe seu e-mail e enviaremos um link seguro.'
            : redefinindo
              ? 'Escolha uma nova senha para sua conta.'
              : 'Suas respostas ficam guardadas na sua conta.'}
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
              placeholder="Como quer ser chamado(a)"
              style={{ ...campo, marginBottom: 13 }}
            />
          </>
        )}

        {!redefinindo && <label style={rotulo} htmlFor="campo-email">
          E-mail
        </label>}
        {!redefinindo && <input
          id="campo-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          style={{ ...campo, marginBottom: 13 }}
        />}

        {!esquecendo && <label style={rotulo} htmlFor="campo-senha">
          Senha
        </label>}
        {!esquecendo && <input
          id="campo-senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          // O gerenciador de senhas do navegador se comporta de formas
          // diferentes nos dois casos: oferecer a senha salva ao entrar,
          // propor uma nova ao cadastrar.
          autoComplete={criando || redefinindo ? 'new-password' : 'current-password'}
          required
          minLength={criando || redefinindo ? 8 : undefined}
          style={{ ...campo, marginBottom: criando || redefinindo ? 13 : 18 }}
        />}

        {(criando || redefinindo) && (
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
              background: '#FAF0EE',
              color: '#8F2F29',
              border: '1px solid #EBCBC6',
              borderRadius: 10,
              padding: '9px 12px',
              fontSize: 12.5,
              marginBottom: 14,
            }}
          >
            {erro}
          </div>
        )}
        {mensagem && (
          <div role="status" style={{ background: '#EEF7F0', color: '#24613A', border: '1px solid #C7E2CD', borderRadius: 10, padding: '9px 12px', fontSize: 12.5, marginBottom: 14 }}>
            {mensagem}
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
            ? esquecendo
              ? 'Enviando…'
              : redefinindo
                ? 'Salvando…'
                : criando
              ? 'Criando…'
              : 'Entrando…'
            : esquecendo
              ? 'Enviar link'
              : redefinindo
                ? 'Salvar nova senha'
                : criando
                  ? 'Criar conta'
                  : 'Entrar'}
        </button>

        {/* Serve para entrar e para criar conta: na primeira vez, o
            auth-service cria a conta com o nome e o e-mail do Google. */}
        {!esquecendo && !redefinindo && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...s.pageSub, textAlign: 'center', fontSize: 12, marginBottom: 10 }}>ou</div>
            <BotaoGoogle onCredencial={entrarGoogle} />
          </div>
        )}

        {!redefinindo && <div style={{ ...s.pageSub, textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
          {criando ? 'Já tem conta?' : esquecendo ? 'Lembrou a senha?' : 'Primeira vez por aqui?'}{' '}
          {/* type="button" é obrigatório: dentro de um <form>, um botão sem
              type é submit, e alternar o modo enviaria o formulário. */}
          <button
            type="button"
            data-testid="trocar-modo"
            onClick={() => { setModo(esquecendo ? 'entrar' : criando ? 'entrar' : 'criar'); setErro(null); setMensagem(null); }}
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
            {criando || esquecendo ? 'Entrar' : esquecendo ? 'Entrar' : 'Criar conta'}
          </button>
        </div>}
        {!criando && !esquecendo && !redefinindo && (
          <button type="button" onClick={() => { setModo('esqueci'); setErro(null); setMensagem(null); }} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', padding: 0, font: 'inherit', color: theme.primary, fontSize: 12.5, cursor: 'pointer' }}>
            Esqueci minha senha
          </button>
        )}
      </form>
      </div>
    </div>
  );
}
