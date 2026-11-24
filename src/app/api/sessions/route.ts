import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";

/** 公开：可选的开课日期和剩余名额 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const list = (await commerce().sessions(slug))
    .filter((s) => s.active && new Date(s.starts_at).getTime() > Date.now())
    .map((s) => ({
      id: s.id,
      label: s.label,
      starts_at: s.starts_at,
      location: s.location,
      capacity: s.capacity,
      seats_left: s.seats_left,
    }));
  return NextResponse.json({ sessions: list });
}
