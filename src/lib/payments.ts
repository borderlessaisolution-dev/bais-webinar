import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { WebinarConfig } from "./config";
import { commerce, markPaid, HOLD_MINUTES } from "./commerce";
import type { Order } from "./types";

/**
 * 付款通道：
 * - 设了 STRIPE_SECRET_KEY → Stripe Checkout（FPX 网银 / 信用卡 / GrabPay，由 Stripe 后台开关）
 * - 本地开发 或 PAYMENT_PROVIDER=mock → 测试付款页（不会真的扣钱）
 */
export type Provider = "stripe" | "mock";
export function provider(): Provider | null {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.PAYMENT_PROVIDER === "mock" || process.env.NODE_ENV !== "production") return "mock";
  return null;
}

const SECRET = () => process.env.APP_SECRET || process.env.LIVEKIT_API_SECRET || "dev-secret";
/** 订单查询凭证：只有拿到这个 token 的人能看订单 */
export function orderToken(id: string) {
  return createHmac("sha256", SECRET()).update("order:" + id).digest("base64url").slice(0, 24);
}
export function checkOrderToken(id: string, k: string | null) {
  if (!k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(orderToken(id));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function siteOrigin(req: Request) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function startPayment(order: Order, w: WebinarConfig, sessionLabel: string, origin: string) {
  const k = orderToken(order.id);
  const done = `${origin}/checkout/${w.slug}/done?order=${order.id}&k=${k}`;
  const p = provider();
  if (p === "mock") return { url: `${origin}/pay/mock?order=${order.id}&k=${k}&slug=${w.slug}`, ref: null };
  if (p !== "stripe") throw new Error("付款还没开通，请联系主办方");

  const form = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": order.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(order.amount),
    "line_items[0][price_data][product_data][name]": w.offer.title,
    "line_items[0][price_data][product_data][description]": `${sessionLabel} · 订单 ${order.code}`,
    customer_email: order.email,
    client_reference_id: order.id,
    "metadata[order_id]": order.id,
    "metadata[order_code]": order.code,
    "payment_intent_data[metadata][order_id]": order.id,
    "payment_intent_data[description]": `${w.offer.title} · ${order.code}`,
    success_url: `${done}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/${w.slug}?cancelled=${order.id}&k=${k}`,
    expires_at: String(Math.floor(Date.now() / 1000) + (HOLD_MINUTES - 2) * 60),
    locale: "auto",
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Stripe 出错");
  await commerce().updateOrder(order.id, { provider_ref: data.id });
  return { url: data.url as string, ref: data.id as string };
}

/** webhook 慢的时候，成功页会主动去 Stripe 问一次 */
export async function syncStripe(order: Order) {
  if (order.provider !== "stripe" || !order.provider_ref || order.status === "paid") return order;
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${order.provider_ref}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) return order;
  const s = await res.json();
  if (s.payment_status === "paid") {
    await markPaid(order);
    return { ...order, status: "paid" as const };
  }
  if (s.status === "expired" && order.status === "pending") {
    await commerce().updateOrder(order.id, { status: "expired" });
    return { ...order, status: "expired" as const };
  }
  return order;
}

/** 验证 Stripe webhook 签名（Stripe-Signature: t=...,v1=...） */
export function verifyStripe(raw: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const sigs = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
