import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

let database: DatabaseSync | undefined;
export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export function db() {
  if (database) return database;
  const filename =
    process.env.DATABASE_PATH ||
    resolve(process.cwd(), "data/tray-balcao.sqlite");
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(/* turbopackIgnore: true */ filename)), {
      recursive: true,
    });
  database = new DatabaseSync(filename);
  database.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL CHECK(stock>=0), category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', unread INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), direction TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, externalId TEXT UNIQUE, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, customerName TEXT NOT NULL, conversationId TEXT REFERENCES conversations(id), token TEXT UNIQUE NOT NULL, status TEXT NOT NULL, items TEXT NOT NULL, subtotal INTEGER NOT NULL, deliveryFee INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, delivery TEXT NOT NULL DEFAULT 'pickup', address TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL, expiresAt TEXT NOT NULL, paidAt TEXT, idempotencyKey TEXT UNIQUE NOT NULL, requestHash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations (orderId TEXT NOT NULL REFERENCES orders(id), productId TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(orderId,productId));
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, detail TEXT NOT NULL, createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, expiresAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expiresAt INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId,createdAt);
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status,expiresAt);
    CREATE INDEX IF NOT EXISTS reservations_product ON reservations(productId);
    PRAGMA user_version=1;`);
  const initial = {
    name: "Papelaria Central",
    segment: "Papelaria de bairro",
    address: "Rua do Comércio, 120 · Centro",
    phone: "",
    pickupMinutes: 30,
    deliveryFee: 600,
    deliveryEnabled: true,
    welcome: "Olá! Que bom ter você por aqui. Como podemos ajudar?",
  };
  database
    .prepare("INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)")
    .run("settings", JSON.stringify(initial));
  return database;
}
export function transaction<T>(fn: () => T): T {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
export function log(action: string, detail: string) {
  db()
    .prepare("INSERT INTO audit VALUES(?,?,?,?)")
    .run(uid(), action, detail.slice(0, 1500), now());
}
