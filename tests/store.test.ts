import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, transaction } from "../lib/server/db.ts";
import {
  createOrder,
  expireOrders,
  orderByToken,
  payDemo,
  products,
  receive,
  saveProduct,
  seedDemo,
  snapshot,
  transitionOrder,
} from "../lib/server/store.ts";
import { inbound, aiTask, sendMessage } from "../lib/server/integrations.ts";
import { secureEqual, login, limit } from "../lib/server/auth.ts";
process.env.DATABASE_PATH = ":memory:";
process.env.DEMO_MODE = "true";
process.env.AI_PROVIDER = "local";
process.env.WHATSAPP_PROVIDER = "demo";
beforeEach(() => {
  db().exec(
    "DELETE FROM reservations;DELETE FROM orders;DELETE FROM messages;DELETE FROM conversations;DELETE FROM products;DELETE FROM audit;DELETE FROM sessions;DELETE FROM rate_limits;DELETE FROM meta WHERE key='demoSeeded';",
  );
});
const product = (stock = 4) =>
  saveProduct({
    name: "Caderno 10 Matérias",
    sku: "CAD-001",
    description: "Capa dura",
    price: 2490,
    stock,
    category: "Cadernos",
    active: true,
  });
const order = (p: ReturnType<typeof product>, quantity = 1, key = "key-1") =>
  createOrder(
    { customerName: "Daniel", items: [{ productId: p.id, quantity }] },
    key,
  );
