import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";
import { bad, isHost } from "@/lib/server";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = req.headers.get("x-host-key") ?? u.searchParams.get("key");
  const h = new Headers();
  if (key) h.set("x-host-key", key);
  if (!isHost(new Request(req.url, { headers: h }))) return bad("没有权限", 401);

  const slug = u.searchParams.get("slug") ?? "";
  const c = commerce();
  const [orders, sessions] = await Promise.all([c.listOrders(slug), c.sessions(slug)]);
  const label = new Map(sessions.map((s) => [s.id, s.label]));
  const now = Date.now();
  const rows = orders.map((o) => ({
    ...o,
    status: o.status === "pending" && new Date(o.hold_expires_at).getTime() < now ? ("expired" as const) : o.status,
    session_label: label.get(o.session_id) ?? "-",
  }));

  if (u.searchParams.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["订单号", "状态", "名字", "Email", "WhatsApp", "上课日期", "金额", "下单时间", "付款时间", "来源"];
    const lines = rows.map((o) =>
      [o.code, o.status, o.name, o.email, o.phone, o.session_label, (o.amount / 100).toFixed(2), o.created_at, o.paid_at, o.source]
        .map(esc)
        .join(",")
    );
    return new NextResponse("﻿" + [head.map(esc).join(","), ...lines].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="orders-${slug}.csv"`,
      },
    });
  }

  const paid = rows.filter((o) => o.status === "paid");
  return NextResponse.json({
    paidCount: paid.length,
    revenue: paid.reduce((s, o) => s + o.amount, 0),
    pendingCount: rows.filter((o) => o.status === "pending").length,
    orders: rows.slice(0, 300),
  });
}
