import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import {
  integrationUrl,
  aiTimeoutMs,
} from "../lib/server/integration-config.ts";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const provider = process.env.AI_PROVIDER || "local";
console.log(`Provedor selecionado: ${provider}`);
console.log(
  "Teste com texto fictício. Não cadastra produtos; pode consumir uma pequena quantidade da cota de IA.",
);
try {
  let url, headers, body;
  if (provider === "cloudflare") {
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)
      throw new Error(
        "Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN.",
      );
    url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct"}`;
    headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
    };
    body = {
      messages: [{ role: "user", content: "Responda somente OK." }],
      max_tokens: 10,
    };
  } else if (provider === "n8n") {
    if (!process.env.N8N_AI_WEBHOOK_URL || !process.env.N8N_AI_SECRET)
      throw new Error("Configure a URL e o segredo do webhook n8n.");
    url = process.env.N8N_AI_WEBHOOK_URL;
    headers = {
      "content-type": "application/json",
      "x-ai-secret": process.env.N8N_AI_SECRET,
    };
    body = {
      task: "extract_product",
      input: {
        text: "Um caderno por 10 reais, uma unidade.",
        image: null,
        audio: null,
      },
      catalog: [],
    };
  } else
    throw new Error(
      "O modo local não chama uma IA. Selecione cloudflare ou n8n no .env.local.",
    );
  const r = await fetch(
    integrationUrl(
      url,
      provider === "n8n" ? "N8N_AI_WEBHOOK_URL" : "Cloudflare Workers AI",
    ),
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(aiTimeoutMs()),
    },
  );
  console.log(`Resposta HTTP: ${r.status}`);
  if (!r.ok) {
    const hint =
      r.status === 401 || r.status === 403
        ? "Confira credenciais, permissões e requisitos do modelo."
        : r.status === 404
          ? "Confira URL, modelo e publicação do workflow."
          : r.status === 429
            ? "Confira cotas e limites de uso."
            : "Confira o painel do provedor.";
    throw new Error(hint);
  }
  const data = await r.json();
  if (
    provider === "cloudflare" &&
    (data.success === false || !data.result?.response)
  )
    throw new Error(
      "A Cloudflare respondeu, mas não retornou uma inferência válida.",
    );
  if (provider === "n8n" && !data.product && !Array.isArray(data.products))
    throw new Error(
      "O webhook respondeu, mas falta product/products. Confira Respond to Webhook e o workflow importado.",
    );
  console.log(
    "OK: conexão e resposta básica confirmadas. O conteúdo retornado e as credenciais não são exibidos.",
  );
} catch (e) {
  console.error(`FALHOU: ${e.message}`);
  process.exitCode = 1;
}
