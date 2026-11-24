import { NextResponse } from "next/server";
import { bad, isHost, toPublic } from "@/lib/server";
import { store } from "@/lib/store";
import type { LiveState } from "@/lib/types";

/**
 * 老师控制台的动作：start / refresh / close / reveal / leaderboard / idle / reset
 * 回传新的 state，老师端再通过 LiveKit data channel 广播给所有学员。
 */
export async function POST(req: Request) {
  if (!isHost(req)) return bad("没有权限", 401);
  const b = await req.json().catch(() => ({}));
  const slug = String(b.slug ?? "");
  const action = String(b.action ?? "");
  const s = store();
  const cur = await s.getState(slug);
  const v = Date.now();
  let next: LiveState = cur;
  let answered = 0;

  if (action === "start") {
    const act = await s.getActivity(String(b.activityId));
    if (!act) return bad("找不到题目", 404);
    const zeros = act.options.map(() => 0);
    next =
      act.type === "poll"
        ? { kind: "poll", v, activity: toPublic(act), startedAt: v, closed: false, counts: zeros }
        : {
            kind: "quiz",
            v,
            activity: toPublic(act),
            startedAt: v,
            phase: "question",
            correctIndex: null,
            counts: zeros,
          };
  } else if (action === "refresh" || action === "close" || action === "reveal") {
    if (cur.kind !== "poll" && cur.kind !== "quiz") return NextResponse.json({ state: cur, answered });
    const counts = await s.counts(cur.activity.id, cur.activity.options.length);
    answered = counts.reduce((a, c) => a + c, 0);
    if (cur.kind === "poll") {
      next = { ...cur, v, counts, closed: cur.closed || action === "close" };
    } else if (action === "reveal") {
      const act = await s.getActivity(cur.activity.id);
      next = { ...cur, v, counts, phase: "reveal", correctIndex: act?.correct_index ?? null };
    } else {
      // quiz 进行中：票数只给老师看，不广播（避免学员跟风）
      return NextResponse.json({ state: cur, answered, hostCounts: counts });
    }
  } else if (action === "leaderboard") {
    next = { kind: "leaderboard", v, top: await s.leaderboard(slug, 10) };
  } else if (action === "idle") {
    next = { kind: "idle", v };
  } else if (action === "reset") {
    await s.resetResponses(slug);
    next = { kind: "idle", v };
  } else {
    return bad("未知动作");
  }

  await s.setState(slug, next);
  return NextResponse.json({ state: next, answered });
}
