# Tray Balcão 2.2: Vercel e Supabase com URL + chave

A conexão recomendada agora usa a Data API HTTPS do Supabase. Você configura a URL do projeto e uma chave de servidor. Não precisa montar URI PostgreSQL, codificar senha do banco ou cadastrar certificado CA neste modo. A conexão PostgreSQL antiga continua opcional para uso avançado.

## 1. Prepare o banco

No seu projeto Supabase, abra SQL Editor e execute o arquivo inteiro `supabase/INSTALAR_SUPABASE.sql`. Ele reúne as migrações 001 e 002. Cria as tabelas quando ausentes e atualiza a função de acesso, sem apagar os registros existentes. Pode usar o mesmo projeto Supabase da versão anterior. Alternativamente, execute os arquivos em supabase/migrations na ordem 001 e 002.

A função `public.tray_balcao_api` possui operações fixas. Ela não aceita SQL arbitrário. Apenas service_role pode executá-la. Os papéis anon e authenticated não podem chamá-la. As tabelas permanecem no schema privado tray_balcao, com RLS habilitada e sem acesso público. Não exponha esse schema na Data API e não adicione políticas públicas.

A Data API precisa estar habilitada, com o schema public exposto (configuração padrão). O navegador continua chamando as rotas autenticadas do Next.js; ele não chama diretamente a função privilegiada do Supabase.

## 2. Configure as chaves e o usuário de login

- **SUPABASE_URL:** URL HTTPS do projeto, encontrada em Connect ou nas configurações de API/Data API. Copie a origem, como `https://REFERENCIA-REAL.supabase.co`. Não use o endereço do dashboard, a URI postgresql ou o domínio da Vercel.
- **SUPABASE_PUBLISHABLE_KEY:** em Settings > API Keys, copie a Publishable key (`sb_publishable_`). Ela é usada pelo servidor para chamar o Supabase Auth. Para projetos com chaves antigas, SUPABASE_ANON_KEY é aceita como alternativa apenas para Auth.
- **SUPABASE_SECRET_KEY:** em Settings > API Keys, obtenha/crie uma Secret key, normalmente iniciada por `sb_secret_`. Ela serve para acesso aos dados no backend. A Publishable key não substitui esta chave de dados.
- Se o projeto usar as chaves antigas, use a chave `service_role` em **SUPABASE_SERVICE_ROLE_KEY**, deixando SUPABASE_SECRET_KEY ausente. A chave anon não possui permissão para esta integração.

Nunca envie a chave pelo chat nem coloque no código ou em NEXT_PUBLIC_. Ela permite acesso privilegiado aos dados do projeto. Use um projeto dedicado e cadastre a chave como variável secreta do servidor.

### Crie o administrador no Supabase Auth

Abra Authentication > Users > Add user > Create new user. Cadastre o e-mail e a senha que serão usados no Tray Balcão e marque Auto Confirm User/Email para o primeiro acesso. Esse usuário é do seu aplicativo; não é automaticamente a conta usada para entrar no painel do Supabase. Em Authentication, mantenha o provedor Email habilitado para acesso por senha.

Defina ADMIN_EMAIL com exatamente o e-mail desse usuário. Essa variável é uma lista de autorização de um único administrador: outros usuários do projeto não podem acessar os dados desta loja. Não há cadastro público na interface. Você pode desabilitar novos cadastros públicos nas configurações do Auth.

A senha passa a ser gerenciada pelo Supabase Auth. ADMIN_PASSWORD e ADMIN_PASSWORD_HASH são ignorados neste modo e podem ser removidos da Vercel. Não precisa gerar hash nem inserir registros manualmente em auth.users ou na tabela sessions. Para redefinir a senha nesta versão, use Authentication > Users no painel; não há fluxo de recuperação na interface.

## 3. Cadastre na Vercel

Em Settings > Environment Variables, no ambiente do deploy:

```dotenv
SUPABASE_URL=https://URL-REAL-DO-PROJETO.supabase.co
AUTH_PROVIDER=supabase
SUPABASE_PUBLISHABLE_KEY=COLE_A_PUBLISHABLE_KEY_REAL
SUPABASE_SECRET_KEY=COLE_A_SECRET_KEY_REAL
APP_URL=https://DOMINIO-REAL-DO-APLICATIVO
ADMIN_EMAIL=SEU_EMAIL
```

Esses exemplos não são credenciais prontas. Use as três configurações do mesmo projeto Supabase. APP_URL deve ser a origem exata aberta no navegador, sem caminho nem barra final. Mantemos a proteção de origem contra CSRF. Não use prefixo NEXT_PUBLIC_ para estas variáveis.

O login chama Supabase Auth diretamente pelo servidor e não consulta a RPC nem a tabela de sessões do banco. Access token e refresh token ficam em cookies HttpOnly, com SameSite=Strict e Secure em HTTPS. A identidade é validada no Supabase nas chamadas protegidas e a sessão é renovada quando necessário. As respostas de sessão não são armazenadas em cache. Na Vercel, o Supabase Auth é obrigatório mesmo que AUTH_PROVIDER=local seja configurado por engano.

No modo novo, pode remover DATABASE_URL, DATABASE_SSL e DATABASE_SSL_CA das variáveis da Vercel. Se existir DATABASE_PROVIDER de um teste anterior, remova-a ou defina `supabase`. Quando as configurações SUPABASE estão presentes, a seleção automática dá preferência à Data API. Sem elas, DATABASE_URL ainda seleciona PostgreSQL direto. Sem nenhuma configuração remota, SQLite serve apenas para desenvolvimento local. Não haverá fallback silencioso para SQLite se a configuração Supabase estiver incompleta ou falhar.