test("reserve, delivery payment and replay preserve cents and decrement inventory exactly once", () => {
  const p = product(),
    o = order(p, 2);
  assert.equal(o.total, 4980);
  assert.equal(products()[0].stock, 4);
  assert.equal(products()[0].reserved, 2);
  assert.equal(products()[0].available, 2);
  const paid = payDemo(o.token, {
    delivery: "local",
    address: "Rua de Teste, 10",
  });
  assert.equal(paid.total, 5580);
  assert.equal(paid.status, "paid");
  assert.equal(products()[0].stock, 2);
  assert.equal(products()[0].reserved, 0);
  payDemo(o.token, { delivery: "pickup" });
  assert.equal(products()[0].stock, 2);
  assert.equal(orderByToken(o.token).total, 5580);
  assert.equal(snapshot().metrics.revenue, 5580);
});
test("prevents overselling and duplicate line items", () => {
  const p = product(1);
  order(p);
  assert.throws(() => order(p, 1, "another"), /Estoque insuficiente/);
  assert.throws(
    () =>
      createOrder(
        {
          customerName: "Ana",
          items: [
            { productId: p.id, quantity: 1 },
            { productId: p.id, quantity: 1 },
          ],
        },
        "dupe",
      ),
    /Agrupe/,
  );
  assert.equal(products()[0].available, 0);
});
test("idempotent creation returns same order and rejects different payloads", () => {
  const p = product(),
    o = order(p);
  assert.equal(order(p).id, o.id);
  assert.equal(snapshot().orders.length, 1);
  assert.throws(() => order(p, 2), /outro pedido/);
  assert.equal(products()[0].reserved, 1);
});
test("expiry and cancellation release only their own reservations", () => {
  const p = product(5),
    a = order(p, 2),
    b = order(p, 1, "b");
  db()
    .prepare("UPDATE orders SET expiresAt=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", a.id);
  expireOrders();
  assert.equal(orderByToken(a.token).status, "expired");
  assert.equal(products()[0].reserved, 1);
  assert.throws(
    () => payDemo(a.token, { delivery: "pickup" }),
    /não está mais disponível/,
  );
  transitionOrder(b.id, { status: "cancelled" });
  assert.equal(products()[0].available, 5);
});
test("physical inventory cannot drop below reservations; snapshots survive price edits", () => {
  const p = product(4),
    o = order(p, 2);
  assert.throws(() => saveProduct({ ...p, stock: 1 }, p.id), /reservadas/);
  saveProduct({ ...p, price: 9999, stock: 4 }, p.id);
  assert.equal(orderByToken(o.token).subtotal, 4980);
  assert.equal(payDemo(o.token, { delivery: "pickup" }).total, 4980);
});
test("payment and fulfillment transitions cannot be forged through status API", () => {
  const p = product(),
    o = order(p);
  assert.throws(
    () => transitionOrder(o.id, { status: "paid" }),
    /não permitida/,
  );
  payDemo(o.token, { delivery: "pickup" });
  transitionOrder(o.id, { status: "preparing" });
  transitionOrder(o.id, { status: "ready" });
  transitionOrder(o.id, { status: "delivered" });
  assert.throws(
    () => transitionOrder(o.id, { status: "cancelled" }),
    /não permitida/,
  );
});
test("transaction rollback restores all writes on a failure", () => {
  const p = product();
  assert.throws(() =>
    transaction(() => {
      db().prepare("UPDATE products SET stock=0 WHERE id=?").run(p.id);
      throw new Error("rollback");
    }),
  );
  assert.equal(products()[0].stock, 4);
});
test("normalised webhook is idempotent and Evolution ignores outbound/groups", () => {
  const input = {
    phone: "5579999999999",
    name: "Ana",
    text: "Tem caderno?",
    externalId: "event-1",
  };
  const a = inbound(input),
    b = inbound(input);
  assert.equal((a as any).conversationId, (b as any).conversationId);
  assert.equal((b as any).duplicate, true);
  assert.equal(snapshot().conversations[0].messages.length, 1);
  assert.deepEqual(
    inbound({ event: "messages.upsert", data: { key: { fromMe: true } } }),
    { ignored: true },
  );
  assert.deepEqual(
    inbound({
      event: "messages.upsert",
      data: { key: { remoteJid: "123@g.us" } },
    }),
    { ignored: true },
  );
  inbound({
    event: "messages.upsert",
    instance: "shop",
    data: {
      key: { id: "abc", remoteJid: "5579999999999@s.whatsapp.net" },
      pushName: "Ana",
      message: { extendedTextMessage: { text: "Olá!" } },
    },
  });
  assert.equal(snapshot().conversations[0].messages.length, 2);
});
test("local suggestions disclose local matching and never pretend to extract photographs", async () => {
  const p = product();
  const result = (await aiTask({
    task: "suggest",
    text: "Vocês têm caderno?",
  })) as any;
  assert.equal(result.provider, "local");
  assert.equal(result.items[0].productId, p.id);
  await assert.rejects(
    () => aiTask({ task: "extract_product", text: "caderno 20 reais" }),
    /configure n8n ou Cloudflare/,
  );
});
test("outbound messages deduplicate by key without resending", async () => {
  const c = receive({
    name: "Ana",
    phone: "5579999999999",
    text: "Olá",
    externalId: "in",
  });
  const a = await sendMessage(c.conversationId, { text: "Resposta" }, "out-1"),
    b = await sendMessage(c.conversationId, { text: "Resposta" }, "out-1");
  assert.equal(a.status, "simulated");
  assert.equal(b.duplicate, true);
  assert.equal(snapshot().conversations[0].messages.length, 2);
  await assert.rejects(
    () => sendMessage(c.conversationId, { text: "Diferente" }, "out-1"),
    /já usada/,
  );
});
test("demo seed is additive and repeat safe", () => {
  const p = product();
  seedDemo();
  seedDemo();
  assert.ok(products().some((x) => x.id === p.id));
  assert.equal(snapshot().conversations.length, 2);
});
test("no simulation payments when demo mode is off", () => {
  const p = product(),
    o = order(p);
  process.env.DEMO_MODE = "false";
  try {
    assert.throws(() => payDemo(o.token, { delivery: "pickup" }), /desativado/);
    assert.throws(() => seedDemo(), /desativado/);
  } finally {
    process.env.DEMO_MODE = "true";
  }
  assert.equal(products()[0].stock, 4);
});
test("credential comparison and bounded login attempts", () => {
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.ADMIN_PASSWORD = "test-password-only";
  assert.equal(secureEqual("a", "a"), true);
  assert.equal(secureEqual("a", "b"), false);
  assert.throws(() => login("admin@example.test", "wrong"), /incorretos/);
  assert.ok(login("ADMIN@example.test", "test-password-only").token);
  limit("test", 1, 1000);
  assert.throws(() => limit("test", 1, 1000), /Muitas tentativas/);
});
test("rejects fractional money, negative inventory and SQL-like payloads remain inert", () => {
  assert.throws(
    () =>
      saveProduct({
        name: "N",
        sku: "X",
        description: "",
        price: 24.9,
        stock: 2,
        category: "X",
      }),
    /Preço/,
  );
  const p = product();
  assert.throws(() => saveProduct({ ...p, stock: -1 }, p.id), /Estoque/);
  saveProduct({ ...p, name: "Teste'; DROP TABLE products;--" }, p.id);
  assert.equal(products().length, 1);
});

