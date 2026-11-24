import { NextResponse } from "next/server";
import { sampleActivities } from "@/lib/samples";
import { bad, isHost } from "@/lib/server";
import { store } from "@/lib/store";


export async function GET(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const s = store();
  let list = await s.listActivities(slug);
  if (list.length === 0) {
    for (const a of sampleActivities(slug)) await s.upsertActivity(a);
    list = await s.listActivities(slug);
  }
  return NextResponse.json({ activities: list });
}

export async function POST(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const b = await req.json().catch(() => ({}));
  const type = b.type === "quiz" ? "quiz" : "poll";
  const options = (Array.isArray(b.options) ? b.options : [])
    .map((o: unknown) => String(o).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 4);
  const question = String(b.question ?? "").trim().slice(0, 200);
  if (!question) return bad("请填写题目");
  if (options.length < 2) return bad("至少要 2 个选项");
  const ci = Number(b.correct_index);
  if (type === "quiz" && !(ci >= 0 && ci < options.length)) return bad("请选正确答案");

  const a = await store().upsertActivity({
    ...(b.id ? { id: String(b.id) } : {}),
    webinar_slug: String(b.slug),
    type,
    question,
    options,
    correct_index: type === "quiz" ? ci : null,
    duration_sec: Math.min(120, Math.max(5, Number(b.duration_sec) || (type === "quiz" ? 15 : 30))),
    sort: Number(b.sort) || Date.now() % 1e9,
  });
  return NextResponse.json({ activity: a });
}

export async function DELETE(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const id = new URL(req.url).searchParams.get("id");
  if (id) await store().deleteActivity(id);
  return NextResponse.json({ ok: true });
}
