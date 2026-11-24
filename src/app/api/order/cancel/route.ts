import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";
import { checkOrderToken } from "@/lib/payments";
import { bad } from "@/lib/server";

/** 学员在付款页按「返回」→ 马上释放名额 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!checkOrderToken(id, b.k ?? null)) return bad("没有权限", 401);
  const c = commerce();
  const o = await c.getOrder(id);
  if (o && o.status === "pending") {
    if (o.provider === "stripe" && o.provider_ref && process.env.STRIPE_SECRET_KEY) {
      // 让 Stripe 那边的付款页也失效，避免取消后又付款
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${o.provider_ref}/expire`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      }).catch(() => {});
    }
    await c.updateOrder(id, { status: "cancelled" });
  }
  return NextResponse.json({ ok: true });
}
