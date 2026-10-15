import { useState } from 'react';
import AgentDock from './agent-dock';
import KepyFace from './kepy-face';
import { ASSISTENTE } from '../../lib/assistente';
import { guiaDoDia, statusDoDia, responder, SUGESTOES } from '../../lib/kepy';

// O Kepy no canto da tela: liga o dock (agent-dock.jsx) ao que o app sabe
// do dia (lib/kepy.js). Tomou o lugar do cartão "Foco de hoje" da barra
// lateral, e acompanha todas as telas da 1ª fase.
//
// O ponto no rosto marca sugestão que a pessoa ainda não viu. A "sugestão" é
// o estado do dia (meta, matéria, se há erros); muda o estado, o ponto volta.
// Fica no localStorage só por conveniência — sem ele, o ponto aparece de
// novo, e é só isso.

const CHAVE_VISTO = 'ma.kepy.visto';

function lerVisto() {
  try { return window.localStorage.getItem(CHAVE_VISTO); } catch { return null; }
}
function gravarVisto(valor) {
  try { window.localStorage.setItem(CHAVE_VISTO, valor); } catch { /* sem armazenamento: o ponto só volta */ }
}

export default function Kepy({
  theme, meta, materia, foco, erros = 0, diasProva = null, temDataProva = true, sequenciaDias = 0, disciplinas = [],
  onEstudar, onIr,
}) {
  const [visto, setVisto] = useState(lerVisto);

  const ctx = { meta, materia, foco, erros, diasProva, temDataProva, sequenciaDias, disciplinas };
  const guia = guiaDoDia(ctx);

  // Dia local, não UTC: depois das 21h no Brasil o UTC já é amanhã.
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${agora.getMonth() + 1}-${agora.getDate()}`;
  const estadoDoDia = meta.batida ? 'batida' : meta.respondidas === 0 ? 'zero' : 'andando';
  const sugestao = [hoje, estadoDoDia, materia?.disciplina || '', erros > 0 ? 'erros' : ''].join('|');

  return (
    <AgentDock
      agentName={ASSISTENTE.nome}
      // A expressão segue o momento: pensando enquanto responde, atento com
      // o painel aberto, feliz com a meta batida.
      avatar={({ modo, trabalhando }) => (
        <KepyFace
          cores={{ primarySoft: theme.primarySoft, primaryDark: theme.primaryDark, accent: theme.accent }}
          humor={trabalhando ? 'pensando' : meta.batida ? 'feliz' : modo !== 'fechado' ? 'atento' : 'normal'}
        />
      )}
      status={statusDoDia(ctx)}
      cores={{ primarySoft: theme.primarySoft, primaryDark: theme.primaryDark, accent: theme.accent }}
      novo={visto !== sugestao}
      progresso={meta.meta > 0 ? meta.respondidas / meta.meta : null}
      guia={{ ...guia, meta }}
      responder={(mensagem) => responder(mensagem, ctx)}
      saudacao={`Oi, eu sou o ${ASSISTENTE.nome}. ${foco}`}
      sugestoes={SUGESTOES}
      onAbrir={() => { setVisto(sugestao); gravarVisto(sugestao); }}
      onAcao={(acao) => (acao.estudar ? onEstudar(acao.estudar) : onIr(acao.ir))}
    />
  );
}
