# Atualização 2.1

A conexão recomendada agora usa SUPABASE_URL + SUPABASE_SECRET_KEY em HTTPS. Operações nomeadas em public.tray_balcao_api preservam transações. Tabelas privadas permanecem no schema tray_balcao. PostgreSQL direto e SQLite são alternativas. Consulte DEPLOY_VERCEL_SUPABASE.md.

# Arquitetura e decisões

## Por que este recorte

O guia do desafio pergunta como fazer a primeira venda online caber na rotina de uma loja física. A solução implementa uma ponte de atendimento: a loja não precisa começar configurando frete nacional, cadastrando centenas de itens ou substituindo seu sistema inteiro.

O demo original reunia balcão e celular em uma única tela e guardava tudo em `useState`. A versão atual separa o painel operacional e a URL do checkout, persiste o estado e trata estoque e pedidos no servidor. O painel ainda permite abrir o checkout em uma visualização embutida para demonstrar a jornada.

## Componentes

| Área | Responsabilidade |
| --- | --- |
| `app/page.tsx` | Entrada do lojista |
| `components/workspace.tsx` | Sessão, navegação e estado compartilhado do painel |
| `components/overview.tsx`, `inbox.tsx`, `catalog.tsx`, `orders.tsx` | Funcionalidades da operação, separadas por responsabilidade |
| `components/integrations.tsx`, `store-settings.tsx` | Configurações de conexão e da loja |
| `components/customer-checkout.tsx` | Compra pública pelo token exclusivo do pedido |
| `app/api/[...path]/route.ts` | Contratos HTTP, autenticação, limites de requisição e erros |
| `lib/server/store.ts` | Regras de produtos, pedidos, reservas e indicadores |
| `lib/server/db.ts` | Adaptadores PostgreSQL/SQLite, transações e auditoria |
| `lib/server/auth.ts` | Sessões, comparação de credenciais, proteção de origem e rate limit |
| `lib/server/integrations.ts` | Adaptadores de IA e WhatsApp |
| `lib/types.ts` | Tipos compartilhados e formatação monetária |

Não foi criado um Express separado porque os Route Handlers do Next.js já atendem o backend necessário ao recorte. O banco é acessado apenas no runtime Node, nunca no Edge ou no navegador.

## Jornada de uma venda

1. O webhook validado recebe uma mensagem de texto e deduplica pelo identificador do provedor.
2. O lojista escolhe a conversa e monta os itens. A IA pode sugerir; o lojista aprova.
3. O servidor valida produto ativo, quantidade, preço atual e disponibilidade.
4. Uma transação `BEGIN IMMEDIATE` cria o pedido, os itens congelados e a reserva por 30 minutos.
5. O servidor registra a mensagem de saída antes de chamar o provedor. O envio usa uma chave própria.
6. O cliente abre a URL com token aleatório de 192 bits e escolhe retirada ou entrega.
7. Em demonstração, o botão de pagamento chama a confirmação simulada. A mesma transação dá baixa no estoque físico, remove reservas e marca o pedido pago.
8. A aplicação atualiza seus indicadores por polling de 5 segundos e o lojista conduz a preparação.

`disponível = físico − reservado`. Gerar o link não reduz o estoque físico. Pagar reduz o físico e remove a reserva; a disponibilidade não cai uma segunda vez. Cancelar ou expirar um pedido pendente remove a reserva sem dar baixa.

## Consistência

- Valores financeiros são inteiros em centavos, sem cálculo monetário em float no domínio.
- Pedidos guardam nome e preço dos itens no momento da criação. Editar o catálogo não modifica pedidos existentes.
- Quantidades precisam ser inteiras positivas. Um produto não pode aparecer duas vezes no mesmo pedido.
- SKU, token do checkout, idempotency key e ID externo de mensagem têm restrições únicas.
- A mesma chave de criação com o mesmo corpo retorna o pedido anterior. Reutilizá-la com itens diferentes gera 409.
- Pagamento repetido retorna a confirmação anterior, sem nova baixa.
- Estoque físico não pode ser reduzido para menos do que a quantidade já reservada.
- Reservas vencidas são liberadas ao consultar o painel, o checkout ou executar operações que dependem de disponibilidade. Não há cron obrigatório. A liberação pode não ter sido materializada enquanto o sistema está ocioso, mas a próxima operação relevante reconcilia o vencimento antes de avaliar o estoque.

## Estados

| Estado atual | Próximos estados permitidos |
| --- | --- |
| Pendente | Pago pela confirmação de demonstração; cancelado pelo lojista; expirado pelo vencimento |
| Pago | Em preparação |
| Em preparação, retirada | Pronto para retirada |
| Em preparação, entrega | Concluído |
| Pronto para retirada | Concluído |
| Concluído, cancelado, expirado | Nenhum |

