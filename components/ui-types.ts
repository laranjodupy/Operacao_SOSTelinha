export type Tab =
  | "overview"
  | "inbox"
  | "catalog"
  | "orders"
  | "integrations"
  | "settings";
export type Notice = (message: string, error?: boolean) => void;

export const time = (d: string) =>
  new Date(d).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
export const date = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  });
export const tone = (s: string) =>
  ["paid", "ready", "delivered"].includes(s)
    ? "green"
    : s === "pending"
      ? "amber"
      : s === "preparing"
        ? "blue"
        : "neutral";
