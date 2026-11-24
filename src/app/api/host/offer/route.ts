import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";
import { bad, isHost } from "@/lib/server";

/** 开 / 关 直播中的「正式课程报名」弹窗 */
export async function POST(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const b = await req.json().catch(() => ({}));
  const offer = await commerce().setOffer(String(b.slug ?? ""), !!b.open);
  return NextResponse.json({ offer });
}
