# Tray Balcão

**Da conversa no WhatsApp à primeira venda digital, sem interromper o balcão.**

Sistema web independente criado a partir do demo do desafio Tray no Hackathon Connect 7.0. O foco é a papelaria de bairro que já recebe pedidos por mensagem e precisa conferir produtos, organizar uma compra e acompanhar a retirada.

A identidade azul e a jornada “confirme → envie → comemore” do demo foram preservadas e ampliadas para uma operação persistente. Este projeto não é um produto oficial da Tray e não acessa catálogo, estoque, PDV ou pagamentos da Tray.

## O que funciona

- Login do lojista com sessão no servidor e cookie HttpOnly.
- Catálogo com cadastro, edição, SKU único, categorias, busca e ativação/desativação.
- Estoque físico, reservado e disponível separados.
- Caixa de entrada com histórico persistente e conclusão/reabertura do atendimento.
- Montagem de pedidos com vários produtos e quantidades.
- Sugestão de produtos por palavras-chave sem dependências externas.
- IA substituível: webhook n8n ou REST Cloudflare Workers AI, com revisão humana.
- Cadastro assistido por descrição ou foto; ditado quando o navegador oferecer suporte.
- Link exclusivo de checkout com retirada gratuita ou entrega local.
- Reserva de 30 minutos, liberação por cancelamento ou expiração, baixa transacional após confirmação.
- Pagamento de demonstração, sem cobrança ou código Pix real.
- Preparação, retirada/entrega, exportação CSV e histórico de eventos.
- Adaptador WhatsApp Evolution API v2 e webhook autenticado, com deduplicação.
- Indicadores calculados a partir do banco, considerando o dia em Brasília.
- Interface adaptada para desktop e telas pequenas; atualização automática a cada 5 segundos quando a aba está visível.

**As chamadas externas precisam ser configuradas e testadas com suas contas.** Os testes dos adaptadores usam respostas controladas. O workflow n8n fornecido é um template importável, não uma instância já conectada. Pagamento real e sincronização com a Tray estão fora desta versão.

## Stack preservada

| Camada | Tecnologia |
| --- | --- |
| Interface e servidor | Next.js 16.4.3, App Router |
| Componentes | React 19, TypeScript |
| Estilo | Tailwind CSS 4 e CSS |
| Ícones | Lucide |
| Persistência acrescentada | SQLite nativo do Node (`node:sqlite`) |
| Testes | `node:test`, TypeScript e roteiro HTTP |

O demo não tinha backend ou banco. SQLite foi acrescentado para funcionar em um único processo Node sem exigir uma conta de banco ou biblioteca nativa compilada. Use **Node.js 24 LTS ou posterior**. Não trocamos Next.js por um Worker: Workers AI é consumido por REST no backend existente.

## Rodar no Windows / PowerShell

1. Instale Node.js 24 LTS, extraia este ZIP e abra a pasta `tray-balcao` no VS Code.
2. No terminal dessa pasta:

```powershell
npm ci
Copy-Item .env.example .env.local
```

3. Edite `.env.local`:

```dotenv
APP_URL=http://localhost:3000
ADMIN_EMAIL=seu@email.com
ADMIN_PASSWORD=uma-senha-longa-que-voce-escolheu
DEMO_MODE=true
AI_PROVIDER=local
WHATSAPP_PROVIDER=demo
```

4. Execute:

```powershell
npm run doctor
npm run dev
```

5. Abra `http://localhost:3000`, entre com as credenciais definidas e clique em **Carregar exemplos** na Visão geral.

O banco surge automaticamente em `data/tray-balcao.sqlite`. Fechar o terminal não apaga os dados. Os exemplos só são adicionados uma vez e não limpam o banco. Não existe uma senha universal de acesso.

Em macOS/Linux, use `cp .env.example .env.local` no lugar de `Copy-Item`.

## Demonstrar uma compra

