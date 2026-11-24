import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";
import { store } from "@/lib/store";

/** 学员刚进来 / 重新连线时，拿目前的互动状态 + 报名弹窗开关 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const [state, offer] = await Promise.all([store().getState(slug), commerce().getOffer(slug)]);
  return NextResponse.json({ state, offer, now: Date.now() });
}
