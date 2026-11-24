import { NextResponse } from "next/server";
import { getWebinar } from "@/lib/config";
import { commerce, SeatError } from "@/lib/commerce";
import { provider, siteOrigin, startPayment } from "@/lib/payments";
import { bad, verifyAttendee } from "@/lib/server";
import { normPhone } from "@/lib/store";

/** 选好日期 → 锁位 35 分钟 → 回传付款网址 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const w = getWebinar(String(b.slug ?? ""));
  if (!w) return bad("课程不存在", 404);
  const p = provider();
  if (!p) return bad("付款还没开通，请联系主办方");

  const name = String(b.name ?? "").trim().slice(0, 60);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
  const phone = normPhone(String(b.phone ?? ""));
  if (name.length < 2) return bad("请填写名字");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Email 格式不对");
  if (phone.length < 9 || phone.length > 15) return bad("WhatsApp 号码不对");
  if (!b.sessionId) return bad("请选上课日期");

  const c = commerce();
  const sessions = await c.sessions(w.slug);
  const s = sessions.find((x) => x.id === b.sessionId);
  if (!s || !s.active || new Date(s.starts_at).getTime() < Date.now()) return bad("这个日期已经关闭");

  try {
    const order = await c.createOrder({
      slug: w.slug,
      sessionId: s.id,
      registrationId: verifyAttendee(b.pass),
      name,
      email,
      phone,
      amount: w.offer.priceCents,
      currency: w.offer.currency,
      provider: p,
      source: b.source ? String(b.source).slice(0, 40) : null,
    });
    try {
      const pay = await startPayment(order, w, s.label, siteOrigin(req));
      return NextResponse.json({ url: pay.url, orderId: order.id, code: order.code });
    } catch (e) {
      // 付款通道出错 → 把名额还回去
      await c.updateOrder(order.id, { status: "cancelled" });
      throw e;
    }
  } catch (e) {
    if (e instanceof SeatError) return bad(e.message, 409);
    console.error(e);
    return bad((e as Error).message || "出错了，请再试一次", 500);
  }
}
