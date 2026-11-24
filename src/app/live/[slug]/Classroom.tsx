"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useDataChannel,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import type { WebinarConfig } from "@/lib/config";
import type { ChatMsg, LiveState } from "@/lib/types";
import { api, dec, enc, fmtDate, loadPass, savePass } from "@/lib/client";
import {
  ChatInput,
  ChatList,
  FloaterLayer,
  Leaderboard,
  ResultBars,
  Stage,
  TILES,
  TimerRing,
  useFloaters,
  useRemaining,
} from "@/components/live";

type Conn = { token: string; url: string; name: string; id: string; pass: string };
type MyAnswer = { choice: number; points: number; correct: boolean | null; pending?: boolean };

export default function Classroom({ w }: { w: WebinarConfig }) {
  const [conn, setConn] = useState<Conn | null>(null);
  const [checking, setChecking] = useState(true);
  const [contact, setContact] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const join = useCallback(
    async (body: { pass?: string; contact?: string }) => {
      setBusy(true);
      setErr("");
      try {
        const r = await api<Conn>("/api/join", { slug: w.slug, ...body });
        savePass(w.slug, r.pass, r.name);
        setConn(r);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
        setChecking(false);
      }
    },
    [w.slug]
  );

  useEffect(() => {
    const saved = loadPass(w.slug);
    if (saved) join({ pass: saved.pass });
    else setChecking(false);
  }, [w.slug, join]);

  if (!conn) {
    const when = fmtDate(w.startAt);
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-5 text-white">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold tracking-wider text-white/60">{w.brand}</p>
          <h1 className="mt-1 text-2xl font-bold">🔴 {w.title}</h1>
          <p className="mt-1 text-sm text-white/70">
            {when.date} · {when.time}
          </p>
          {checking ? (
            <p className="mt-8 text-white/70">正在进入教室…</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join({ contact });
              }}
              className="mt-7 rounded-2xl bg-white p-5 text-slate-900"
            >
              <label className="block text-sm font-medium">
                输入报名时的 WhatsApp 号码或 Email
                <input
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="012-345 6789 或 you@email.com"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base outline-none focus:border-brand"
                />
              </label>
              {err && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {err}
                  {err.includes("找不到") && (
                    <>
                      {" "}
                      ·{" "}
                      <a className="font-semibold underline" href={`/w/${w.slug}`}>
                        还没报名？点这里
                      </a>
                    </>
                  )}
                </p>
              )}
              <button disabled={busy} className="mt-4 w-full rounded-xl bg-brand py-3.5 font-bold text-white disabled:opacity-60">
                {busy ? "进入中…" : "进入直播教室"}
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: true }}
      className="h-dvh"
    >
      <Room w={w} me={conn} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Room({ w, me }: { w: WebinarConfig; me: Conn }) {
  const room = useRoomContext();
  const connState = useConnectionState();
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  const [state, setState] = useState<LiveState>({ kind: "idle", v: 0 });
  const [offset, setOffset] = useState(0);
  const [count, setCount] = useState(0);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [tab, setTab] = useState<"act" | "chat">("chat");
  const floaters = useFloaters();
  const ansKey = `bais-ans-${w.slug}-${me.id}`;
  const [answers, setAnswers] = useState<Record<string, MyAnswer>>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      setAnswers(JSON.parse(localStorage.getItem(ansKey) || "{}"));
    } catch {}
  }, [ansKey]);
  useEffect(() => {
    try {
      localStorage.setItem(ansKey, JSON.stringify(answers));
    } catch {}
  }, [answers, ansKey]);

  const stateRef = useRef(state);
  const applyState = useCallback((s: LiveState) => {
    const cur = stateRef.current;
    if (s.v < cur.v) return; // 旧消息不理
    const key = (x: LiveState) => ("activity" in x ? x.activity.id : x.kind);
    if (s.kind === "idle") setTab("chat");
    else if (key(s) !== key(cur)) setTab("act"); // 新题目自动跳到互动 tab
    stateRef.current = s;
    setState(s);
  }, []);

  const fetchState = useCallback(async () => {
    const t0 = Date.now();
    const r = await api<{ state: LiveState; now: number }>(`/api/state?slug=${w.slug}`).catch(() => null);
    if (!r) return;
    const rtt = Date.now() - t0;
    setOffset(r.now + rtt / 2 - Date.now());
    applyState(r.state);
  }, [w.slug, applyState]);

  useEffect(() => {
    fetchState();
    const upd = () => setCount(room.numParticipants);
    upd();
    const t = setInterval(upd, 3000);
    room.on(RoomEvent.Reconnected, fetchState);
    room.on(RoomEvent.ParticipantConnected, upd).on(RoomEvent.ParticipantDisconnected, upd);
    return () => {
      clearInterval(t);
      room.off(RoomEvent.Reconnected, fetchState);
      room.off(RoomEvent.ParticipantConnected, upd).off(RoomEvent.ParticipantDisconnected, upd);
    };
  }, [room, fetchState]);

  useDataChannel("state", (m) => {
    if (m.from?.identity !== "host") return; // 只听老师的
    try {
      applyState(JSON.parse(dec.decode(m.payload)));
    } catch {}
  });

  const pushMsg = (m: ChatMsg) => setMsgs((c) => [...c.slice(-120), m]);
  const chat = useDataChannel("chat", (m) => {
    try {
      const p = JSON.parse(dec.decode(m.payload));
      pushMsg({
        id: p.id,
        text: String(p.text).slice(0, 200),
        name: m.from?.name || "学员",
        host: m.from?.identity === "host",
        ts: Date.now(),
      });
    } catch {}
  });
  const react = useDataChannel("react", (m) => floaters.add(dec.decode(m.payload).slice(0, 4)));

  function sendChat(text: string) {
    const id = crypto.randomUUID();
    chat.send(enc.encode(JSON.stringify({ id, text })), { reliable: true, topic: "chat" }).catch(() => {});
    pushMsg({ id, text, name: me.name, ts: Date.now() });
  }
  function sendEmoji(e: string) {
    floaters.add(e);
    react.send(enc.encode(e), { reliable: false, topic: "react" }).catch(() => {});
  }

  async function answer(activityId: string, choice: number) {
    if (answers[activityId]) return;
    setAnswers((a) => ({ ...a, [activityId]: { choice, points: 0, correct: null, pending: true } }));
    try {
      const r = await api<{ correct: boolean | null; points: number }>("/api/answer", {
        slug: w.slug,
        pass: me.pass,
        activityId,
        choice,
      });
      setAnswers((a) => ({ ...a, [activityId]: { choice, points: r.points, correct: r.correct } }));
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("已经回答")) {
        setAnswers((a) => {
          const n = { ...a };
          delete n[activityId];
          return n;
        });
      }
      setToast(msg);
      setTimeout(() => setToast(""), 2500);
    }
  }

  // 抢答还没公布前，不把这题的分数算进总分（不然学员会提早知道对错）
  const hiddenId = state.kind === "quiz" && state.phase === "question" ? state.activity.id : null;
  const total = Object.entries(answers).reduce((s, [id, a]) => s + (id === hiddenId ? 0 : a.points || 0), 0);
  const hasAct = state.kind !== "idle";

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col bg-white md:grid md:grid-cols-[1fr_360px] md:grid-rows-[auto_1fr]">
      {/* Header */}
      <header className="flex items-center gap-2 bg-ink px-3 py-2 text-white md:col-span-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-white/60">{w.brand}</p>
          <p className="truncate text-sm font-semibold">{w.title}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-white" /> LIVE
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums">👀 {Math.max(count, 1)}</span>
        <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-bold text-ink tabular-nums">⭐ {total}</span>
      </header>

      {/* 左边：画面 + 互动 */}
      <section className="flex min-h-0 flex-col md:overflow-y-auto">
        <div className="relative">
          <Stage compact={hasAct && tab === "act"} />
          <FloaterLayer items={floaters.items} />
          {!canPlayAudio && (
            <button
              onClick={startAudio}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-5 py-3 font-bold text-ink shadow-xl"
            >
              🔊 点击开启声音
            </button>
          )}
          {connState !== ConnectionState.Connected && (
            <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
              {connState === ConnectionState.Reconnecting ? "网络重连中…" : "连接中…"}
            </div>
          )}
        </div>

        {/* 手机：互动/聊天 tab */}
        {hasAct && (
          <div className="flex border-b border-slate-200 text-sm font-semibold md:hidden">
            {(
              [
                ["act", state.kind === "leaderboard" ? "🏆 排行榜" : state.kind === "poll" ? "📊 投票" : "⚡ 抢答"],
                ["chat", "💬 聊天"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`flex-1 py-2.5 ${tab === k ? "border-b-2 border-brand text-brand" : "text-slate-400"}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {hasAct && (
          <div className={`${tab === "act" ? "flex-1" : "hidden"} min-h-0 overflow-y-auto p-4 md:block md:flex-none`}>
            <ActivityPanel state={state} offset={offset} answers={answers} onAnswer={answer} meId={me.id} total={total} />
          </div>
        )}
        {!hasAct && (
          <div className="hidden p-6 text-center text-sm text-slate-400 md:block">老师出题时，题目会出现在这里 ⚡</div>
        )}

        {/* 手机版聊天 */}
        <div className={`${!hasAct || tab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:hidden`}>
          <ChatList msgs={msgs} />
        </div>
        <div className="md:hidden">
          <ChatInput onSend={sendChat} onEmoji={sendEmoji} />
        </div>
      </section>

      {/* 桌面版聊天 */}
      <aside className="hidden min-h-0 flex-col border-l border-slate-200 md:flex">
        <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">💬 聊天室</p>
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatList msgs={msgs} />
        </div>
        <ChatInput onSend={sendChat} onEmoji={sendEmoji} />
      </aside>

      {toast && (
        <div className="pop-in fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function ActivityPanel({
  state,
  offset,
  answers,
  onAnswer,
  meId,
  total,
}: {
  state: LiveState;
  offset: number;
  answers: Record<string, MyAnswer>;
  onAnswer: (id: string, choice: number) => void;
  meId: string;
  total: number;
}) {
  const remaining = useRemaining(state, offset);

  if (state.kind === "leaderboard") {
    const rank = state.top.findIndex((t) => t.id === meId);
    return (
      <div className="pop-in">
        <h3 className="mb-4 text-center text-lg font-extrabold">🏆 排行榜 Top 10</h3>
        <Leaderboard top={state.top} meId={meId} />
        <p className="mt-4 text-center text-sm text-slate-500">
          我的分数 <b className="text-slate-900">{total}</b>
          {rank >= 0 ? ` · 第 ${rank + 1} 名 🎉` : " · 继续加油！"}
        </p>
      </div>
    );
  }
  if (state.kind === "idle") return null;

  const a = state.activity;
  const mine = answers[a.id];

  if (state.kind === "poll") {
    const showResults = !!mine || state.closed;
    return (
      <div className="pop-in" key={a.id}>
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">📊 投票</span>
          <span className="text-xs text-slate-400">{state.closed ? "已截止" : "进行中"}</span>
        </div>
        <h3 className="mb-4 text-lg font-bold leading-snug">{a.question}</h3>
        {showResults ? (
          <ResultBars options={a.options} counts={state.counts} mine={mine?.choice} />
        ) : (
          <div className="space-y-2">
            {a.options.map((o, i) => (
              <button
                key={i}
                onClick={() => onAnswer(a.id, i)}
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-left text-[15px] font-medium transition active:scale-[0.98] active:border-brand"
              >
                {o}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // quiz
  const total_ms = a.duration_sec * 1000;
  if (state.phase === "reveal") {
    const right = mine?.correct;
    return (
      <div className="pop-in" key={a.id + "r"}>
        <div
          className={`mb-4 rounded-2xl p-4 text-center text-white ${
            !mine ? "bg-slate-500" : right ? "bg-k-green" : "bg-k-red"
          }`}
        >
          <div className="text-3xl">{!mine ? "⏰" : right ? "🎉" : "😅"}</div>
          <div className="mt-1 text-xl font-extrabold">
            {!mine ? "这题没有作答" : right ? `答对了！+${mine.points}` : "答错了，下一题加油！"}
          </div>
          <div className="mt-1 text-sm text-white/80">总分 {total}</div>
        </div>
        <h3 className="mb-3 font-bold leading-snug">{a.question}</h3>
        <ResultBars options={a.options} counts={state.counts} correctIndex={state.correctIndex} mine={mine?.choice} kahoot />
      </div>
    );
  }

  const timeUp = remaining <= 0;
  return (
    <div className="pop-in" key={a.id}>
      <div className="mb-3 flex items-center gap-3">
        <TimerRing ms={remaining} total={total_ms} />
        <div className="min-w-0">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">⚡ 限时抢答</span>
          <h3 className="mt-1 text-lg font-bold leading-snug">{a.question}</h3>
        </div>
      </div>
      {mine ? (
        <div className="rounded-2xl bg-slate-50 p-5 text-center">
          <div className={`mx-auto mb-3 grid h-16 w-16 place-items-center rounded-xl text-2xl text-white ${TILES[mine.choice].bg}`}>
            {TILES[mine.choice].shape}
          </div>
          <p className="font-bold">{mine.pending ? "提交中…" : "已提交 ✔"}</p>
          <p className="text-sm text-slate-500">等老师公布答案…</p>
        </div>
      ) : timeUp ? (
        <div className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">⏰ 时间到！</div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {a.options.map((o, i) => (
            <button
              key={i}
              onClick={() => onAnswer(a.id, i)}
              className={`${TILES[i].bg} flex min-h-[80px] flex-col items-start justify-between rounded-xl p-3 text-left text-white shadow-md transition active:scale-95`}
            >
              <span className="text-xl">{TILES[i].shape}</span>
              <span className="text-[15px] font-bold leading-tight">{o}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
