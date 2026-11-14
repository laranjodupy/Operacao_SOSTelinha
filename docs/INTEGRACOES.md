# Integrações: n8n, Workers AI e WhatsApp

## A escolha para este projeto

**Recomendação: começar com n8n se o objetivo imediato é demonstrar e ajustar o fluxo visualmente.** Use Workers AI diretamente se você preferir reduzir a quantidade de serviços e manter toda a lógica de integração em TypeScript.

Não são substitutos exatos: n8n orquestra chamadas e transformações; Workers AI executa modelos. O fluxo n8n deste pacote usa Workers AI, mas o nó de inferência pode ser trocado mantendo o contrato de resposta.

| Critério | n8n + um provedor de IA | Workers AI direto pelo Next.js |
| --- | --- | --- |
| Ajustar fluxo de demonstração | Nós visuais e histórico de execução | Alteração no adaptador TypeScript |
| Hospedagem adicional | n8n Cloud ou instância própria | Nenhum Worker adicional; REST no backend atual |
| Custo | Hospedagem/plano n8n + uso do modelo | Uso do modelo + hospedagem já necessária ao Next |
| Diagnóstico | Execuções no n8n e eventos na aplicação | Logs do servidor e painel Cloudflare |
| Trocar modelo | Nó HTTP/IA, mantendo JSON de saída | Modelo no ambiente; adaptar contrato se necessário |
| Foto | Nó/provedor multimodal configurado | Adaptador de visão fornecido |
| Controle do estoque | Continua no backend Next.js | Continua no backend Next.js |

Na documentação consultada em 14/11/2026, Workers AI informa alocação de 10.000 Neurons por dia e cobrança de US$ 0,011 por 1.000 Neurons além dessa alocação no plano pago. Alguns modelos exigem forma de pagamento habilitada; a conversão entre tokens e Neurons varia por modelo. Isso não é uma estimativa do custo total da aplicação nem uma garantia de gratuidade da demonstração.

O custo de n8n e do WhatsApp depende do provedor/instância escolhido; não foi contratado nenhum serviço nem estimado um valor sem conhecer esse ambiente.

## Opção A — n8n

1. Importe `integrations/n8n/tray-balcao-ia.json`.
2. No nó **Receber tarefa**, configure Header Auth com:
   - Name: `x-ai-secret`.
   - Value: um segredo longo escolhido por você.
3. Em variáveis do n8n, crie `CLOUDFLARE_ACCOUNT_ID`. Se sua edição não oferecer variáveis, substitua a expressão do Account ID na URL do nó HTTP pelo seu Account ID. Ele é identificador, não token secreto.
4. No nó **Chamar Workers AI**, configure uma credencial HTTP Header Auth:
   - Name: `Authorization`.
   - Value: `Bearer SEU_TOKEN_WORKERS_AI`.
5. Para o modelo de visão Llama 3.2, pode ser necessário aceitar a licença no painel/fluxo oficial da Meta/Cloudflare antes do primeiro uso. Faça essa escolha na sua conta.
6. Publique/ative o workflow e copie a **Production URL** do Webhook. Não use uma URL de teste sem o workflow aguardando evento.
7. Configure o Next.js e reinicie o servidor:

```dotenv
AI_PROVIDER=n8n
N8N_AI_WEBHOOK_URL=https://seu-n8n/webhook/tray-balcao-ai
N8N_AI_SECRET=mesmo-segredo-da-credencial-do-webhook
```

Não existem credenciais exportadas no JSON. Os nós precisam ser associados às credenciais da sua instância antes da primeira execução. O template foi validado estruturalmente e o contrato HTTP foi testado com respostas controladas; ele não foi executado em uma instância real de n8n nesta entrega. Versões do n8n podem exigir ajuste de parâmetros ao importar.

A resposta precisa chegar em até 20 segundos. O nó HTTP do template tem timeout de 18 segundos. O catálogo enviado contém apenas produtos ativos com IDs, preços e disponibilidade; a mensagem ou imagem é enviada ao provedor selecionado. Configure retenção das execuções no n8n de acordo com os dados utilizados.

### Contrato enviado ao n8n

```json
{
  "task": "suggest",
  "input": { "text": "Tem 2 cadernos?", "image": null },
  "catalog": [
    { "id": "uuid-real-do-produto", "name": "Caderno", "price": 2490, "available": 8 }
  ],
  "instructions": "Instruções do backend para retornar somente um rascunho JSON."
}
```

Para foto, `task` será `extract_product` e `input.image` terá `mimeType` e `dataBase64`. Não envie o prefixo `data:` dentro de `dataBase64`; o template monta a entrada do modelo.

### Respostas aceitas

Sugestão de produtos:

```json
{
  "items": [{ "productId": "uuid-real-do-produto", "quantity": 2 }],
  "reply": "Confira os produtos e a quantidade antes de enviar."
}
```

Extração de produto:

```json
{
  "product": {
    "name": "Caderno 10 Matérias",
    "description": "Capa dura, 160 folhas",
    "price": 2490,
    "stock": 8,
    "category": "Cadernos"
  }
}
```

`price` é em centavos. O modelo pode devolver zero quando não souber o preço; o formulário exige um preço positivo antes de salvar. SKU é preenchido pelo lojista. A resposta da IA nunca cadastra automaticamente um produto nem altera estoque.

