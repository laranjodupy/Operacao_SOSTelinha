# API da aplicação

Todos os caminhos começam com `/api`. Respostas JSON e `Cache-Control: no-store`. As rotas do lojista exigem cookie de sessão. Alterações iniciadas pelo navegador também exigem `Origin` igual a `APP_URL`. Integrações server-to-server usam o webhook autenticado, não a sessão do administrador.

## Rotas

| Método | Caminho | Acesso | Uso |
| --- | --- | --- | --- |
| GET | `/health` | Público | Estado básico, sem chaves ou dados do banco |
| GET | `/session` | Público | Informa somente se há sessão válida |
| POST | `/login` | Público + Origin | `{ email, password }`, cria cookie |
| POST | `/logout` | Origin | Revoga sessão e apaga cookie |
| GET | `/dashboard` | Lojista | Produtos, conversas, pedidos, métricas e eventos |
| GET | `/products` | Lojista | Catálogo com disponibilidade |
| POST | `/products` | Lojista | Novo produto |
| PATCH | `/products/{id}` | Lojista | Atualização completa dos campos editáveis |
| PUT | `/settings` | Lojista | Dados da loja e opções de recebimento |
| POST | `/demo/seed` | Lojista + modo demo | Carrega exemplos sem limpar o banco |
| POST | `/demo/message` | Lojista + modo demo | Simula mensagem recebida |
| PATCH | `/conversations/{id}` | Lojista | `{ status: "open" ou "closed" }`; também zera não lidas |
| POST | `/conversations/{id}/messages` | Lojista | `{ text }`, exige `Idempotency-Key` |
| POST | `/orders` | Lojista | Cria pedido e reserva; exige `Idempotency-Key` |
| PATCH | `/orders/{id}` | Lojista | Transição permitida de status |
| POST | `/ai` | Lojista | Sugestão ou extração, sem gravação automática |
| POST | `/webhooks/whatsapp` | `x-webhook-secret` | Evento Evolution ou mensagem normalizada |
| GET | `/checkout/{token}` | Token exclusivo | Dados públicos daquele pedido e da loja |
| POST | `/checkout/{token}/pay` | Token + Origin + modo demo | Confirma pagamento simulado |

## Produto

```json
{
  "name": "Caderno 10 Matérias",
  "sku": "CAD-010",
  "description": "Capa dura, 160 folhas",
  "price": 2490,
  "stock": 8,
  "category": "Cadernos",
  "active": true
}
```

`price`: centavos inteiros, de 1 a 100.000.000. `stock`: físico, inteiro de 0 a 1.000.000. `reserved` e `available` são calculados pelo servidor e não podem ser definidos no cadastro. Para tirar um produto de novos pedidos, edite `active`; não existe exclusão física que destrua o histórico.

## Pedido

Cabeçalho `Idempotency-Key` com um UUID novo para cada intenção de compra. Preserve a chave ao repetir a mesma requisição após uma falha de rede.

```json
{
  "customerName": "Mariana Costa",
  "conversationId": "uuid-da-conversa",
  "items": [
    { "productId": "uuid-do-produto", "quantity": 1 }
  ]
}
```

`conversationId` pode ser omitido para criar um pedido sem conversa pelo contrato HTTP. O painel trabalha a partir dos atendimentos. O servidor retorna `number`, `id`, `token`, `status`, itens, totais e vencimento. O checkout é `/checkout/{token}` na origem da aplicação.

Ao confirmar, o cliente escolhe:

```json
{ "delivery": "pickup" }
```

ou:

```json
{ "delivery": "local", "address": "Rua de Teste, 10, Centro" }
```

A taxa é calculada no servidor a partir da configuração atual da loja; o cliente não envia um valor financeiro. Essa rota não fala com gateway e só funciona com `DEMO_MODE` diferente de `false`.

## Erros

| Status | Significado |
| --- | --- |
| 400 | Dados inválidos |
| 401 | Sessão ou segredo inválido |
| 403 | Origem incorreta ou demonstração desativada |
| 404 | Registro ou rota inexistente |
| 409 | Conflito de estoque, idempotência, estado ou funcionalidade não configurada |
| 413 | Corpo acima do limite |
| 415 | Content-Type diferente de application/json |
| 429 | Limite temporário de requisições |
| 502 | Erro, timeout ou formato inválido da integração |
| 503 | Configuração necessária ausente |

Erros retornam `{ "error": "mensagem legível" }`. Detalhes e corpos de provedores não são repassados ao navegador, evitando vazamento de tokens ou conteúdo bruto.

## IA e WhatsApp

Os contratos completos, headers e exemplos estão em `INTEGRACOES.md`. A entrada de IA é limitada a `suggest` e `extract_product`; não há uma rota genérica para a IA executar SQL, confirmar pagamentos ou enviar mensagens.
