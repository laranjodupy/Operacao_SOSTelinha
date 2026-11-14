import { createHash, randomBytes } from "node:crypto";
import { db, log, now, transaction, uid } from "./db.ts";
import { fail, flag, integer, phone, record, text } from "./validation.ts";
import type {
  Audit,
  Conversation,
  Message,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  Settings,
  Snapshot,
} from "../types.ts";

type Row = Record<string, any>;
const orderRow = (r: Row): Order =>
  ({ ...r, items: JSON.parse(r.items) }) as Order;
export function settings(): Settings {
  return JSON.parse(
    (db().prepare("SELECT value FROM meta WHERE key=?").get("settings") as Row)
      .value,
  );
}
export function saveSettings(input: unknown) {
  const b = record(input);
  const s: Settings = {
    name: text(b.name, "Nome da loja", 100),
    segment: text(b.segment, "Segmento", 80),
    address: text(b.address, "Endereço", 300),
    phone: b.phone ? phone(b.phone) : "",
    pickupMinutes: integer(b.pickupMinutes, "Tempo de retirada", 1, 1440),
    deliveryFee: integer(b.deliveryFee, "Taxa de entrega", 0, 100_000),
    deliveryEnabled: flag(b.deliveryEnabled, "Entrega"),
    welcome: text(b.welcome, "Saudação", 600),
  };
  transaction(() => {
    db()
      .prepare("UPDATE meta SET value=? WHERE key=?")
      .run(JSON.stringify(s), "settings");
    log("store.updated", "Dados da loja atualizados");
  });
  return s;
}
export function expireOrders() {
  transaction(() => {
    const expired = db()
      .prepare(
        "SELECT id,number FROM orders WHERE status='pending' AND expiresAt<=?",
      )
      .all(now()) as Row[];
    for (const r of expired) {
      db().prepare("UPDATE orders SET status='expired' WHERE id=?").run(r.id);
      db().prepare("DELETE FROM reservations WHERE orderId=?").run(r.id);
      log("order.expired", `${r.number}: reserva liberada`);
    }
  });
}
export function products(): Product[] {
  return (
    db()
      .prepare(
        "SELECT p.*, COALESCE((SELECT SUM(quantity) FROM reservations r WHERE r.productId=p.id),0) AS reserved FROM products p ORDER BY createdAt DESC, name",
      )
      .all() as Row[]
  ).map(
    (r) =>
      ({
        ...r,
        active: !!r.active,
        available: r.stock - r.reserved,
      }) as Product,
  );
}
export function saveProduct(input: unknown, id?: string) {
  const b = record(input);
  const p = {
    id: id || uid(),
    name: text(b.name, "Produto", 160),
    sku: text(b.sku, "SKU", 50),
    description: text(b.description, "Descrição", 1000, true),
    price: integer(b.price, "Preço em centavos", 1, 100_000_000),
    stock: integer(b.stock, "Estoque", 0, 1_000_000),
    category: text(b.category, "Categoria", 70),
    active: b.active === undefined ? true : flag(b.active, "Ativo"),
  };
  expireOrders();
  transaction(() => {
    if (id) {
      if (!db().prepare("SELECT id FROM products WHERE id=?").get(id))
        fail(404, "Produto não encontrado.");
      const reserved = (
        db()
          .prepare(
            "SELECT COALESCE(SUM(quantity),0) AS n FROM reservations WHERE productId=?",
          )
          .get(id) as Row
      ).n;
      if (p.stock < reserved)
        fail(
          409,
          `Existem ${reserved} unidades reservadas. O estoque físico não pode ser menor.`,
        );
      db()
        .prepare(
          "UPDATE products SET name=?,sku=?,description=?,price=?,stock=?,category=?,active=? WHERE id=?",
        )
        .run(
          p.name,
          p.sku,
          p.description,
          p.price,
          p.stock,
          p.category,
          Number(p.active),
          id,
        );
    } else
      db()
        .prepare("INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          p.id,
          p.name,
          p.sku,
          p.description,
          p.price,
          p.stock,
          p.category,
          Number(p.active),
          now(),
        );
    log(id ? "product.updated" : "product.created", p.name);
  });
  return products().find((x) => x.id === p.id)!;
}
export function conversations(): Conversation[] {
  return (
    db()
      .prepare("SELECT * FROM conversations ORDER BY updatedAt DESC")
      .all() as Row[]
  ).map(
    (c) =>
      ({
        ...c,
        messages: db()
          .prepare(
            "SELECT id,direction,text,status,createdAt FROM messages WHERE conversationId=? ORDER BY createdAt,id",
          )
          .all(c.id) as Message[],
      }) as Conversation,
  );
}
export function receive(input: unknown, source = "demo") {
  const b = record(input),
    number = phone(b.phone),
    name = text(b.name || "Cliente", "Nome", 100),
    content = text(b.text, "Mensagem", 4000),
    externalId = text(b.externalId, "Identificador do evento", 200);
  return transaction(() => {
    const duplicate = db()
      .prepare("SELECT conversationId FROM messages WHERE externalId=?")
      .get(`${source}:${externalId}`) as Row | undefined;
    if (duplicate)
      return { conversationId: duplicate.conversationId, duplicate: true };
    let c = db()
      .prepare("SELECT id FROM conversations WHERE phone=?")
      .get(number) as Row | undefined;
    if (!c) {
      c = { id: uid() };
      db()
        .prepare("INSERT INTO conversations VALUES(?,?,?,?,?,?,?)")
        .run(c.id, name, number, source, "open", 0, now());
    }
    db()
      .prepare(
        "UPDATE conversations SET name=?,unread=unread+1,status=?,updatedAt=? WHERE id=?",
      )
      .run(name, "open", now(), c.id);
    db()
      .prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?)")
      .run(
        uid(),
        c.id,
        "in",
        content,
        "received",
        `${source}:${externalId}`,
        now(),
      );
    log("message.received", `Mensagem recebida de ${name}`);
    return { conversationId: c.id, duplicate: false };
  });
}
export function updateConversation(id: string, input: unknown) {
  const b = record(input);
  if (!["open", "closed"].includes(String(b.status)))
    fail(400, "Status de conversa inválido.");
  if (
    !db()
      .prepare("UPDATE conversations SET unread=0,status=? WHERE id=?")
      .run(String(b.status), id).changes
  )
    fail(404, "Conversa não encontrada.");
}
export function orderById(id: string) {
  const row = db().prepare("SELECT * FROM orders WHERE id=?").get(id) as
    | Row
    | undefined;
  if (!row) fail(404, "Pedido não encontrado.");
  return orderRow(row!);
}
export function orderByToken(token: string) {
  const row = db().prepare("SELECT * FROM orders WHERE token=?").get(token) as
    | Row
    | undefined;
  if (!row) fail(404, "Link de compra não encontrado.");
  return orderRow(row!);
}
export function createOrder(input: unknown, key: string) {
  const b = record(input);
  text(key, "Chave de idempotência", 120);
  const customerName = text(b.customerName, "Cliente", 100),
    conversationId = b.conversationId
      ? text(b.conversationId, "Conversa", 80)
      : null;
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 30)
    fail(400, "Selecione de 1 a 30 produtos.");
  const itemsInput = (b.items as unknown[])
    .map((x) => {
      const r = record(x);
      return {
        productId: text(r.productId, "Produto", 80),
        quantity: integer(r.quantity, "Quantidade", 1, 999),
      };
    })
    .sort((a, b) => a.productId.localeCompare(b.productId));
  if (new Set(itemsInput.map((x) => x.productId)).size !== itemsInput.length)
    fail(400, "Agrupe as quantidades do mesmo produto.");
  const hash = createHash("sha256")
    .update(JSON.stringify({ customerName, conversationId, itemsInput }))
    .digest("hex");
  expireOrders();
  return transaction(() => {
    const existing = db()
      .prepare("SELECT * FROM orders WHERE idempotencyKey=?")
      .get(key) as Row | undefined;
    if (existing) {
      if (existing.requestHash !== hash)
        fail(409, "Essa chave já foi usada para outro pedido.");
      return orderRow(existing);
    }
    if (
      conversationId &&
      !db()
        .prepare("SELECT id FROM conversations WHERE id=?")
        .get(conversationId)
    )
      fail(404, "Conversa não encontrada.");
    const catalog = products();
    const items: OrderItem[] = itemsInput.map((x) => {
      const p = catalog.find((p) => p.id === x.productId);
      if (!p || !p.active) fail(400, "Produto indisponível.");
      if (p!.available < x.quantity)
        fail(
          409,
          `Estoque insuficiente: ${p!.name}. Disponível: ${p!.available}.`,
        );
      return { ...x, name: p!.name, unitPrice: p!.price };
    });
    const count = (
      db().prepare("SELECT COUNT(*) AS n FROM orders").get() as Row
    ).n;
    const o: Order = {
      id: uid(),
      number: `TB-${String(count + 1).padStart(4, "0")}`,
      customerName,
      conversationId,
      token: randomBytes(24).toString("hex"),
      status: "pending",
      items,
      subtotal: items.reduce((a, x) => a + x.unitPrice * x.quantity, 0),
      deliveryFee: 0,
      total: 0,
      delivery: "pickup",
      address: "",
      createdAt: now(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      paidAt: null,
    };
    o.total = o.subtotal;
    db()
      .prepare("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        o.id,
        o.number,
        o.customerName,
        o.conversationId,
        o.token,
        o.status,
        JSON.stringify(items),
        o.subtotal,
        0,
        o.total,
        o.delivery,
        "",
        o.createdAt,
        o.expiresAt,
        null,
        key,
        hash,
      );
    for (const i of items)
      db()
        .prepare("INSERT INTO reservations VALUES(?,?,?)")
        .run(o.id, i.productId, i.quantity);
    log("order.created", `${o.number}: estoque reservado por 30 minutos`);
    return o;
  });
}
export function payDemo(token: string, input: unknown) {
  if (process.env.DEMO_MODE === "false")
    fail(
      403,
      "Pagamento simulado está desativado. Não há gateway real configurado.",
    );
  const b = record(input);
  if (b.delivery !== "pickup" && b.delivery !== "local")
    fail(400, "Escolha retirada ou entrega local.");
  const address =
    b.delivery === "local" ? text(b.address, "Endereço de entrega", 400) : "";
  expireOrders();
  return transaction(() => {
    const o = orderByToken(token);
    if (["paid", "preparing", "ready", "delivered"].includes(o.status))
      return o;
    if (o.status !== "pending")
      fail(
        409,
        "Este link não está mais disponível. Solicite um novo link à loja.",
      );
    const s = settings();
    if (b.delivery === "local" && !s.deliveryEnabled)
      fail(409, "A entrega local está desativada.");
    for (const i of o.items) {
      const changed = db()
        .prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?")
        .run(i.quantity, i.productId, i.quantity).changes;
      if (!changed) fail(409, "O estoque mudou. Entre em contato com a loja.");
    }
    const fee = b.delivery === "local" ? s.deliveryFee : 0;
    db()
      .prepare(
        "UPDATE orders SET status='paid',paidAt=?,delivery=?,address=?,deliveryFee=?,total=? WHERE id=?",
      )
      .run(now(), String(b.delivery), address, fee, o.subtotal + fee, o.id);
    db().prepare("DELETE FROM reservations WHERE orderId=?").run(o.id);
    log(
      "payment.simulated",
      `${o.number}: pagamento de demonstração confirmado`,
    );
    return orderById(o.id);
  });
}
export function transitionOrder(id: string, input: unknown) {
  const b = record(input);
  expireOrders();
  return transaction(() => {
    const o = orderById(id),
      status = String(b.status) as OrderStatus;
    const next: Record<OrderStatus, OrderStatus[]> = {
      pending: ["cancelled"],
      paid: ["preparing"],
      preparing: o.delivery === "pickup" ? ["ready"] : ["delivered"],
      ready: ["delivered"],
      delivered: [],
      cancelled: [],
      expired: [],
    };
    if (!next[o.status].includes(status))
      fail(409, "Mudança de status não permitida para este pedido.");
    db().prepare("UPDATE orders SET status=? WHERE id=?").run(status, id);
    if (status === "cancelled")
      db().prepare("DELETE FROM reservations WHERE orderId=?").run(id);
    log("order.status", `${o.number}: ${status}`);
    return orderById(id);
  });
}
export function seedDemo() {
  if (process.env.DEMO_MODE === "false")
    fail(403, "Modo de demonstração desativado.");
  if (db().prepare("SELECT value FROM meta WHERE key=?").get("demoSeeded"))
    return { seeded: false };
  // Seeding is additive and never resets real records.
  transaction(() => {
    const samples = [
      [
        "Mochila Escolar Preta",
        "MOC-001",
        "Alças acolchoadas · compartimento para notebook",
        8990,
        4,
        "Mochilas",
      ],
      [
        "Caderno 10 Matérias",
        "CAD-010",
        "Capa dura · 160 folhas",
        2490,
        8,
        "Cadernos",
      ],
      [
        "Kit Canetas Gel",
        "CAN-006",
        "6 cores · escrita macia",
        1990,
        12,
        "Escrita",
      ],
      [
        "Calculadora Científica",
        "CAL-001",
        "240 funções · capa protetora",
        4500,
        10,
        "Acessórios",
      ],
      [
        "Estojo Duplo",
        "EST-002",
        "Dois compartimentos · azul marinho",
        1690,
        3,
        "Acessórios",
      ],
      [
        "Lápis de Cor 24 Cores",
        "LAP-024",
        "Cores vivas · caixa com 24 unidades",
        3290,
        6,
        "Escrita",
      ],
    ];
    for (const [name, sku, description, price, stock, category] of samples)
      db()
        .prepare("INSERT OR IGNORE INTO products VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          uid(),
          name!,
          sku!,
          description!,
          price!,
          stock!,
          category!,
          1,
          now(),
        );
    db().prepare("INSERT INTO meta VALUES(?,?)").run("demoSeeded", "true");
    log(
      "demo.loaded",
      "Catálogo fictício adicionado, sem apagar dados existentes",
    );
  });
  receive(
    {
      name: "Mariana Costa",
      phone: "5579999990001",
      text: "Oi! Vocês têm mochila escolar preta e kit de canetas gel? Quero retirar hoje.",
      externalId: "seed-mariana",
    },
    "demo",
  );
  receive(
    {
      name: "João Pedro",
      phone: "5579999990002",
      text: "Boa tarde! Preciso de 2 cadernos de 10 matérias. Fazem entrega no Centro?",
      externalId: "seed-joao",
    },
    "demo",
  );
  return { seeded: true };
}
export function snapshot(): Snapshot {
  expireOrders();
  const catalog = products(),
    orders = (
      db()
        .prepare("SELECT * FROM orders ORDER BY createdAt DESC")
        .all() as Row[]
    ).map(orderRow);
  const day = (date: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(date),
    );
  const today = day(now()),
    paid = orders.filter((o) => o.paidAt && day(o.paidAt) === today),
    pending = orders.filter((o) => o.status === "pending");
  return {
    products: catalog,
    conversations: conversations(),
    orders,
    settings: settings(),
    audit: db()
      .prepare(
        "SELECT * FROM audit ORDER BY createdAt DESC,rowid DESC LIMIT 80",
      )
      .all() as Audit[],
    integrations: {
      ai: process.env.AI_PROVIDER || "local",
      whatsapp: process.env.WHATSAPP_PROVIDER || "demo",
      n8n: !!process.env.N8N_AI_WEBHOOK_URL,
      cloudflare: !!(
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
      ),
      whatsappConfigured: !!(
        process.env.WHATSAPP_BASE_URL &&
        process.env.WHATSAPP_API_KEY &&
        process.env.WHATSAPP_INSTANCE
      ),
      demo: process.env.DEMO_MODE !== "false",
      webhookPath: "/api/webhooks/whatsapp",
    },
    metrics: {
      revenue: paid.reduce((a, o) => a + o.total, 0),
      paid: paid.length,
      pending: pending.length,
      lowStock: catalog.filter((p) => p.active && p.available <= 3).length,
      conversion: orders.length
        ? Math.round(
            (orders.filter((o) => !!o.paidAt).length / orders.length) * 100,
          )
        : 0,
    },
  };
}
