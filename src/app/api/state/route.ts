import { NextResponse } from "next/server";
import { store } from "@/lib/store";


/** 学员刚进来 / 重新连线时，拿目前的互动状态 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const state = await store().getState(slug);
  return NextResponse.json({ state, now: Date.now() });
}
