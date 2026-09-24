// Enviar uma lista ao servidor em fila, poucos de cada vez.
//
// Existe por causa do simulado: ele mandava um POST por resposta, todos
// juntos. O nginx aceita 30 pedidos por segundo com folga de 50, e numa prova
// de 80 questões umas 30 respostas voltavam 429 sem virar tentativa — sumiam
// do desempenho por disciplina, da revisão, da meta e da taxa de acertos. Em
// fila, a prova inteira cabe no limite.

/**
 * Chama `enviar(item)` para cada item, com no máximo `simultaneos` pedidos no
 * ar ao mesmo tempo. `enviar` devolve `true` quando o item foi salvo; se
 * lançar, o item conta como falha e a fila segue.
 *
 * Antes de cada envio pergunta a `continuar()` se ainda faz sentido. É por ali
 * que quem chama para a fila quando a sessão acaba: o resto não pode sair com
 * o token de outra pessoa. Os pedidos que já estavam no ar terminam; nenhum
 * novo sai.
 */
export async function enviarEmFila(itens, enviar, { continuar = () => true, simultaneos = 1 } = {}) {
  let salvos = 0;
  let falhas = 0;
  let proximo = 0;
  let interrompida = false;

  const trabalhador = async () => {
    while (proximo < itens.length) {
      if (interrompida || !continuar()) {
        interrompida = true;
        return;
      }
      const item = itens[proximo];
      proximo += 1;

      let ok = false;
      try {
        ok = (await enviar(item)) === true;
      } catch {
        ok = false;
      }
      if (ok) salvos += 1;
      else falhas += 1;
    }
  };

  const quantos = Math.max(1, Math.min(simultaneos, itens.length));
  await Promise.all(Array.from({ length: quantos }, trabalhador));

  return { salvos, falhas, interrompida };
}