1. Carregue os exemplos e abra **Atendimentos**.
2. Escolha Mariana e clique em **Sugerir itens da conversa**. No modo local, confira as quantidades manualmente.
3. Confira mochila e kit de canetas, depois clique em **Confirmar e enviar link**.
4. A mensagem fica registrada como **Simulada**. Clique em **Ver compra do cliente**.
5. Escolha retirada ou entrega e clique em **Simular pagamento Pix**.
6. Feche a visualização. Em até 5 segundos o estoque e os indicadores refletem a confirmação.
7. Em **Pedidos**, inicie a preparação, marque como pronto e confirme a retirada.

A versão detalhada, com fala de apresentação e limites de validação, está em [docs/DEMONSTRACAO.md](docs/DEMONSTRACAO.md).

## Integrações

Leia [docs/INTEGRACOES.md](docs/INTEGRACOES.md) antes de preencher os campos.

- **Para demonstrar rapidamente com um fluxo visual:** `AI_PROVIDER=n8n`.
- **Para menos componentes e controle por código:** `AI_PROVIDER=cloudflare`.
- **Sem contas ou custo de inferência:** `AI_PROVIDER=local`; não é uma IA.

n8n coordena automações; Workers AI executa modelos. É possível usar ambos juntos. Há um fluxo em `integrations/n8n/tray-balcao-ia.json` que usa Workers AI pelo n8n. Não é necessário usar o mesmo provedor para IA e WhatsApp.

Nunca coloque tokens no frontend ou em variáveis `NEXT_PUBLIC_*`. A tela de Integrações exibe apenas o estado da configuração, sem revelar chaves ou prometer conectividade já validada.

## Verificações

```powershell
npm run typecheck
npm test
npm run test:workflow
npm run build
npm run test:http
```

O teste HTTP inicia e encerra seu próprio servidor, usa um banco temporário e não altera sua loja. Ele exige o build anterior. Se a porta 3467 estiver ocupada, libere-a antes de executá-lo. Consulte [docs/VERIFICACAO.md](docs/VERIFICACAO.md).

Para executar o build local:

```powershell
npm run build
npm start
```

## Hospedagem e dados

Use servidor/contêiner Node 24 com **disco persistente**, um único processo da aplicação e HTTPS. O projeto inclui Dockerfile e Compose:

```powershell
docker compose up --build -d
```

Configure `APP_URL` com a origem exata usada pelo navegador, incluindo porta quando houver. Para abrir o checkout no celular e receber webhooks externos, é necessário um domínio HTTPS acessível ou um túnel configurado. `localhost` no celular não aponta para o seu computador.

Esta implementação com SQLite local **não deve ser enviada sem adaptação para Vercel serverless, hospedagem estática ou Workers**. Para múltiplas réplicas, migre a persistência e as transações para um banco compartilhado. Consulte [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

Faça backup consistente enquanto a aplicação está em execução:

```powershell
npm run backup
```

Os backups contêm dados da operação. Para restaurar, pare a aplicação, preserve o banco atual, substitua o arquivo pelo backup e remova arquivos `-wal` e `-shm` antigos **somente depois de encerrar todos os processos que usam o banco**. Reinicie e verifique seus registros.

## Documentação

- [Arquitetura e decisões](docs/ARQUITETURA.md)
- [Integrações e comparação n8n × Workers AI](docs/INTEGRACOES.md)
- [Contrato das rotas](docs/API.md)
- [Roteiro de demonstração](docs/DEMONSTRACAO.md)
- [Verificação e limites da entrega](docs/VERIFICACAO.md)

## Escopo e direitos

Aplicação de uma loja e um administrador. Não inclui usuários de equipe, multitenancy, gateway financeiro real, emissão fiscal, sincronização Tray ou garantia de entrega por APIs de terceiros. Não há licença de distribuição definida neste pacote; escolha os termos antes de disponibilizar o código publicamente. As marcas citadas pertencem aos seus respectivos titulares.
