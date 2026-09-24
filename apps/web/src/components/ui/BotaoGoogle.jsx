import { useEffect, useRef, useState } from 'react';

// "Fazer login com o Google", pelo Google Identity Services.
//
// A biblioteca antiga (`platform.js`, "Google Sign-In for Websites") foi
// descontinuada pelo Google e não aceita projetos novos; esta é a que a
// substitui. O botão é desenhado pelo próprio Google — as regras de marca
// dele exigem isso — e, quando a pessoa escolhe a conta, o Google entrega um
// ID token (`credential`). Quem confere esse token é o auth-service, nunca o
// navegador: aqui ele só é repassado.
//
// Sem VITE_GOOGLE_CLIENT_ID no build o componente não desenha nada, e o
// script do Google nem é carregado. É o que deixa o código ir para produção
// antes de o Client ID existir.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCRIPT = 'https://accounts.google.com/gsi/client';

// Uma carga só por página, mesmo que o Login monte e desmonte várias vezes.
let carregando = null;
function carregarScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!carregando) {
    carregando = new Promise((resolver, rejeitar) => {
      const tag = document.createElement('script');
      tag.src = SCRIPT;
      tag.async = true;
      tag.defer = true;
      tag.onload = () => resolver();
      tag.onerror = () => {
        carregando = null; // deixa tentar de novo na próxima montagem
        rejeitar(new Error('script do Google não carregou'));
      };
      document.head.appendChild(tag);
    });
  }
  return carregando;
}

export default function BotaoGoogle({ onCredencial, largura = 320 }) {
  const lugar = useRef(null);
  const [falhou, setFalhou] = useState(false);

  // O callback muda a cada render do Login; o Google guarda o que recebeu no
  // `initialize`. A ref faz o Google sempre chamar o mais novo.
  const aoReceber = useRef(onCredencial);
  aoReceber.current = onCredencial;

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let ativo = true;

    carregarScript()
      .then(() => {
        if (!ativo || !lugar.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resposta) => aoReceber.current(resposta.credential),
          // Sem o "One Tap" automático: o login acontece quando a pessoa
          // clica, como no resto da tela.
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(lugar.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          locale: 'pt-BR',
          width: largura,
        });
      })
      .catch(() => { if (ativo) setFalhou(true); });

    return () => { ativo = false; };
  }, [largura]);

  if (!CLIENT_ID) return null;

  // Bloqueador de script ou rede fora: o login por e-mail continua ali, e
  // um aviso curto evita um espaço vazio sem explicação.
  if (falhou) {
    return (
      <div style={{ fontSize: 12, color: '#8b8391', textAlign: 'center' }}>
        O login com o Google não carregou. Use e-mail e senha.
      </div>
    );
  }

  return <div ref={lugar} data-testid="login-google" style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />;
}