test("n8n adapter sends authenticated server requests and validates its response", async () => {
  const p = product(),
    original = globalThis.fetch;
  process.env.AI_PROVIDER = "n8n";
  process.env.N8N_AI_WEBHOOK_URL = "https://n8n.example.test/webhook/ai";
  process.env.N8N_AI_SECRET = "test-only";
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), process.env.N8N_AI_WEBHOOK_URL);
    assert.equal((init!.headers as any)["x-ai-secret"], "test-only");
    const body = JSON.parse(init!.body as string);
    assert.equal(body.task, "suggest");
    assert.equal(body.catalog[0].id, p.id);
    return Response.json({
      items: [{ productId: p.id, quantity: 2 }],
      reply: "Confira os itens.",
    });
  }) as typeof fetch;
  try {
    const r = (await aiTask({ task: "suggest", text: "Dois cadernos" })) as any;
    assert.equal(r.provider, "n8n");
    assert.equal(r.items[0].quantity, 2);
  } finally {
    globalThis.fetch = original;
    process.env.AI_PROVIDER = "local";
  }
});
test("external AI never gets to invent product IDs or change inventory", async () => {
  const p = product(),
    original = globalThis.fetch;
  process.env.AI_PROVIDER = "n8n";
  globalThis.fetch = (async () =>
    Response.json({
      items: [{ productId: "invented", quantity: 1 }],
      reply: "Olá",
    })) as typeof fetch;
  try {
    await assert.rejects(
      () => aiTask({ task: "suggest", text: "caderno" }),
      /fora do catálogo/,
    );
    assert.equal(products()[0].stock, p.stock);
  } finally {
    globalThis.fetch = original;
    process.env.AI_PROVIDER = "local";
  }
});
test("direct Workers AI adapter sends image payload to vision model and validates cents", async () => {
  const original = globalThis.fetch;
  process.env.AI_PROVIDER = "cloudflare";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_API_TOKEN = "test-only";
  globalThis.fetch = (async (url, init) => {
    assert.ok(String(url).includes("llama-3.2-11b-vision-instruct"));
    const body = JSON.parse(init!.body as string);
    assert.ok(body.image.startsWith("data:image/png;base64,"));
    assert.equal((init!.headers as any).Authorization, "Bearer test-only");
    return Response.json({
      result: {
        response: JSON.stringify({
          product: {
            name: "Caderno",
            description: "Capa dura",
            price: 2490,
            stock: 5,
            category: "Cadernos",
          },
        }),
      },
    });
  }) as typeof fetch;
  try {
    const r = (await aiTask({
      task: "extract_product",
      image: { mimeType: "image/png", dataBase64: "AAAA" },
    })) as any;
    assert.equal(r.product.price, 2490);
    assert.equal(products().length, 0);
  } finally {
    globalThis.fetch = original;
    process.env.AI_PROVIDER = "local";
  }
});
test("Evolution adapter uses documented path and never sends to fictitious conversations", async () => {
  const original = globalThis.fetch;
  process.env.WHATSAPP_PROVIDER = "evolution";
  process.env.WHATSAPP_BASE_URL = "https://evolution.example.test";
  process.env.WHATSAPP_API_KEY = "test-only";
  process.env.WHATSAPP_INSTANCE = "shop";
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(
      String(url),
      "https://evolution.example.test/message/sendText/shop",
    );
    assert.deepEqual(JSON.parse(init!.body as string), {
      number: "5579999999999",
      text: "Teste",
    });
    return Response.json({ key: { id: "provider-id" } });
  }) as typeof fetch;
  try {
    const fake = receive(
      {
        name: "Fictício",
        phone: "5579999999998",
        text: "Oi",
        externalId: "fake",
      },
      "demo",
    );
    await assert.rejects(
      () => sendMessage(fake.conversationId, { text: "Teste" }, "key-fake"),
      /fictícias/,
    );
    assert.equal(calls, 0);
    const real = receive(
      {
        name: "Teste",
        phone: "5579999999999",
        text: "Oi",
        externalId: "event",
      },
      "webhook",
    );
    assert.equal(
      (await sendMessage(real.conversationId, { text: "Teste" }, "real-key"))
        .status,
      "accepted",
    );
    await sendMessage(real.conversationId, { text: "Teste" }, "real-key");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    process.env.WHATSAPP_PROVIDER = "demo";
  }
});
test("unknown delivery outcome is retained and replay does not resend", async () => {
  const original = globalThis.fetch;
  process.env.WHATSAPP_PROVIDER = "evolution";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("timeout");
  }) as typeof fetch;
  try {
    const c = receive(
      {
        name: "Teste",
        phone: "5579999999999",
        text: "Oi",
        externalId: "event",
      },
      "webhook",
    );
    assert.equal(
      (await sendMessage(c.conversationId, { text: "Teste" }, "uncertain-key"))
        .status,
      "uncertain",
    );
    await sendMessage(c.conversationId, { text: "Teste" }, "uncertain-key");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    process.env.WHATSAPP_PROVIDER = "demo";
  }
});
