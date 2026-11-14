import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "tray-balcao-test-"));
const env = {
  ...process.env,
  PORT: "3467",
  HOSTNAME: "127.0.0.1",
  APP_URL: "http://127.0.0.1:3467",
  TEST_URL: "http://127.0.0.1:3467",
  DATABASE_PATH: join(dir, "test.sqlite"),
  ADMIN_EMAIL: "test@example.test",
  ADMIN_PASSWORD: "synthetic-test-password",
  DEMO_MODE: "true",
  AI_PROVIDER: "local",
  WHATSAPP_PROVIDER: "demo",
  WEBHOOK_SECRET: "synthetic-webhook-secret-for-tests",
};
let server;
async function start() {
  const child = spawn(process.execPath, [".next/standalone/server.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostic = "";
  child.stderr.on("data", (d) => (diagnostic += d.toString()));
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(`${env.APP_URL}/api/health`);
      if (r.ok) return child;
    } catch {}
    await setTimeout(100);
  }
  child.kill();
  throw new Error(`Servidor de teste não iniciou: ${diagnostic}`);
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const ended = once(server, "exit");
  server.kill();
  await ended;
}
try {
  server = await start();
  const code = await new Promise((resolve) =>
    spawn(process.execPath, ["scripts/smoke.mjs"], {
      env,
      stdio: "inherit",
    }).on("exit", resolve),
  );
  if (code !== 0) throw new Error("O teste HTTP falhou.");
  await stop();
  server = await start();
  const login = await fetch(`${env.APP_URL}/api/login`, {
    method: "POST",
    headers: { Origin: env.APP_URL, "content-type": "application/json" },
    body: JSON.stringify({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const d = await (
    await fetch(`${env.APP_URL}/api/dashboard`, { headers: { cookie } })
  ).json();
  assert.ok(d.orders.some((o) => o.status === "delivered"));
  assert.equal(d.products.find((p) => p.name === "Produto QA").stock, 0);
  console.log(
    "OK: pedidos e estoque preservados após encerrar e reiniciar o servidor.",
  );
} finally {
  await stop();
  rmSync(dir, { recursive: true, force: true });
}
