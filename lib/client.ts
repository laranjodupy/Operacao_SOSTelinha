export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const result = await response
    .json()
    .catch(() => ({ error: "O servidor não respondeu como esperado." }));
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir a operação.");
  return result as T;
}
export const request = (
  method: string,
  value?: unknown,
  key?: string,
): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
  headers: key ? { "idempotency-key": key } : {},
});
