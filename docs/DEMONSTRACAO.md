# Demonstração de 90 segundos

## Antes de apresentar

Inicie o projeto com `DEMO_MODE=true`, `AI_PROVIDER=local`, `WHATSAPP_PROVIDER=demo`. Entre com seu administrador e carregue os exemplos na Visão geral. Confira que mochila e kit têm estoque. Use um banco separado para ensaio se quiser manter a demonstração principal limpa; altere `DATABASE_PATH` para `./data/ensaio.sqlite` e reinicie.

Não limpe um banco existente para começar de novo. Um novo arquivo permite outro ensaio sem destruir pedidos ou alterar a linha do tempo. Não há botão “resetar” que apague o histórico.

## Roteiro

| Tempo | Ação na tela | Fala sugerida |
| --- | --- | --- |
| 0–15 s | Visão geral | “O lojista já recebe interesse no WhatsApp. A dificuldade é fechar a venda sem abandonar quem está no balcão.” |
| 15–35 s | Atendimentos → Mariana → sugerir itens | “A conversa vira uma proposta de pedido. A loja revisa produtos e quantidades com o estoque disponível ao lado.” |
| 35–50 s | Confirmar e enviar link | “Em uma ação, geramos a compra e reservamos os itens. O lojista continua no controle.” |
| 50–70 s | Ver compra do cliente → retirada → simular pagamento | “O cliente escolhe como receber e conclui o checkout no celular. Nesta prova o pagamento é simulado, sem movimentar dinheiro.” |
| 70–90 s | Pedidos / Visão geral | “O pedido foi registrado, o estoque baixou uma vez e a loja sabe o que precisa preparar. O próximo passo digital já cabe na rotina que ela tem hoje.” |

Para mostrar a extração de foto, configure antes o provedor de IA. Não dependa de uma chamada externa ao vivo para demonstrar o fluxo principal. Caso a IA esteja indisponível, use o cadastro manual e explique claramente que a inferência não foi demonstrada naquele momento.

## O que provar

- O catálogo e o histórico continuam após recarregar a página.
- A reserva reduz o disponível antes do pagamento, sem reduzir o físico.
- A confirmação reduz o físico uma única vez, mesmo ao recarregar o checkout.
- Um segundo pedido não pode ocupar as mesmas unidades já reservadas.
- O estoque reservado é liberado ao cancelar um pedido pendente.
- Há rastreabilidade: criação, pagamento simulado e transições aparecem nos eventos.

## Como ser honesto com a banca

| Observado nesta implementação | Hipótese ainda a validar |
| --- | --- |
| O fluxo técnico de pedido e estoque funciona nos testes locais | Se o comerciante real entende e usa o fluxo sem ajuda |
| O cadastro é curto e a IA produz apenas um rascunho revisável | Qualidade da extração com etiquetas e linguagem do segmento |
| Há uma prova simulada de checkout e reserva | Redução de tempo de atendimento e aumento de conversão reais |
| Adaptadores de WhatsApp e IA têm contratos implementados | Entrega de mensagens, latência e estabilidade na instância escolhida |
| A interface foi revisada em desktop e viewport estreito | Usabilidade em aparelhos reais, rede móvel e usuários da loja |

Não afirme entrevistas, taxa de conversão, economia de tempo ou crescimento de vendas que ainda não foram medidos. Os números de indicadores vêm do banco e, no modo demo, correspondem a operações fictícias.

## Validação com uma loja

Apresente uma mensagem típica e peça ao lojista para gerar o pedido sem instrução passo a passo. Registre tempo até o link, dúvidas, erros de quantidade, confiança para repetir e a linguagem usada. Faça o teste com poucos produtos mais vendidos. Compare com o processo atual de conferir a planilha e responder manualmente; não transforme estimativas em resultados observados.

## Repetir o ensaio

Os exemplos são carregados uma única vez. Novos pedidos consomem estoque quando pagos. Para continuar ensaiando, ajuste fisicamente o estoque fictício no cadastro ou use um novo arquivo de banco para cada rodada. Não refaça datas ou crie métricas históricas fictícias para parecer uma operação real.
