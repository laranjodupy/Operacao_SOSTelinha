export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "Envie um objeto JSON válido.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
) {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, `${label}: informe um texto de até ${max} caracteres.`);
  return (value as string).trim();
}
export function integer(
  value: unknown,
  label: string,
  min = 0,
  max = 1_000_000,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    fail(400, `${label}: valor inválido (${min} a ${max}).`);
  return value as number;
}
export function phone(value: unknown) {
  const digits = text(value, "Telefone", 24).replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits))
    fail(400, "Informe o telefone com DDI e DDD.");
  return digits;
}
export function flag(value: unknown, label: string) {
  if (typeof value !== "boolean")
    fail(400, `${label}: informe verdadeiro ou falso.`);
  return value as boolean;
}