Não há cancelamento de pedido pago pelo painel porque ainda não existe um fluxo financeiro de estorno. Uma implementação futura de gateway precisa introduzir pagamento pendente, confirmação assinada pelo provedor, estorno e conciliação.

## Segurança implementada

Sessões de 12 horas com token aleatório; o banco guarda somente o hash do token. Cookie HttpOnly e SameSite Strict, com Secure quando `APP_URL` usa HTTPS. Logout revoga a sessão no banco. Credenciais vêm do ambiente; opcionalmente a senha pode ser armazenada como hash scrypt, gerado por `scripts/hash-password.mjs`.

Rotas do lojista exigem sessão. Alterações pelo navegador validam a origem contra `APP_URL`. Webhooks não usam cookie: exigem `x-webhook-secret`, com segredo de pelo menos 24 caracteres. Há limites persistentes para login, IA, pagamento de teste e webhook. O login usa um bucket global para não confiar em headers de IP fornecidos por um proxy desconhecido; ataques podem bloquear novas tentativas temporariamente, portanto configure proteção de borda antes de expor uma operação real.

As queries são parametrizadas. O corpo HTTP tem limite de 4,4 MB. Imagens aceitam JPEG, PNG ou WebP com limite de 3 MB no cliente e limite base64 no servidor. URLs de integrações são definidas no ambiente e precisam de HTTPS; localhost sem TLS depende de autorização explícita na configuração. Redirecionamentos não são seguidos e há timeout de 20 segundos.

O token de checkout funciona como uma capacidade de acesso: quem tem o link pode consultar e concluir aquele pedido de teste. Ele não permite consultar a lista de clientes ou de pedidos. Os links não devem ser publicados. A política de referrer evita enviar o token a sites de terceiros.

A IA não recebe ferramentas de banco, pagamento ou envio. Ela retorna rascunhos validados; IDs de produtos inexistentes são rejeitados. Imagem/texto podem conter instruções maliciosas: o prompt os trata como dados e as ações comerciais permanecem nas regras do servidor e sob confirmação do lojista.

## Mensagens de saída

`simulated` significa que a mensagem foi registrada só localmente. `accepted` significa que o provedor aceitou o HTTP; não é prova de entrega ou leitura. `failed` indica recusa. `uncertain` indica que o resultado não foi confirmado, por exemplo após timeout. `sending` pode permanecer após interrupção do processo.

Repetir a chave nunca dispara outro envio automaticamente. Isso reduz duplicidade, mas não promete exactly-once no serviço externo. Para repetir conscientemente, confira a conversa real e envie uma nova resposta pelo compositor. Antes de produção, acrescente callbacks de entrega, fila persistente com reconciliação e um procedimento operacional para envios incertos.

Conversas de exemplo não podem receber mensagens reais pelo adaptador. A captura e o envio reais são funcionalidades de teste disponíveis após configuração, não automação de marketing em massa.

## Persistência e implantação

Na edição 2.0, DATABASE_URL seleciona PostgreSQL no Supabase, com schema privado e migração SQL explícita. Transações usam a mesma conexão, AsyncLocalStorage e lock transacional compartilhado. Sem DATABASE_URL, SQLite nativo permanece disponível para desenvolvimento em disco persistente. Na Vercel DATABASE_URL é obrigatória. Consulte DEPLOY_VERCEL_SUPABASE.md.

A aplicação foi verificada localmente; a imagem Docker e o provedor de hospedagem ainda precisam de uma execução no ambiente de destino. Alterações posteriores de esquema exigem migrações versionadas; não presuma que `CREATE TABLE IF NOT EXISTS` modifica uma tabela antiga.

Uma evolução para mais lojas exige `tenant_id`, isolamento em todas as queries, gestão de acesso, políticas de retenção e banco compartilhado. Isso não foi introduzido silenciosamente no MVP de uma loja.

## Extração e revisão em lote (v1.1)

Texto/lista usa o modelo de texto; foto usa o modelo de visão; arquivo de áudio usa Whisper antes do modelo de texto. No n8n, o template tem ramificação para transcrição. A extração retorna até 20 rascunhos; nenhum deles é persistido automaticamente. Dados ausentes recebem aviso para revisão, sem inventar preço.

O lojista seleciona os rascunhos, revisa preço em reais, estoque e SKU e confirma o cadastro. `POST /api/products/batch` valida o lote inteiro e o grava em uma transação. Conflito de SKU não deixa uma importação parcial. Uma chave de idempotência persiste o resultado para evitar duplicação ao repetir uma confirmação após falha de rede.

Imagens e arquivos de áudio aceitam até 3 MB, um arquivo por extração. O envio usa base64; o limite HTTP do aplicativo foi reduzido para 4,4 MB para ficar abaixo do limite de payload de 4,5 MB documentado pela Vercel. A edição 2.0 já inclui persistência PostgreSQL remota para hospedagem serverless.
