# Deploy do Tray Balcão na Vercel com Supabase

Esta edição 2.0 usa PostgreSQL do Supabase quando DATABASE_URL está configurada; sem ela, mantém SQLite para desenvolvimento. Na Vercel, a ausência da conexão gera erro em vez de criar um banco temporário. Não há cópia automática dos dados locais. O login continua sendo o administrador da aplicação com sessões no banco; não é Supabase Auth. O checkout continua sendo uma demonstração, sem cobrança financeira real.

## 1. Crie e prepare o Supabase

1. Crie um projeto separado para o produto e guarde a senha do banco.
2. Abra SQL Editor. Execute `supabase/migrations/001_initial.sql` uma única vez no projeto escolhido. Ela cria o schema privado `tray_balcao` e não remove tabelas existentes. O catálogo começa vazio.
3. Clique em Connect e selecione a conexão PostgreSQL **Transaction pooler**. Copie a URI exibida (normalmente porta 6543). Use essa URI como DATABASE_URL. Troque o marcador da senha; caracteres especiais na senha devem ser codificados para URL. Não copie essa URI para o navegador, chats ou Git.
4. Esta integração usa `pg` no servidor, sem prepared statements nomeados; não requer anon key, publishable key nem service_role key. Não é necessário expor o schema tray_balcao na Data API.
5. TLS valida o certificado. Se houver erro de CA, obtenha o certificado CA do projeto nas configurações SSL do Supabase e configure DATABASE_SSL_CA (PEM, com quebras de linha reais ou `\n`). Não desligue a validação TLS em produção.

A migração revoga acesso de PUBLIC/anon/authenticated e habilita RLS sem políticas públicas. A conexão fornecida pelo painel tem privilégios elevados: mantenha-a exclusivamente nas variáveis do servidor. Não adicione políticas públicas para contornar erros de configuração.

## 2. Suba este código para seu repositório

Use o conteúdo desta versão como raiz do projeto. Não inclua node_modules, .next, data, backups, arquivos SQLite ou .env.local. O .gitignore já exclui esses caminhos. Os arquivos .env.example e .env.vercel.example contêm somente exemplos.

No computador, Node 24 e `npm ci`. Configure .env.local e execute `npm run db:check` para conferir conexão e migração. O comando só faz uma leitura e não imprime credenciais.

## 3. Configure a Vercel

Importe o repositório, selecione Next.js, raiz do projeto e Node.js 24.x. Use build `npm run build`; deixe os demais padrões do Next.js. Não rode scripts de migração durante o build.

Em Settings > Environment Variables, cadastre os valores abaixo para Production. Para Preview, use um projeto Supabase e integrações separados: uma URL Preview não deve escrever no banco de produção. Alterações nas variáveis exigem novo deploy.

| Variável | Valor |
| --- | --- |
| DATABASE_URL | URI do Transaction pooler do Supabase |
| DATABASE_SSL | true |
| DATABASE_SSL_CA | Opcional, CA do Supabase se necessária |
| APP_URL | Origem exata do domínio estável, como https://seu-projeto.vercel.app, sem caminho |
| ADMIN_EMAIL | Seu e-mail de administrador |
| ADMIN_PASSWORD_HASH | Hash gerado pelo script descrito abaixo |
| DEMO_MODE | true para apresentação com pagamento fictício; false desabilita pagamento simulado e carga de exemplos |
| AI_PROVIDER | n8n, cloudflare ou local |
| AI_TIMEOUT_MS | 90000 para o fluxo n8n |
| N8N_AI_WEBHOOK_URL | URL HTTPS de produção do workflow publicado, se AI_PROVIDER=n8n |
| N8N_AI_SECRET | Mesmo segredo do x-ai-secret do webhook n8n |
| WHATSAPP_PROVIDER | evolution para WhatsApp conectado; demo para ensaio |
| WHATSAPP_BASE_URL | Origem HTTPS pública da Evolution, sem /manager |
| WHATSAPP_INSTANCE | Nome da instância conectada |
| WHATSAPP_API_KEY | Chave da Evolution autorizada para essa instância |
| WEBHOOK_SECRET | Segredo aleatório com pelo menos 24 caracteres |
| ALLOW_INSECURE_LOCAL_INTEGRATIONS | false |

Todas essas variáveis são de servidor: nenhuma usa NEXT_PUBLIC_. Não coloque segredos no next.config, código fonte, screenshots ou retorno das rotas. Não cadastre DATABASE_PATH para produção. Para IA direta, configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e os modelos conforme .env.example; os campos N8N não são usados nesse modo.

Para gerar ADMIN_PASSWORD_HASH no PowerShell, use `node scripts/hash-password.mjs` e digite a senha no terminal quando solicitado. Não gere um hash de uma senha de exemplo. O formato é salt:hash. ADMIN_PASSWORD continua suportada, mas prefira cadastrar somente o hash em produção.

Depois do primeiro deploy, confira o domínio atribuído, ajuste APP_URL se necessário e faça outro deploy. APP_URL deve coincidir com o domínio em que você faz login; não é o endereço do Supabase, Evolution ou n8n.

