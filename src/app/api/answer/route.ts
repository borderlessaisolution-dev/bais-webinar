import { NextResponse } from "next/server";
import { bad, verifyAttendee } from "@/lib/server";
import { store } from "@/lib/store";

const GRACE_MS = 1500; // 网络延迟宽限

/** 学员作答。Quiz 计分仿 Kahoot：答对 500–1000 分，越快越高。 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug ?? "");
  const regId = verifyAttendee(b.pass);
  if (!regId) return bad("请先进入教室", 401);

  const s = store();
  const st = await s.getState(slug);
  const choice = Number(b.choice);
  if (st.kind !== "poll" && st.kind !== "quiz") return bad("目前没有题目");
  if (st.activity.id !== b.activityId) return bad("这一题已经结束");
  if (!Number.isInteger(choice) || choice < 0 || choice >= st.activity.options.length)
    return bad("选项不对");

  const elapsed = Math.max(0, Date.now() - st.startedAt);
  let correct: boolean | null = null;
  let points = 0;

  if (st.kind === "poll") {
    if (st.closed) return bad("投票已截止");
  } else {
    const limit = st.activity.duration_sec * 1000;
    if (st.phase !== "question" || elapsed > limit + GRACE_MS) return bad("时间到了");
    const act = await s.getActivity(st.activity.id);
    correct = act?.correct_index === choice;
    points = correct ? Math.round(1000 * (1 - Math.min(elapsed, limit) / limit / 2)) : 0;
  }

  const res = await s.addResponse({
    webinar_slug: slug,
    activity_id: st.activity.id,
    registration_id: regId,
    choice,
    correct,
    points,
    elapsed_ms: elapsed,
  });
  if (res === "duplicate") return bad("已经回答过了", 409);
  return NextResponse.json({ ok: true, correct, points });
}