Mantenha as variáveis das integrações de IA/WhatsApp e DEMO_MODE conforme `.env.vercel.example`. A configuração do banco foi simplificada; n8n e Evolution continuam sendo serviços independentes.

Importe o repositório na Vercel como Next.js, Node.js 24.x, build `npm run build`. Após alterar variáveis, faça novo deploy. Para Preview, use banco e integrações de teste separados dos de produção.

## 4. Uso local

Copie .env.example para .env.local. Preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY e ADMIN_EMAIL; use a senha criada no Supabase Auth. Execute:

```powershell
npm ci
npm run db:check
npm run dev
```

O db:check testa conectividade e existência das tabelas pela mesma RPC, sem cadastrar produtos e sem imprimir segredos. Configurar o banco localmente não configura as variáveis na Vercel. Não envie .env.local para o Git.

## 5. Como conferir

1. /api/health confirma apenas o servidor HTTP.
2. Entre com o e-mail e a senha criados em Authentication > Users e abra o painel. Um login correto retorna 200 em /api/login; /api/session deve retornar authenticated: true.
3. Cadastre um produto, recarregue e confira a persistência no mesmo projeto Supabase.
4. Teste IA e WhatsApp. As chamadas dependem das configurações desses provedores.
5. Crie um pedido e confirme a reserva. O pagamento é simulado quando DEMO_MODE=true.

As operações de estoque, pedidos, rate limit e mensagens são operações nomeadas em função SQL. Cada chamada executa em uma transação, com lock transacional compartilhado para preservar a consistência entre instâncias. O envio externo de WhatsApp acontece depois da gravação da saída pendente, para evitar reenvios por repetição da chave.

## 6. Endereços de local para remoto

| Configuração | Produção |
| --- | --- |
| APP_URL | Origem HTTPS estável do aplicativo na Vercel |
| WHATSAPP_BASE_URL | Origem HTTPS acessível da Evolution, sem /manager |
| Webhook da Evolution | https://SEU-DOMINIO/api/webhooks/whatsapp com x-webhook-secret |
| N8N_AI_WEBHOOK_URL | URL HTTPS de produção do workflow publicado |
| ALLOW_INSECURE_LOCAL_INTEGRATIONS | false |

localhost:8080 e host.docker.internal não são destinos para chamadas da Vercel. Hospede Evolution/n8n em ambiente apropriado a processos persistentes ou use túnel de teste com o computador ligado. O deploy Next.js não instala esses serviços.

## 7. Dados anteriores

Se já usava o mesmo Supabase, aplicar a migração mantém os dados nas tabelas existentes. Não é necessário copiar dados para mudar o transporte de PostgreSQL para HTTPS.

Para trazer um SQLite local, execute `npm run db:import-sqlite -- CAMINHO_DO_ARQUIVO`. Sem --confirm, o comando apenas conta os registros. Para importar, use --confirm com destino vazio. No modo Data API, a importação ocorre em uma única RPC atômica, com limite de 5 MB de payload no script. Não copia sessões nem limites de requisição. Para volumes maiores, use o modo PostgreSQL direto do guia avançado.

## 8. Diagnóstico seguro

Procure `[tray-balcao]` nos Logs de execução da Vercel, depois de reproduzir o erro. O navegador recebe uma resposta genérica para não expor detalhes do banco.

| Código | Ação |
| --- | --- |
| SUPABASE_AUTH_SERVICE | Conferir URL, Publishable key e disponibilidade do Supabase Auth |
| SUPABASE_CONFIG | Conferir URL e chave de servidor |
| SUPABASE_AUTH | Conferir se a Secret key/service_role é do mesmo projeto e se a função tem as permissões da migração |
| SUPABASE_MIGRATION | Executar INSTALAR_SUPABASE.sql e conferir se a Data API está habilitada |
| SUPABASE_NETWORK | Conferir URL HTTPS e disponibilidade do projeto |
| 42P01 / 3F000 | Migração ou schema ausente |
| SUPABASE_API | Conferir migrações, permissões e disponibilidade do serviço |

No modo Data API, os erros de CA da conexão PostgreSQL anterior não se aplicam. A chamada HTTPS mantém a validação TLS normal do Node.js.

### Diagnóstico do login

- E-mail ou senha incorretos (401): confirme o usuário em Authentication > Users e redefina a senha se necessário.
- E-mail não confirmado (403): confirme o usuário no Supabase ou crie com Auto Confirm.
- Usuário não autorizado (403): ADMIN_EMAIL precisa corresponder ao e-mail desse usuário.
- Origem não autorizada (403): confira APP_URL com o domínio aberto no navegador.
- Login funciona, mas painel falha: confira Secret key e INSTALAR_SUPABASE.sql; o Auth e a conexão de dados são separados.

Depois de configurar as variáveis, faça novo deploy e entre novamente. Sessões do login antigo não são reutilizadas. Não é necessário executar nova migração SQL para o Supabase Auth; a instalação SQL de dados continua necessária.

## Limites

A conexão real nas suas contas e o deploy externo precisam ser validados depois da configuração. Testes locais usam o SQL PostgreSQL em PGlite e substituem o transporte HTTP. O pagamento ainda é demonstrativo. Não há gateway financeiro real, módulo de associações ou processamento automático de mídia recebida pelo WhatsApp nesta entrega. Reservas vencidas são liberadas em operações/painel, sem cron externo. O lock global é adequado ao escopo atual de uma loja e pode precisar de refinamento para volumes maiores.

Referências de autenticação: https://supabase.com/docs/reference/javascript/auth-signinwithpassword e https://supabase.com/docs/guides/auth/server-side/advanced-guide.

Referências oficiais: https://supabase.com/docs/guides/api/api-keys e https://supabase.com/docs/guides/database/functions.
