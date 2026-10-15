-- Questões discursivas mínimas para o e2e da 2ª fase.
--
-- Mesmo caminho do `e2e-questoes.sql`: a tabela nasce da migration do
-- questoes-service, então isto roda depois do `--wait`, pelo
-- `e2e-backend.sh` — e só se a tabela existir: até a imagem do serviço com a
-- 2ª fase sair, o teste que depende disto se pula.
--
-- Exame 99, que não existe, pelo mesmo motivo do outro seed: apontado por
-- engano para um banco de verdade, não colide com questão oficial. Os textos
-- são de padrões de resposta reais (44º e 43º Exame, Direito Civil): o
-- segundo tem a linha "OU" que separa duas respostas aceitas.

INSERT INTO questoes_discursivas (exame, area, numero, enunciado, itens, fonte)
VALUES
  (99, 'civil', 1,
   'Guilherme ingressou com uma ação de execução de título extrajudicial em face de Fabiano, cobrando dívida no valor de R$ 50.000,00 (cinquenta mil reais).
Ao longo do processo de execução, houve a penhora de um automóvel, avaliado no valor de R$ 50.000,00 (cinquenta mil reais), fruto de herança recebida por Fabiano quando da conclusão do processo de inventário de seu pai, falecido há dois anos.
Guilherme solicitou ao Juízo a adjudicação do bem.
Maria, casada com Fabiano há 15 (quinze) anos pelo regime de comunhão parcial de bens, procurou você, advogado(a), e questionou acerca de seus direitos relativamente ao automóvel penhorado.
Diante do caso narrado, responda aos itens a seguir.',
   '[{"letra": "A", "pergunta": "O automóvel penhorado entra na comunhão de bens de Maria e Fabiano? Justifique.", "valor": 0.6, "gabarito": "Não. Tendo em vista que o bem móvel penhorado foi adquirido por Fabiano em razão de herança recebida na constância do casamento, ele estará excluído da comunhão, nos termos do Art. 1.659, inciso I, do CC.", "distribuicao": "A. Não, pois foi adquirido por Fabiano em razão de herança recebida na constância do casamento e estará excluído da comunhão (0,50), nos termos do Art. 1.659, inciso I, do CC (0,10)."}, {"letra": "B", "pergunta": "Diante da já manifestada intenção do credor de adjudicar o bem, poderia Maria adjudicá-lo? Justifique.", "valor": 0.65, "gabarito": "Sim. Considerando o regime da comunhão parcial de bens, o direito de adjudicação poderá ser exercido pelo cônjuge do executado, que gozará de preferência em caso de igualdade de ofertas, conforme o Art. 876, §5º ou §6º, do CPC.", "distribuicao": "B. Sim. O direito de adjudicação poderá ser exercido pelo cônjuge do executado (0,25), que gozará de preferência em caso de igualdade de ofertas (0,30), conforme o Art. 876, §5º ou §6º, do CPC (0,10)."}]',
   'e2e — texto do 44º Exame, questão 1'),

  (99, 'civil', 2,
   'Camila e João, casados no regime da comunhão parcial de bens, residiam em Tatuapé, São Paulo, e tiveram cinco filhos durante o casamento: Rebeca, Talita, Marcos, Alexandre e Miguel. Os filhos, à exceção de Miguel, concluíram a graduação em suas áreas de interesse. Miguel, o único que não se formou, conseguiu um emprego em uma empresa local, mas sem grandes conquistas.
João, com pena de Miguel, o caçula e seu preferido, decidiu vender um apartamento pequeno, localizado em Santos, SP, por um preço mais acessível, para Miguel, pois achou que o filho não teria capacidade financeira de adquirir um imóvel.
Os documentos foram juntados e o contrato firmado entre João e Miguel, sem que qualquer dos irmãos e mesmo Camila soubessem do acerto. Tempos depois, Marcos e Rebeca descobriram o que aconteceu e reclamaram com o pai a venda do imóvel para Miguel. João, porém, defendeu sua posição e sustentou que teria feito o correto. Diante da situação apresentada, responda aos itens a seguir.',
   '[{"letra": "A", "pergunta": "Considerando o negócio entre João e Miguel, o que poderia Camila e seus demais filhos fazer sobre o ocorrido? E em que prazo? Justifique.", "valor": 0.65, "gabarito": "Camila e seus demais filhos poderiam pleitear a anulação do negócio jurídico firmado entre ascendente e descendente, pois não contou com a anuência do cônjuge e dos demais descendentes, conforme Art. 496 do CC, no prazo de dois anos, de acordo com o Art. 179 do CC.", "distribuicao": "A. Camila e seus demais filhos poderiam pleitear a anulação do negócio jurídico firmado entre ascendente e descendente, pois não contou com a anuência do cônjuge e dos demais descendentes (0,30), conforme o Art. 496 do CC (0,10), no prazo de dois anos (0,15), de acordo com o Art. 179 do CC (0,10)."}, {"letra": "B", "pergunta": "Qual o foro competente para reclamar do negócio jurídico firmado entre João e Miguel? Justifique.", "valor": 0.6, "gabarito": "Camila e seus demais filhos deverão propor ação de anulação do negócio jurídico em Santos, SP, por ser o foro de localização do imóvel objeto da lide, conforme o Art. 47 do CPC.\nOU\nEm São Paulo, SP, o foro do domicílio do réu, entendendo ser obrigação pessoal, conforme Art. 46 do CPC.", "distribuicao": "B. Camila e seus demais filhos deverão propor ação de anulação do negócio jurídico em Santos, SP (0,20), por ser o foro de localização do imóvel objeto da lide (0,30), conforme o Art. 47 do CPC (0,10) OU Em São Paulo, SP (0,20), o foro do domicílio do réu, entendendo ser obrigação pessoal (0,30), conforme Art. 46 do CPC (0,10)."}]',
   'e2e — texto do 43º Exame, questão 1 (item B com linha OU)');
