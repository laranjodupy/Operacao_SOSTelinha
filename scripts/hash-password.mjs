import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline/promises";
// Read from stdin so a password need not appear in the shell command history.
if (process.stdin.isTTY)
  console.error(
    "Digite a senha (entrada visível neste terminal) e pressione Enter:",
  );
const rl = createInterface({ input: process.stdin, output: process.stderr });
let password = "";
for await (const line of rl) {
  password = line;
  rl.close();
  break;
}
if (password.length < 12) throw new Error("Use pelo menos 12 caracteres.");
const salt = randomBytes(16).toString("hex");
console.log(`${salt}:${scryptSync(password, salt, 64).toString("hex")}`);
