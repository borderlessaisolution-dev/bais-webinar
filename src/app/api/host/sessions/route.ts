import { NextResponse } from "next/server";
import { commerce } from "@/lib/commerce";
import { bad, isHost } from "@/lib/server";

export async function GET(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  return NextResponse.json({ sessions: await commerce().sessions(slug) });
}

export async function POST(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const b = await req.json().catch(() => ({}));
  const label = String(b.label ?? "").trim().slice(0, 80);
  const startsAt = new Date(String(b.starts_at ?? ""));
  const capacity = Math.max(1, Math.min(10000, Math.round(Number(b.capacity) || 0)));
  if (!label) return bad("请填写名称");
  if (isNaN(startsAt.getTime())) return bad("请填写开课时间");
  const s = await commerce().upsertSession({
    ...(b.id ? { id: String(b.id) } : {}),
    webinar_slug: String(b.slug),
    label,
    starts_at: startsAt.toISOString(),
    location: String(b.location ?? "").trim().slice(0, 160),
    capacity,
    active: b.active !== false,
  });
  return NextResponse.json({ session: s });
}

export async function DELETE(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("缺少 id");
  return NextResponse.json({ result: await commerce().deleteSession(id) });
}
