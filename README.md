# Tray Balcão 2.2

Aplicativo Next.js para catálogo assistido por IA, conversas de WhatsApp, pedidos, reserva de estoque e checkout de demonstração.

## Deploy na Vercel + Supabase

Siga [o guia completo](docs/DEPLOY_VERCEL_SUPABASE.md). Ele cobre criação do Supabase, migração SQL, variáveis privadas, deploy, configuração remota do n8n/Evolution e testes de aceitação.

- Banco remoto: PostgreSQL do Supabase, acessado por Data API HTTPS com URL + Secret key no servidor.
- Instalação SQL: `supabase/INSTALAR_SUPABASE.sql` (inclui migrações 001 e 002).
- Variáveis: `.env.vercel.example`.
- Dados existentes: importador opcional do SQLite, com modo de leitura e confirmação explícita.
- Segurança: schema privado com RLS e permissões públicas revogadas, queries parametrizadas, Supabase Auth com cookies HttpOnly e renovação de sessão, CSRF e segredos de webhook.
- Stack: Next.js 16.4.3, React 19, TypeScript, Tailwind, Node.js 24.

Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (login), SUPABASE_SECRET_KEY (dados) e ADMIN_EMAIL (administrador autorizado). Crie o usuário e sua senha em Supabase > Authentication > Users. O login não depende mais de ADMIN_PASSWORD/HASH nem da tabela de sessões da aplicação. As chaves ficam somente no servidor, sem NEXT_PUBLIC_. A Vercel continua hospedando a aplicação.

## Capturas locais sem login

Execute `npm ci` e `npm run dev:prints`. Abra http://localhost:3000. O painel abre diretamente com produtos e conversas fictícias, sem credenciais de administrador nem Supabase. O servidor escuta somente no loopback, usa `data/capturas.sqlite`, IA local e WhatsApp simulado. O acesso sem login só é válido neste modo de desenvolvimento local e fica bloqueado na Vercel/produção.

Para retornar à execução normal, encerre o processo e use `npm run dev`. O banco de capturas fica separado dos bancos usuais.

## Desenvolvimento local

1. Instale Node 24 e execute `npm ci`.
2. Copie `.env.example` para `.env.local` e configure Supabase Auth conforme o guia. Para desenvolvimento offline com SQLite, o login local antigo continua disponível sem SUPABASE_URL.
3. Execute `npm run dev` e abra localhost:3000.

Com as variáveis SUPABASE, execute antes a instalação SQL no projeto. DATABASE_URL permanece como alternativa avançada. Sem conexão remota, SQLite é somente para desenvolvimento local.

## Comandos

| Comando | Finalidade |
| --- | --- |
| npm run dev | Desenvolvimento |
| npm run build | Build de produção |
| npm start | Servidor local de produção |
| npm test | Domínio e SQL PostgreSQL local via PGlite |
| npm run test:http | Rotas HTTP do build e persistência após reinício |
| npm run test:auth:http | Login Supabase Auth por HTTP com transporte sintético |
| npm run test:workflow | Validação do workflow n8n |
| npm run doctor | Configuração local sem chamadas externas |
| npm run db:check | Verifica conexão e migração, sem exibir segredos |
| npm run db:import-sqlite -- CAMINHO | Conta registros; não escreve sem --confirm |
| npm run backup | Backup somente do SQLite local |

## Integrações

[IA e WhatsApp](docs/INTEGRACOES.md), [API](docs/API.md), [verificação](docs/VERIFICACAO.md) e [deploy](docs/DEPLOY_VERCEL_SUPABASE.md).

O workflow n8n aceita respostas da IA em objeto ou texto JSON. WhatsApp integrado com Evolution API v2 recebe texto; mídia de WhatsApp e JIDs @lid exigem normalização adicional. Extração de catálogo por áudio/imagem está disponível na interface da aplicação.

O pagamento é simulado e não cobra dinheiro. DEMO_MODE=false bloqueia a simulação; um lançamento com cobranças reais exige gateway adicional. Não foram executadas operações nas suas contas Supabase, Vercel, n8n ou Evolution.
