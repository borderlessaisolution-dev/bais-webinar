import { NextResponse } from "next/server";
import { bad, isHost } from "@/lib/server";
import { store } from "@/lib/store";


export async function GET(req: Request) {
  const u = new URL(req.url);
  // CSV 下载用 ?key=（浏览器直接打开链接带不了 header）
  const key = req.headers.get("x-host-key") ?? u.searchParams.get("key");
  const h = new Headers(req.headers);
  if (key) h.set("x-host-key", key);
  if (!isHost(new Request(req.url, { headers: h }))) return bad("没有权限", 401);

  const slug = u.searchParams.get("slug") ?? "";
  const rows = await store().listRegistrations(slug);

  if (u.searchParams.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["报名时间", "名字", "Email", "WhatsApp", "国家", "兴趣", "来源", "广告活动", "进入教室时间"];
    const lines = rows.map((r) =>
      [r.created_at, r.name, r.email, r.phone, r.country, r.interest, r.utm_source, r.utm_campaign, r.joined_at]
        .map(esc)
        .join(",")
    );
    return new NextResponse("﻿" + [head.map(esc).join(","), ...lines].join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="registrations-${slug}.csv"`,
      },
    });
  }
  return NextResponse.json({
    total: rows.length,
    joined: rows.filter((r) => r.joined_at).length,
    rows: rows.slice(0, 500),
  });
}
