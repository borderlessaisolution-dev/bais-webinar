import { NextResponse } from "next/server";
import { commerce, markPaid } from "@/lib/commerce";
import { checkOrderToken, provider } from "@/lib/payments";
import { bad } from "@/lib/server";

/** 测试付款（只有没接 Stripe 时才能用） */
export async function POST(req: Request) {
  if (provider() !== "mock") return bad("测试付款已关闭", 403);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? "");
  if (!checkOrderToken(id, b.k ?? null)) return bad("没有权限", 401);
  const c = commerce();
  const o = await c.getOrder(id);
  if (!o) return bad("找不到订单", 404);
  if (b.result === "paid") await markPaid(o, `mock_${Date.now()}`);
  else if (o.status === "pending") await c.updateOrder(id, { status: "cancelled" });
  return NextResponse.json({ ok: true });
}
