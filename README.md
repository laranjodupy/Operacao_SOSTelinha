# Tray Balcão 2.0

Aplicativo Next.js para catálogo assistido por IA, conversas de WhatsApp, pedidos, reserva de estoque e checkout de demonstração.

## Deploy na Vercel + Supabase

Siga [o guia completo](docs/DEPLOY_VERCEL_SUPABASE.md). Ele cobre criação do Supabase, migração SQL, variáveis privadas, deploy, configuração remota do n8n/Evolution e testes de aceitação.

- Banco remoto: PostgreSQL do Supabase, com conexão privada no servidor via `pg`.
- Migração: `supabase/migrations/001_initial.sql`.
- Variáveis: `.env.vercel.example`.
- Dados existentes: importador opcional do SQLite, com modo de leitura e confirmação explícita.
- Segurança: schema privado com RLS e permissões públicas revogadas, queries parametrizadas, sessões com tokens hash, CSRF e segredos de webhook.
- Stack: Next.js 16.4.3, React 19, TypeScript, Tailwind, Node.js 24.

Não coloque DATABASE_URL nem tokens de integração em variáveis NEXT_PUBLIC_. Este projeto não exige chave anon nem service_role do Supabase. O login continua sendo do administrador da aplicação.

## Desenvolvimento local

1. Instale Node 24 e execute `npm ci`.
2. Copie `.env.example` para `.env.local` e configure as credenciais do administrador.
3. Execute `npm run dev` e abra localhost:3000.

Sem DATABASE_URL, o banco SQLite local é criado automaticamente. Com DATABASE_URL, execute antes a migração no Supabase. Na Vercel, DATABASE_URL é obrigatória.

## Comandos

| Comando | Finalidade |
| --- | --- |
| npm run dev | Desenvolvimento |
| npm run build | Build de produção |
| npm start | Servidor local de produção |
| npm test | Domínio e SQL PostgreSQL local via PGlite |
| npm run test:http | Rotas HTTP do build e persistência após reinício |
| npm run test:workflow | Validação do workflow n8n |
| npm run doctor | Configuração local sem chamadas externas |
| npm run db:check | Verifica conexão e migração, sem exibir segredos |
| npm run db:import-sqlite -- CAMINHO | Conta registros; não escreve sem --confirm |
| npm run backup | Backup somente do SQLite local |

## Integrações

[IA e WhatsApp](docs/INTEGRACOES.md), [API](docs/API.md), [verificação](docs/VERIFICACAO.md) e [deploy](docs/DEPLOY_VERCEL_SUPABASE.md).

O workflow n8n aceita respostas da IA em objeto ou texto JSON. WhatsApp integrado com Evolution API v2 recebe texto; mídia de WhatsApp e JIDs @lid exigem normalização adicional. Extração de catálogo por áudio/imagem está disponível na interface da aplicação.

O pagamento é simulado e não cobra dinheiro. DEMO_MODE=false bloqueia a simulação; um lançamento com cobranças reais exige gateway adicional. Não foram executadas operações nas suas contas Supabase, Vercel, n8n ou Evolution.