## 4. O que muda de local para remoto

| Serviço | Local | Produção |
| --- | --- | --- |
| Aplicativo | localhost:3000 | Domínio HTTPS na Vercel |
| Banco | Arquivo SQLite | PostgreSQL persistente no Supabase |
| Evolution | localhost:8080 | Serviço acessível por HTTPS, em servidor próprio ou túnel de teste |
| n8n | localhost:5678, se local | URL HTTPS acessível pela Vercel |
| Destino do webhook Evolution | host.docker.internal/local | https://SEU-DOMINIO/api/webhooks/whatsapp |
| APP_URL | http://localhost:3000 | Origem HTTPS estável da Vercel |

Evolution e n8n não estão incluídos no deploy do Next.js. Mantenha-os rodando em um ambiente adequado a processos persistentes. Um túnel de teste para seu computador exige que computador, Docker e túnel permaneçam ligados; não é uma implantação permanente. Não exponha os bancos Redis/Postgres internos da Evolution ao público.

Na Evolution, substitua a URL de callback pelo domínio da aplicação, mantenha apenas MESSAGES_UPSERT e configure o cabeçalho x-webhook-secret pela API com o mesmo WEBHOOK_SECRET. Mantenha webhook by events desativado. O segredo do callback é diferente da API key da Evolution. Se houver proteção de deploy da Vercel exigindo login da Vercel, o webhook será bloqueado antes de chegar ao aplicativo: configure o domínio de produção para permitir acesso externo às rotas públicas e mantenha a autenticação do aplicativo e do webhook. Não remova webhookAuth.

## 5. Dados já existentes

Por padrão, o Supabase começa vazio. Para levar catálogo, conversas, mensagens e pedidos do SQLite, faça backup do arquivo e interrompa as alterações durante a cópia. Execute `npm run db:import-sqlite -- CAMINHO_DO_ARQUIVO --confirm` com DATABASE_URL do destino em .env.local. O importador exige tabelas de negócio vazias, roda em uma transação e não migra sessões nem limites de requisição. Sem --confirm, exibe somente contagens. Dados de clientes e links de checkout também são migrados: escolha conscientemente o banco de destino. Conflitos cancelam a transação completa.

## 6. Verificação depois do deploy

1. Abra /api/health: deve responder ok. Isso só comprova o servidor HTTP.
2. Faça login e abra o painel. Se o banco não foi configurado/migrado, a leitura não funcionará.
3. Cadastre um produto, recarregue e confira a persistência; novo deploy não deve apagar os dados.
4. Execute o teste de IA no painel. Ele faz uma pequena chamada real, mas não cadastra produtos.
5. De outro número, envie texto para o WhatsApp conectado. Confira recebimento e resposta no painel/celular.
6. Crie um pedido e confira que o link aponta ao domínio público. Se DEMO_MODE=true, conclua um pagamento fictício e confira estoque e status.

O adaptador atual do WhatsApp recebe texto e ignora grupos, mensagens próprias e JIDs @lid sem normalização. Catálogo por áudio/imagem funciona na interface de IA; encaminhar mídia do WhatsApp automaticamente à IA exige integração adicional.

## Limites desta entrega

Testes locais não equivalem a um deploy validado nas suas contas. Você deve executar a migração e cadastrar seus próprios segredos. Transações de negócio usam um lock do PostgreSQL compartilhado entre instâncias da aplicação para preservar a consistência do estoque em uma loja; para volumes elevados, esse lock deverá ser refinado por recurso. Reservas expiradas são liberadas quando o aplicativo processa operações/leitura do painel, sem um cron externo. Não há gateway de pagamento real nem garantia de entrega de mensagens apenas pelo retorno 2xx da Evolution.

## Diagnóstico de erro 500 no login (edição 2.0.1)

O login consulta rate_limits e sessions no banco; uma falha de banco pode ocorrer antes de conferir a senha. A resposta pública é genérica para não expor credenciais. Nos logs do servidor, procure `[tray-balcao]` com `code` e `hint`. A classificação contém apenas valores fixos, sem erro bruto, URI ou parâmetros. Em Vercel, reproduza a falha e abra Logs do projeto/deploy correspondente.

- 42P01/3F000: migração ausente ou aplicada em outro projeto.
- 28P01/28000: autenticação PostgreSQL recusada.
- SELF_SIGNED_CERT_IN_CHAIN/UNABLE_TO_VERIFY_LEAF_SIGNATURE: configure DATABASE_SSL_CA com a CA do projeto; não desative TLS.
- ENOTFOUND/ENETUNREACH: confira host e URI do pooler.
- DATABASE_UNCONFIGURED: DATABASE_URL ausente no ambiente do deploy.

Para testar a partir do computador, cadastre as mesmas configurações em .env.local e execute `npm run db:check`. Isso confirma a conexão a partir desse computador, não a conectividade da Vercel. Não compartilhe o arquivo de ambiente. Após alterar variáveis na Vercel, gere novo deploy.
