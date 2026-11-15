import "server-only";
import {supabaseAuthEnabled,signInSupabase,resolveSupabaseAuth,signOutSupabase,refreshCookieName,type AuthState} from './supabase-auth.ts';
import { usesSupabase, supabaseRpc } from "./supabase.ts";

import { createHash, randomBytes, scryptSync, timingSafeEqual, } from "node:crypto";
import type { NextRequest } from "next/server";
import { db, transaction } from "./db.ts";
import { fail } from "./validation.ts";
export const cookieName = "tray_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function secureEqual(a: string, b: string) {
    const aa = createHash("sha256").update(a).digest();
    const bb = createHash("sha256").update(b).digest();
    return timingSafeEqual(aa, bb);
}
export async function limit(key: string, max: number, windowMs: number) {
  if (usesSupabase()) { const result = await supabaseRpc("limit",{key,windowMs}); if (result.count>max) fail(429,"Muitas tentativas. Aguarde alguns minutos."); return; }
  const count = await transaction(async () => {
    const now = Date.now();
    (await db().prepare("DELETE FROM rate_limits WHERE expiresAt<?").run(now));
    (await db()
        .prepare("INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1")
        .run(key, now + windowMs));
    const r = (await db()
        .prepare("SELECT count FROM rate_limits WHERE key=?")
        .get(key)) as {
        count: number;
    };
    return r.count;
  });
  if (count > max)
        fail(429, "Muitas tentativas. Aguarde alguns minutos.");
}
export async function login(email: unknown, password: unknown):Promise<{token:string;expiresAt:string;refreshToken?:string}> {
    if(supabaseAuthEnabled()) return signInSupabase(email,password);
    const expectedEmail = process.env.ADMIN_EMAIL, expectedPassword = process.env.ADMIN_PASSWORD, hash = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedEmail || (!expectedPassword && !hash))
        fail(503, "Configure ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de entrar.");
    let valid = false;
    if (typeof password === "string" && password.length <= 1024) {
        if (hash) {
            const [salt, hex] = hash.split(":");
            if (salt && hex && /^[a-f0-9]{128}$/.test(hex))
                valid = secureEqual(scryptSync(password, salt, 64).toString("hex"), hex);
        }
        else
            valid = secureEqual(password, expectedPassword!);
    }
    if (typeof email !== "string" ||
        !secureEqual(email.toLowerCase().trim(), expectedEmail!.toLowerCase()) ||
        !valid)
        fail(401, "E-mail ou senha incorretos.");
    const token = randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 12 * 60 * 60000).toISOString();
    if (usesSupabase()) { await supabaseRpc("sessionCreate", {tokenHash:digest(token),expiresAt}); return {token,expiresAt}; }
    (await db()
        .prepare("DELETE FROM sessions WHERE expiresAt<?")
        .run(new Date().toISOString()));
    (await db()
        .prepare("INSERT INTO sessions VALUES(?,?)")
        .run(digest(token), expiresAt));
    return { token, expiresAt };
}
export function localScreenshotAccess(request: NextRequest): boolean {
    if (process.env.LOCAL_SCREENSHOT_MODE !== "true" || process.env.NODE_ENV !== "development" || process.env.VERCEL)
        return false;
    try {
        const target = new URL(request.url);
        const host = new URL(`http://${request.headers.get("host") || ""}`);
        return target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
            && ["localhost", "127.0.0.1", "[::1]"].includes(host.hostname);
    } catch { return false; }
}
export async function requestAuth(request: NextRequest):Promise<AuthState> {
    if(localScreenshotAccess(request)) return {authenticated:true};
    if(supabaseAuthEnabled()) return resolveSupabaseAuth(request.cookies.get(cookieName)?.value,request.cookies.get(refreshCookieName)?.value);
    return {authenticated:await legacyAuthenticated(request)};
}
export async function authenticated(request: NextRequest) {return (await requestAuth(request)).authenticated;}
async function legacyAuthenticated(request: NextRequest) {
    if (localScreenshotAccess(request)) return true;
    const token = request.cookies.get(cookieName)?.value;
    if (!token)
        return false;
    if (usesSupabase()) return supabaseRpc<boolean>("sessionFind", {tokenHash:digest(token)});
    return !!(await db()
        .prepare("SELECT tokenHash FROM sessions WHERE tokenHash=? AND expiresAt>?")
        .get(digest(token), new Date().toISOString()));
}
export async function requireAuth(request: NextRequest) {
    const state=await requestAuth(request);
    if (!state.authenticated) fail(401, "Entre na sua conta para continuar.");
    return state;
}
export async function logout(request: NextRequest) {
    if(supabaseAuthEnabled()) {await signOutSupabase(request.cookies.get(cookieName)?.value,request.cookies.get(refreshCookieName)?.value);return;}
    const token = request.cookies.get(cookieName)?.value;
    if (token && usesSupabase()) { await supabaseRpc("sessionDelete",{tokenHash:digest(token)}); return; }
    if (token)
        (await db().prepare("DELETE FROM sessions WHERE tokenHash=?").run(digest(token)));
}
export function sameOrigin(request: NextRequest) {
    const origin = request.headers.get("origin"), expected = new URL(process.env.APP_URL || request.url).origin;
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
