// Run against a dedicated local TEST database, never against a real shop.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const base =
  process.env.TEST_URL || process.env.APP_URL || "http://localhost:3000";
const url = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  process.env.DEMO_MODE === "false"
)
  throw new Error(
    "Use este roteiro somente em localhost com DEMO_MODE=true e banco de teste.",
  );
let cookie = "";
async function call(path, method = "GET", body, key, extra = {}) {
  const r = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      Origin: base,
      ...(cookie ? { cookie } : {}),
      ...(key ? { "idempotency-key": key } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  return { r, data };
}
assert.equal((await call("dashboard")).r.status, 401);
let r = await call("login", "POST", {
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
assert.equal(r.r.status, 200);
cookie = r.r.headers.get("set-cookie").split(";")[0];
assert.ok(cookie.startsWith("tray_session="));
assert.equal(
  (
    await call("settings", "PUT", {}, undefined, {
      Origin: "https://malicious.example",
    })
  ).r.status,
  403,
);
assert.equal(
  (
    await call("webhooks/whatsapp", "POST", {
      phone: "5579999998888",
      name: "Cliente teste",
      text: "Olá",
      externalId: "qa",
    })
  ).r.status,
  401,
);
assert.equal((await call("demo/seed", "POST")).r.status, 200);
const p = await call("products", "POST", {
  name: "Produto QA",
  sku: `QA-${Date.now()}`,
  price: 1234,
  stock: 2,
  description: "Produto de teste descartável",
  category: "QA",
  active: true,
});
assert.equal(p.r.status, 201);
const batch = [
  {
    name: "Produto lote A",
    sku: `BATCH-A-${Date.now()}`,
    price: 1000,
    stock: 5,
    category: "QA",
  },
  {
    name: "Produto lote B",
    sku: `BATCH-B-${Date.now()}`,
    price: 1500,
    stock: 2,
    category: "QA",
  },
];
const batchKey = crypto.randomUUID();
const createdBatch = await call(
  "products/batch",
  "POST",
  { products: batch },
  batchKey,
);
assert.equal(createdBatch.r.status, 201);
assert.equal(createdBatch.data.count, 2);
assert.equal(
  (await call("products/batch", "POST", { products: batch }, batchKey)).data
    .duplicate,
  true,
);
const event = {
  phone: "5579999998888",
  name: "Cliente QA",
  text: "Quero comprar",
  externalId: `smoke-${Date.now()}`,
};
r = await call("webhooks/whatsapp", "POST", event, undefined, {
  "x-webhook-secret": process.env.WEBHOOK_SECRET,
});
assert.equal(r.r.status, 200);
const conv = r.data.conversationId;
r = await call("webhooks/whatsapp", "POST", event, undefined, {
  "x-webhook-secret": process.env.WEBHOOK_SECRET,
});
assert.equal(r.data.duplicate, true);
const key = crypto.randomUUID(),
  payload = {
    customerName: "Cliente QA",
    conversationId: conv,
    items: [{ productId: p.data.id, quantity: 2 }],
  };
r = await call("orders", "POST", payload, key);
assert.equal(r.r.status, 201);
const o = r.data;
assert.equal((await call("orders", "POST", payload, key)).data.id, o.id);
assert.equal(
  (await call("orders", "POST", payload, crypto.randomUUID())).r.status,
  409,
);
r = await call(`checkout/${o.token}`);
assert.equal(r.r.status, 200);
assert.equal(r.data.order.subtotal, 2468);
assert.equal(r.data.demo, true);
assert.equal(
  (await call(`checkout/${o.token}/pay`, "POST", { delivery: "pickup" })).r
    .status,
  200,
);
assert.equal(
  (await call(`checkout/${o.token}/pay`, "POST", { delivery: "pickup" })).r
    .status,
  200,
);
r = await call("dashboard");
assert.equal(r.data.products.find((x) => x.id === p.data.id).stock, 0);
for (const status of ["preparing", "ready", "delivered"])
  assert.equal(
    (await call(`orders/${o.id}`, "PATCH", { status })).r.status,
    200,
  );
assert.equal(
  (await call(`orders/${o.id}`, "PATCH", { status: "cancelled" })).r.status,
  409,
);
await call("logout", "POST");
assert.equal((await call("dashboard")).r.status, 401);
console.log(
  "OK: autenticação, CSRF, webhook autenticado e duplicado, pedido idempotente, overselling, checkout público, pagamento repetido, estoque e preparação.",
);
