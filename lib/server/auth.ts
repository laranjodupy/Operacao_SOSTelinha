import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db.ts";
import { fail } from "./validation.ts";

export const cookieName = "tray_session";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function secureEqual(a: string, b: string) {
  const aa = createHash("sha256").update(a).digest();
  const bb = createHash("sha256").update(b).digest();
  return timingSafeEqual(aa, bb);
}
export function limit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  db().prepare("DELETE FROM rate_limits WHERE expiresAt<?").run(now);
  db()
    .prepare(
      "INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    )
    .run(key, now + windowMs);
  const r = db()
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .get(key) as { count: number };
  if (r.count > max) fail(429, "Muitas tentativas. Aguarde alguns minutos.");
}
export function login(email: unknown, password: unknown) {
  const expectedEmail = process.env.ADMIN_EMAIL,
    expectedPassword = process.env.ADMIN_PASSWORD,
    hash = process.env.ADMIN_PASSWORD_HASH;
  if (!expectedEmail || (!expectedPassword && !hash))
    fail(
      503,
      "Configure ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de entrar.",
    );
  let valid = false;
  if (typeof password === "string" && password.length <= 1024) {
    if (hash) {
      const [salt, hex] = hash.split(":");
      if (salt && hex && /^[a-f0-9]{128}$/.test(hex))
        valid = secureEqual(
          scryptSync(password, salt, 64).toString("hex"),
          hex,
        );
    } else valid = secureEqual(password, expectedPassword!);
  }
  if (
    typeof email !== "string" ||
    !secureEqual(email.toLowerCase().trim(), expectedEmail!.toLowerCase()) ||
    !valid
  )
    fail(401, "E-mail ou senha incorretos.");
  const token = randomBytes(32).toString("hex"),
    expiresAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
  db()
    .prepare("DELETE FROM sessions WHERE expiresAt<?")
    .run(new Date().toISOString());
  db()
    .prepare("INSERT INTO sessions VALUES(?,?)")
    .run(digest(token), expiresAt);
  return { token, expiresAt };
}
export function authenticated(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return false;
  return !!db()
    .prepare("SELECT tokenHash FROM sessions WHERE tokenHash=? AND expiresAt>?")
    .get(digest(token), new Date().toISOString());
}
export function requireAuth(request: NextRequest) {
  if (!authenticated(request)) fail(401, "Entre na sua conta para continuar.");
}
export function logout(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  if (token)
    db().prepare("DELETE FROM sessions WHERE tokenHash=?").run(digest(token));
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin"),
    expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected)
    fail(403, "Origem da requisição não autorizada.");
}
export function webhookAuth(request: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || secret.length < 24)
    fail(503, "Configure WEBHOOK_SECRET com pelo menos 24 caracteres.");
  if (!secureEqual(request.headers.get("x-webhook-secret") || "", secret!))
    fail(401, "Webhook não autorizado.");
}