## Opção B — Workers AI direto

No `.env.local`:

```dotenv
AI_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=seu-account-id
CLOUDFLARE_API_TOKEN=seu-token-com-permissao-workers-ai
CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct
CLOUDFLARE_VISION_MODEL=@cf/meta/llama-3.2-11b-vision-instruct
```

Reinicie o Next.js. O adaptador chama a API REST `accounts/{id}/ai/run/{model}` com Bearer token, somente do servidor. O modelo de texto sugere itens e extrai descrições. O modelo de visão recebe a imagem base64 como data URL e retorna o mesmo rascunho JSON.

A seleção dos modelos segue exemplos oficiais. Qualidade de OCR, quantidade, preço e disponibilidade precisam de teste com suas etiquetas reais. A extração de estoque não representa uma contagem confiável de itens numa prateleira; confirme o número manualmente. O contrato foi testado com fixtures, não com inferência real nesta entrega.

## WhatsApp — prova com Evolution API v2

O provedor não foi escolhido por você. Para tornar a integração concreta, foi incluído um adaptador **Evolution API v2** isolado. Se você preferir outro provedor, preserve as rotas da aplicação e adapte o recebimento/envio em `lib/server/integrations.ts`.

APIs não oficiais podem perder sessão, mudar o contrato ou causar bloqueio do número. Para a prova, use um número dedicado e contatos que participem do teste. Não há implementação de campanhas ou disparo em massa. Uma operação comercial deve avaliar a API oficial.

Configure uma instância já existente e conectada ao seu número:

```dotenv
WHATSAPP_PROVIDER=evolution
WHATSAPP_BASE_URL=https://sua-evolution
WHATSAPP_INSTANCE=nome-da-instancia
WHATSAPP_API_KEY=sua-chave
WEBHOOK_SECRET=um-segredo-aleatorio-com-ao-menos-24-caracteres
```

A aplicação envia `POST /message/sendText/{instance}` com `apikey` e corpo `{ "number": "5579...", "text": "..." }`. A resposta HTTP 2xx é registrada como **aceita pelo provedor**, sem afirmar entrega ou leitura.

### Recebimento direto

Aponte os eventos de mensagens para:

```text
POST https://SEU-DOMINIO/api/webhooks/whatsapp
x-webhook-secret: SEU_WEBHOOK_SECRET
Content-Type: application/json
```

Configure o header secreto nas opções do webhook do provedor, caso a sua versão suporte headers personalizados. **Não remova a autenticação da aplicação para acomodar uma limitação do provedor.** Se ele não conseguir enviar o header, use um fluxo n8n intermediário autenticado que encaminhe o evento com o header da aplicação.

O adaptador reconhece `messages.upsert` / `MESSAGES_UPSERT`, `data.key.id`, `data.key.remoteJid`, `data.pushName` e texto em `data.message.conversation` ou `extendedTextMessage.text`. Descarta mensagens próprias e grupos. Apenas JIDs de telefone `@s.whatsapp.net` são aceitos; instâncias que usem `@lid` devem resolver o telefone no fluxo intermediário. A compatibilidade concreta depende da versão da sua instância e precisa ser conferida com um payload real anonimizado.

### Formato normalizado para qualquer provedor/n8n

```json
{
  "externalId": "id-estavel-do-evento-no-provedor",
  "phone": "5579999999999",
  "name": "Cliente de teste",
  "text": "Vocês têm caderno para retirar hoje?"
}
```

Preserve o mesmo `externalId` em retentativas. Isso impede mensagens duplicadas. Não envie a API key da Evolution dentro do corpo normalizado.

### Como testar juntos

1. Rodar o projeto e demonstrar tudo com IA local e WhatsApp simulado.
2. Escolher a instância n8n e importar o fluxo de IA.
3. Executar uma sugestão de texto e uma etiqueta de teste, conferindo as execuções.
4. Definir o provedor de WhatsApp e obter um payload de mensagem real de teste.
5. Disponibilizar a aplicação por HTTPS e atualizar `APP_URL` com a origem exata.
6. Enviar “tem caderno?” de um contato de teste; confirmar recebimento no painel.
7. Aprovar um pedido e verificar que o link chegou no WhatsApp real.
8. Abrir no celular e concluir o pagamento simulado, conferindo o banco e o painel.

Não é necessário compartilhar senhas ou tokens no chat: preencha os segredos no seu ambiente. Podemos trabalhar com logs de erro e payloads removendo chaves, telefones pessoais e conteúdo privado.

## Fontes primárias consultadas

- n8n, Webhook: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
- n8n, Respond to Webhook: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/
- Cloudflare, REST API: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- Cloudflare, visão: https://developers.cloudflare.com/workers-ai/guides/tutorials/llama-vision-tutorial/
- Cloudflare, preços: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Evolution Foundation, implementação de envio: https://github.com/evolution-foundation/evolution-api/blob/main/src/api/controllers/sendMessage.controller.ts
- Evolution Foundation, roteamento: https://github.com/evolution-foundation/evolution-api/blob/main/src/api/routes/sendMessage.router.ts

As páginas públicas de documentação da Evolution apresentaram falhas de acesso nesta sessão; o contrato do adaptador deve ser validado contra a instância escolhida, não presumido como universal.
