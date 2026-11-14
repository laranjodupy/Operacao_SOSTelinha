export type Product = {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  stock: number;
  reserved: number;
  available: number;
  category: string;
  active: boolean;
  createdAt: string;
};
export type Message = {
  id: string;
  direction: "in" | "out";
  text: string;
  status: string;
  createdAt: string;
};
export type Conversation = {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
  unread: number;
  updatedAt: string;
  messages: Message[];
};
export type OrderStatus =
  | "pending"
  | "paid"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled"
  | "expired";
export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
};
export type Order = {
  id: string;
  number: string;
  customerName: string;
  conversationId: string | null;
  token: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  delivery: "pickup" | "local";
  address: string;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
};
export type Settings = {
  name: string;
  segment: string;
  address: string;
  phone: string;
  pickupMinutes: number;
  deliveryFee: number;
  deliveryEnabled: boolean;
  welcome: string;
};
export type IntegrationState = {
  ai: string;
  whatsapp: string;
  n8n: boolean;
  cloudflare: boolean;
  whatsappConfigured: boolean;
  demo: boolean;
  webhookPath: string;
};
export type Audit = {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
};
export type Snapshot = {
  products: Product[];
  conversations: Conversation[];
  orders: Order[];
  settings: Settings;
  integrations: IntegrationState;
  audit: Audit[];
  metrics: {
    revenue: number;
    paid: number;
    pending: number;
    lowStock: number;
    conversion: number;
  };
};
export const statusLabels: Record<OrderStatus, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  preparing: "Em preparação",
  ready: "Pronto para retirada",
  delivered: "Concluído",
  cancelled: "Cancelado",
  expired: "Link expirado",
};
export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
