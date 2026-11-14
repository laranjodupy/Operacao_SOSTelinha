import { CustomerCheckout } from "@/components/customer-checkout";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CustomerCheckout token={token} />;
}
