import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
if (existsSync(".env.local")) loadEnvFile(".env.local");
if (process.env.DATABASE_URL || process.env.SUPABASE_URL) throw new Error("Este comando é somente para SQLite. Use as ferramentas de backup do PostgreSQL/Supabase.");
const source = process.env.DATABASE_PATH || "./data/tray-balcao.sqlite";
if (!existsSync(source)) throw new Error("O banco ainda não existe.");
mkdirSync("backups", { recursive: true });
const destination = resolve(
  "backups",
  `tray-balcao-${new Date().toISOString().replaceAll(":", "-")}.sqlite`,
);
const db = new DatabaseSync(source);
db.prepare("VACUUM INTO ?").run(destination);
db.close();
console.log(`Backup criado: ${destination}`);
