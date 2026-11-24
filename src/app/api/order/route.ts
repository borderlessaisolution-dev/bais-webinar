import { NextResponse } from "next/server";
import { getWebinar } from "@/lib/config";
import { commerce } from "@/lib/commerce";
import { checkOrderToken, syncStripe } from "@/lib/payments";
import { bad } from "@/lib/server";

/** 成功页轮询订单状态 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ?? "";
  if (!checkOrderToken(id, u.searchParams.get("k"))) return bad("没有权限", 401);
  const c = commerce();
  let o = await c.getOrder(id);
  if (!o) return bad("找不到订单", 404);
  o = await syncStripe(o);
  const expired = o.status === "pending" && new Date(o.hold_expires_at).getTime() < Date.now();
  const s = (await c.sessions(o.webinar_slug)).find((x) => x.id === o.session_id);
  const w = getWebinar(o.webinar_slug);
  return NextResponse.json({
    code: o.code,
    status: expired ? "expired" : o.status,
    name: o.name,
    email: o.email,
    amount: o.amount,
    currency: o.currency,
    course: w?.offer.title,
    session: s ? { label: s.label, starts_at: s.starts_at, location: s.location } : null,
    paid_at: o.paid_at,
  });
}
