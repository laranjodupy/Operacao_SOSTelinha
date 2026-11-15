# Verificação da edição 2.2

`npm test`: 33 testes nesta entrega, incluindo domínio em SQLite, SQL PostgreSQL via PGlite e autenticação Supabase com transporte substituído em teste. Valida schema privado, transações, rollback, reservas, pagamento idempotente, deduplicação, limite de requisição e bloqueio do papel anon.

`npm run build`: build Next.js de produção. `npm run test:http`: rotas HTTP do build com SQLite temporário e reinício do servidor. `npm run test:workflow`: validação estrutural/transformações do workflow n8n.

Essas verificações não estabelecem conexão com sua conta Supabase, nem publicam na Vercel, nem validam sua instância Evolution ou n8n. Após configurar a conta execute `npm run db:check` e a sequência de aceitação de docs/DEPLOY_VERCEL_SUPABASE.md.

Os testes da Data API exercitam o transporte de chave somente no servidor, as funções SQL reais em PGlite, rollback de lote/importação, reserva/baixa de estoque, sessões, rate limit, envio e deduplicação. Papéis anon/authenticated não podem executar a RPC e a função rejeita operações SQL arbitrárias. Não equivalem a uma chamada ao projeto Supabase remoto.


Autenticação 2.2: os testes usam o SDK oficial com respostas HTTP sintéticas do Supabase Auth. Cobrem senha incorreta, usuário não confirmado, autorização por ADMIN_EMAIL, token adulterado, renovação, revogação, indisponibilidade e ausência de dependência da Data API para login. `npm run test:auth:http`, após o build, sobe a aplicação com transporte Auth simulado e verifica cookies HttpOnly/Secure/SameSite, CSRF, sessão, renovação e logout pelas rotas reais do Next.js. A aplicação não carrega esse mock na execução normal.
