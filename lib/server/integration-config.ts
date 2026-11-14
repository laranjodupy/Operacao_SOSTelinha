import { fail } from "./validation.ts";

export function integrationUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      503,
      `${label}: configure uma URL completa, começando com https://.`,
    );
  }
  if (url!.username || url!.password)
    fail(
      503,
      `${label}: configure a autenticação nas credenciais, sem usuário ou senha na URL.`,
    );
  if (process.env.VERCEL && ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(url!.hostname))
    fail(503, `${label}: na Vercel configure um endereço público HTTPS do serviço.`);
  if (url!.protocol === "https:") return url!;
  const loopback = [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "host.docker.internal",
  ].includes(url!.hostname);
  if (
    url!.protocol === "http:" &&
    loopback &&
    process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS === "true"
  )
    return url!;
  if (url!.protocol === "http:" && loopback)
    fail(
      503,
      `${label} usa HTTP em localhost. Para um n8n local, defina ALLOW_INSECURE_LOCAL_INTEGRATIONS=true no .env.local e reinicie o servidor. Para um n8n remoto, use sua URL HTTPS.`,
    );
  return fail(
    503,
    `${label}: a URL de destino precisa usar HTTPS. Rodar o site em localhost não impede chamadas HTTPS. Confira N8N_AI_WEBHOOK_URL e não use a URL do próprio Tray Balcão.`,
  );
}
export function aiTimeoutMs() {
  const n = Number(process.env.AI_TIMEOUT_MS || 45000);
  return Number.isFinite(n) ? Math.min(120000, Math.max(5000, n)) : 45000;
}
