import { integrationUrl } from "../lib/server/integration-config.ts";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const supabase = process.env.DATABASE_PROVIDER === 'supabase' || (process.env.DATABASE_PROVIDER !== 'postgres' && process.env.DATABASE_PROVIDER !== 'sqlite' && !!(process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
const supabaseAuth=!!process.env.VERCEL || process.env.AUTH_PROVIDER==='supabase' || (process.env.AUTH_PROVIDER!=='local' && !!process.env.SUPABASE_URL);
const checks = [
  ['Supabase Auth configurado', !supabaseAuth || !!(process.env.SUPABASE_URL && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY))],
  ['Supabase URL e chave configuradas', !supabase || !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY))],
  ["Banco remoto configurado na Vercel", !process.env.VERCEL || !!process.env.DATABASE_URL || supabase],
  ["Node.js >= 24", Number(process.versions.node.split(".")[0]) >= 24],
  [
    "Credenciais do administrador",
    !!(
      process.env.ADMIN_EMAIL &&
      (supabaseAuth || process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH)
    ),
  ],
  [
    "Senha de exemplo substituída",
    supabaseAuth || process.env.ADMIN_PASSWORD !== "troque-por-uma-senha-longa-e-exclusiva",
  ],
  ["APP_URL configurada", !!process.env.APP_URL],
  [
    "Provedor de IA válido",
    ["local", "n8n", "cloudflare"].includes(process.env.AI_PROVIDER || "local"),
  ],
  [
    "Provedor de WhatsApp válido",
    ["demo", "evolution"].includes(process.env.WHATSAPP_PROVIDER || "demo"),
  ],
];
if (process.env.AI_PROVIDER === "n8n")
  checks.push([
    "n8n configurado",
    !!(process.env.N8N_AI_WEBHOOK_URL && process.env.N8N_AI_SECRET),
  ]);
if (process.env.AI_PROVIDER === "cloudflare")
  checks.push([
    "Workers AI configurado",
    !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
  ]);
if (process.env.WHATSAPP_PROVIDER === "evolution")
  checks.push(
    [
      "WhatsApp configurado",
      !!(
        process.env.WHATSAPP_BASE_URL &&
        process.env.WHATSAPP_INSTANCE &&
        process.env.WHATSAPP_API_KEY
      ),
    ],
    [
      "Segredo do webhook >= 24 caracteres",
      (process.env.WEBHOOK_SECRET || "").length >= 24,
    ],
  );
if (process.env.AI_PROVIDER === "n8n" && process.env.N8N_AI_WEBHOOK_URL) {
  try {
    integrationUrl(process.env.N8N_AI_WEBHOOK_URL, "N8N_AI_WEBHOOK_URL");
    checks.push(["URL de destino do n8n permitida", true]);
  } catch (e) {
    checks.push(["URL de destino do n8n permitida", false]);
    console.error(e.message);
  }
}
console.log(
  `Provedor de IA selecionado: ${process.env.AI_PROVIDER || "local"}`,
);
for (const [label, ok] of checks)
  console.log(`${ok ? "OK" : "PENDENTE"} · ${label}`);
console.log(
  "\nNão faz chamadas externas e não exibe segredos. Consulte docs/INTEGRACOES.md para validar conexões reais.",
);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
