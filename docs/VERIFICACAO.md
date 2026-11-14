# Verificação da edição 2.0

`npm test`: 27 cenários do domínio em SQLite e um cenário integrado de SQL PostgreSQL via PGlite (driver de rede substituído em teste). Valida schema privado, transações, rollback, reservas, pagamento idempotente, deduplicação, limite de requisição e bloqueio do papel anon.

`npm run build`: build Next.js de produção. `npm run test:http`: rotas HTTP do build com SQLite temporário e reinício do servidor. `npm run test:workflow`: validação estrutural/transformações do workflow n8n.

Essas verificações não estabelecem conexão com sua conta Supabase, nem publicam na Vercel, nem validam sua instância Evolution ou n8n. Após configurar a conta execute `npm run db:check` e a sequência de aceitação de docs/DEPLOY_VERCEL_SUPABASE.md.
