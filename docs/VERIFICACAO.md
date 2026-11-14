# Verificação da entrega

Verificação realizada em 14/11/2026, em Linux com Node.js 24.22.1, usando dados fictícios. O código foi organizado em componentes por funcionalidade e o build final não inclui rotas auxiliares de inspeção visual.

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado |
| `npm test` | 19 testes aprovados, 0 falhas |
| `npm run build` | Build de produção aprovado, checagem de TypeScript habilitada |
| `npm run test:http` | Jornada HTTP aprovada, com banco temporário |
| Reinício do servidor no teste HTTP | Pedido concluído e estoque preservados |
| `npm run test:workflow` | JSON, conexões e transformações do template n8n aprovados |
| Revisão visual desktop | Login, visão geral, atendimentos, montagem do pedido e catálogo revisados |
| Revisão de viewport móvel | Visão geral, menu e atendimento em frame de 390 px; largura de conteúdo igual à largura útil, sem rolagem horizontal |
| Checkout no navegador | Entrega local, endereço fictício, total de R$ 95,90, confirmação simulada e persistência após recarregar |
| Segredos e dados no pacote | Apenas `.env.example`; sem `.env.local`, bancos, sessões, node_modules ou builds |

## Casos cobertos nos testes de domínio e adaptadores

- Reserva sem baixa física; baixa transacional após confirmação; taxa de entrega em centavos.
- Pagamento repetido sem duplicar a baixa.
- Bloqueio de venda sem disponibilidade.
- Chave de criação reutilizada com corpo diferente rejeitada.
- Expiração e cancelamento liberando somente as próprias reservas.
- Estoque físico mínimo e preço congelado nos itens do pedido.
- Transições de preparação e retirada, impedindo alteração arbitrária para “pago”.
- Rollback de operações interrompidas.
- Webhooks duplicados e descarte de mensagens próprias e grupos.
- Sugestão local identificada como local; extração indisponível sem IA configurada.
- Deduplicação de envio e preservação de resultado incerto sem reenvio automático.
- Exemplos adicionados sem apagar dados existentes.
- Modo de pagamento simulado desativável.
- Credenciais incorretas e limite de tentativas.
- Valores monetários fracionários, estoque negativo e entradas com aparência de SQL.
- Contrato HTTP autenticado do n8n e rejeição de IDs inventados pela IA.
- Corpo de imagem e modelo de visão no adaptador Workers AI.
- Caminho de envio Evolution e bloqueio de envio real para conversas fictícias.

Os testes HTTP verificam o build servido por Node, não apenas funções isoladas. Eles cobrem sessão, bloqueio de origem diferente, segredo do webhook, catálogo, evento repetido, pedido, estoque insuficiente, checkout público, pagamento repetido, preparação e persistência após reiniciar o processo.

## Limites práticos

**Não foi feita uma compra financeira real.** O Pix é explicitamente simulado. Não existe um gateway, QR Pix bancário, conciliação ou estorno.

**Não foram usadas credenciais reais de n8n, Cloudflare ou WhatsApp.** Os adaptadores foram verificados com respostas controladas. O template n8n ainda precisa ser importado, associado às credenciais e executado na sua instância. O provedor de WhatsApp precisa de teste real de recebimento e envio, incluindo o formato de JID da versão escolhida.

A extração por IA não foi medida com fotos reais de etiquetas nesta entrega. O ditado usa capacidade do navegador e não foi exercitado com microfone. Revisão móvel foi feita em viewport estreito no navegador, sem teste de aparelho físico ou rede móvel. O login do lojista foi exercitado pela API HTTP, sem inserir credenciais reais em uma sessão de navegador.

O Dockerfile e o Compose estão incluídos, mas a imagem Docker não foi executada nesta sessão. Não houve publicação em hospedagem externa, teste de carga ou operação com dados de clientes reais. A arquitetura atual atende o recorte de uma loja em um processo Node com disco persistente; não representa um SaaS multiempresa pronto para escala.

## Comandos para reproduzir

```powershell
npm ci
npm run typecheck
npm test
npm run test:workflow
npm run build
npm run test:http
```

O teste HTTP cria e remove um banco temporário e usa credenciais sintéticas só no processo de teste. Não precisa da senha da sua loja. O roteiro `scripts/smoke.mjs` também pode ser executado separadamente, mas escreve dados de teste e deve ser usado apenas em uma instância local de ensaio, nunca num banco real.
