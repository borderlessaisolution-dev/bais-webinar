import { NextResponse } from "next/server";
import { commerce, markPaid } from "@/lib/commerce";
import { verifyStripe } from "@/lib/payments";

/**
 * Stripe → Developers → Webhooks → Add endpoint
 * URL: https://你的域名/api/pay/stripe/webhook
 * Events: checkout.session.completed, checkout.session.async_payment_succeeded,
 *         checkout.session.async_payment_failed, checkout.session.expired
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyStripe(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }
  const evt = JSON.parse(raw);
  const s = evt.data?.object ?? {};
  const orderId = s.metadata?.order_id || s.client_reference_id;
  const c = commerce();
  const order = orderId ? await c.getOrder(orderId) : await c.findOrderByRef(s.id);
  if (!order) return NextResponse.json({ ok: true, note: "order not found" });

  switch (evt.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      if (s.payment_status === "paid") await markPaid(order, s.id);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      if (order.status === "pending") await c.updateOrder(order.id, { status: "expired" });
      break;
  }
  return NextResponse.json({ ok: true });
}
